/**
 * The mash pipeline.
 *
 * Sources are processed strictly in the order they are handed over: every frame
 * of source 1, then every frame of source 2, and so on. There is no sorting, no
 * shuffling and no parallelism that could reorder frames.
 *
 * Rough flow per source:
 *   decode (full composited RGBA frames) -> rasterise into the shared canvas
 *   -> quantise + LZW encode into the single output GIF stream.
 * Each source's decoded frames are dropped as soon as it is done, so memory
 * stays proportional to one clip rather than to the whole mash.
 */

import { GifDecodeError, decodeGif, readGifInfo } from './decode';
import type { GifInfo } from './decode';
import { createGifWriter } from './encode';
import { expandFrames, normalizeDelayMs, resolveCanvasSize, sourceFit } from './plan';
import { resolveBackground, transformFrame } from './raster';
import type {
  MashOptions,
  MashProgress,
  MashResult,
  MashSourceInput,
  MashWarning,
} from './types';

export interface MashHooks {
  onProgress?: (progress: MashProgress) => void;
  onWarning?: (warning: MashWarning) => void;
}

export interface MashSource extends MashSourceInput {
  name?: string;
}

/** Upper bound on output frames; keeps a stray 10k-frame GIF from hanging the tab. */
export const MAX_OUTPUT_FRAMES = 4000;
/** Beyond this the encoder gets slow enough that the tab feels frozen. */
export const MAX_EDGE = 2400;

/** Give the host (browser UI or worker message loop) a chance to breathe. */
function yieldToHost(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function labelFor(source: MashSource, index: number): string {
  return source.name ?? `GIF ${index + 1}`;
}

/**
 * Combine GIFs into a single GIF, in the given order.
 *
 * @throws GifDecodeError when a source cannot be decoded
 * @throws Error for invalid options (no sources, too many frames, ...)
 */
export async function mashGifs(
  sources: MashSource[],
  options: MashOptions,
  hooks: MashHooks = {},
): Promise<MashResult> {
  if (sources.length === 0) {
    throw new Error('Add at least one GIF before mashing.');
  }

  const warnings: MashWarning[] = [];
  const warn = (sourceIndex: number, message: string) => {
    const warning = { sourceIndex, message };
    warnings.push(warning);
    hooks.onWarning?.(warning);
  };
  const report = (progress: number, stage: string, framesDone: number, framesTotal: number) => {
    hooks.onProgress?.({
      progress: Math.min(1, Math.max(0, progress)),
      stage,
      framesDone,
      framesTotal,
    });
  };

  // ---------------------------------------------------------------------------
  // 1. Read the metadata of every source (cheap: block structure only).
  // ---------------------------------------------------------------------------
  report(0, 'Reading GIFs', 0, 0);
  const infos: GifInfo[] = [];
  for (let i = 0; i < sources.length; i++) {
    try {
      infos.push(readGifInfo(sources[i].bytes));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GifDecodeError(`${labelFor(sources[i], i)}: ${message}`);
    }
  }

  const resolved = resolveCanvasSize(infos, options);
  let width = Math.max(1, Math.round(options.width ?? resolved.width));
  let height = Math.max(1, Math.round(options.height ?? resolved.height));
  if (Math.max(width, height) > MAX_EDGE) {
    const scale = MAX_EDGE / Math.max(width, height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    warn(0, `Output canvas was capped to ${width}x${height}px to keep encoding fast.`);
  }

  // ---------------------------------------------------------------------------
  // 2. Plan the exact frame sequence (real per-frame delays) before encoding.
  // ---------------------------------------------------------------------------
  const delaysBySource = infos.map((info) => info.frameDelaysMs);
  const planned = expandFrames(delaysBySource, sources, options);
  if (planned.length === 0) {
    throw new Error('Nothing to encode: the selected GIFs produced zero frames.');
  }
  if (planned.length > MAX_OUTPUT_FRAMES) {
    throw new Error(
      `That mash would produce ${planned.length.toLocaleString()} frames; ` +
        `the limit is ${MAX_OUTPUT_FRAMES.toLocaleString()}. Lower the repeats or use shorter clips.`,
    );
  }
  const totalFrames = planned.length;

  // ---------------------------------------------------------------------------
  // 3. Encode.
  // ---------------------------------------------------------------------------
  const background = resolveBackground(options.background, options.backgroundColor);
  const writer = createGifWriter(width, height, {
    loop: options.loop,
    maxColors: options.maxColors,
  });
  const canvasBuffer = new Uint8Array(width * height * 4);

  let framesDone = 0;
  let cursor = 0;
  const speed = options.speed > 0 ? options.speed : 1;

  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
    const source = sources[sourceIndex];
    const info = infos[sourceIndex];
    const runStart = cursor;
    while (cursor < planned.length && planned[cursor].sourceIndex === sourceIndex) cursor++;
    const run = planned.slice(runStart, cursor);
    if (run.length === 0) continue;

    const name = labelFor(source, sourceIndex);
    report(framesDone / totalFrames, `Decoding ${name}`, framesDone, totalFrames);
    await yieldToHost();

    let decoded;
    try {
      decoded = decodeGif(source.bytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GifDecodeError(`${name}: ${message}`);
    }

    const averageDelay = info.durationMs / Math.max(1, info.frameCount);
    if (averageDelay < 20 && options.frameDelayMs === null) {
      warn(
        sourceIndex,
        `${name} has frames under 20ms; they were raised to the browser minimum.`,
      );
    }
    if (info.durationMs / speed > 120_000) {
      warn(sourceIndex, `${name} is over two minutes long; the result will be a big GIF.`);
    }

    const fit = sourceFit(source, options);

    for (let i = 0; i < run.length; i++) {
      const plannedFrame = run[i];
      const frame = decoded.frames[Math.min(plannedFrame.frameIndex, decoded.frames.length - 1)];

      transformFrame({
        src: frame.data,
        srcWidth: decoded.width,
        srcHeight: decoded.height,
        dst: canvasBuffer,
        dstWidth: width,
        dstHeight: height,
        fit,
        background,
      });

      writer.addFrame(canvasBuffer, normalizeDelayMs(plannedFrame.delayMs));
      framesDone++;

      // Yield periodically so progress UI / worker messages stay responsive.
      if (framesDone % 4 === 0 || framesDone === totalFrames) {
        report(framesDone / totalFrames, `Encoding ${name}`, framesDone, totalFrames);
        await yieldToHost();
      }
    }

    // Drop this clip's pixels before decoding the next one.
    decoded.frames.length = 0;
  }

  report(1, 'Writing GIF', totalFrames, totalFrames);
  const bytes = writer.finish();
  const durationMs = planned.reduce((sum, frame) => sum + normalizeDelayMs(frame.delayMs), 0);

  return {
    bytes,
    mimeType: 'image/gif',
    width,
    height,
    frameCount: totalFrames,
    durationMs,
    byteLength: bytes.byteLength,
    warnings,
  };
}
