/**
 * Pure planning helpers: canvas resolution, timing and the exact frame
 * sequence. Keeping this logic free of I/O lets the UI show a live estimate
 * that matches what the encoder will actually do.
 */

import { computeFitRect } from './raster';
import type { FitMode, MashOptions, MashPlan, PlannedFrame, SourceInfo } from './types';

export const MIN_FRAME_DELAY_MS = 20;
export const MAX_FRAME_DELAY_MS = 10_000;
export const MAX_CANVAS_EDGE = 2000;

/**
 * GIF stores delays in centiseconds, so everything is rounded to 10ms.
 * Delays below 20ms are clamped: they render inconsistently across browsers and
 * are almost always an authoring mistake.
 */
export function normalizeDelayMs(ms: number): number {
  // Browsers render anything under 20ms as ~100ms, so mirror that instead of
  // producing a GIF that plays differently in every viewer.
  if (!Number.isFinite(ms) || ms < MIN_FRAME_DELAY_MS) return 100;
  const clamped = Math.min(MAX_FRAME_DELAY_MS, ms);
  return Math.round(clamped / 10) * 10;
}

/** Apply the playback speed and delay override to one source frame delay. */
export function effectiveDelayMs(sourceDelayMs: number, options: MashOptions): number {
  const base =
    options.frameDelayMs === null || options.frameDelayMs === undefined
      ? sourceDelayMs
      : options.frameDelayMs;
  const speed = options.speed > 0 ? options.speed : 1;
  return normalizeDelayMs(base / speed);
}

/** How many times a source appears in the output (clamped to something sane). */
export function repeatCount(source: Pick<SourceInfo, 'options'>): number {
  const repeat = source.options?.repeat ?? 1;
  if (!Number.isFinite(repeat)) return 1;
  return Math.min(50, Math.max(1, Math.floor(repeat)));
}

export function sourceFit(source: Pick<SourceInfo, 'options'>, options: MashOptions): FitMode {
  return source.options?.fit ?? options.fit;
}

interface SizeLike {
  width: number;
  height: number;
}

/**
 * Work out the output canvas size.
 *
 * - `largest`: the biggest source wins -- nothing gets downscaled.
 * - `smallest`: the smallest source wins -- nothing gets upscaled.
 * - `fit-width` / `fit-height`: scale every source to one axis, so a row of
 *   clips shares a common width (or height) and the canvas grows in the other.
 * - `preset`: a fixed size.
 */
export function resolveCanvasSize(sources: SizeLike[], options: MashOptions): SizeLike {
  if (options.width && options.height) {
    return { width: options.width, height: options.height };
  }
  if (sources.length === 0) return { width: 1, height: 1 };

  const valid = sources.filter((s) => s.width > 0 && s.height > 0);
  if (valid.length === 0) return { width: 1, height: 1 };

  let width: number;
  let height: number;

  switch (options.canvasSize ?? 'largest') {
    case 'smallest':
      width = Math.min(...valid.map((s) => s.width));
      height = Math.min(...valid.map((s) => s.height));
      break;
    case 'fit-width': {
      // Keep the aspect ratio of the first source, but use the widest width.
      width = Math.max(...valid.map((s) => s.width));
      const base = valid[0];
      height = Math.round((width * base.height) / base.width);
      break;
    }
    case 'fit-height': {
      height = Math.max(...valid.map((s) => s.height));
      const base = valid[0];
      width = Math.round((height * base.width) / base.height);
      break;
    }
    case 'preset': {
      width = options.preset?.width ?? 480;
      height = options.preset?.height ?? 480;
      break;
    }
    case 'largest':
    default:
      width = Math.max(...valid.map((s) => s.width));
      height = Math.max(...valid.map((s) => s.height));
      break;
  }

  return { width, height };
}

/**
 * Build the full output frame sequence: sources in the order they were added,
 * each repeated the requested number of times, every frame with its final delay.
 * Nothing here is random or reordered.
 */
export function expandFrames(
  sourceDelays: number[][],
  sources: Pick<SourceInfo, 'options'>[],
  options: MashOptions,
): PlannedFrame[] {
  const frames: PlannedFrame[] = [];
  for (let s = 0; s < sourceDelays.length; s++) {
    const delays = sourceDelays[s];
    const repeat = repeatCount(sources[s] ?? { options: undefined });
    for (let r = 0; r < repeat; r++) {
      for (let f = 0; f < delays.length; f++) {
        frames.push({
          sourceIndex: s,
          frameIndex: f,
          delayMs: effectiveDelayMs(delays[f], options),
        });
        // Optional breathing room between *clips* (not between their frames,
        // and not after the final clip).
        const isLastFrameOfClip =
          f === delays.length - 1 && r === repeat - 1 && s < sourceDelays.length - 1;
        const gap = options.gapMs ?? 0;
        if (isLastFrameOfClip && gap > 0) {
          frames.push({
            sourceIndex: s,
            frameIndex: f, // hold the last frame for the gap duration
            delayMs: normalizeDelayMs(gap),
          });
        }
      }
    }
  }
  return frames;
}

/**
 * Cheap estimate used by the UI before encoding. Durations assume the source
 * plays at a constant frame rate, which is true for the overwhelming majority
 * of GIFs; the encoder reports the exact numbers afterwards.
 */
export function estimatePlan(sources: SourceInfo[], options: MashOptions): MashPlan {
  const size = resolveCanvasSize(sources, options);
  const delays = sources.map((source) => {
    const count = Math.max(1, source.frameCount);
    const average = source.durationMs / count;
    return Array.from<number>({ length: count }).fill(average);
  });
  const frames = expandFrames(delays, sources, options);
  const totalDurationMs = frames.reduce((sum, frame) => sum + frame.delayMs, 0);
  return {
    width: Math.round(size.width),
    height: Math.round(size.height),
    frames,
    totalDurationMs,
  };
}

/** Describe how a source sits inside the canvas, for the UI badges. */
export function describeFit(source: SizeLike, canvas: SizeLike, fit: FitMode) {
  const rect = computeFitRect(
    { width: source.width, height: source.height },
    { width: canvas.width, height: canvas.height },
    fit,
  );
  const scale = source.width > 0 ? rect.width / source.width : 1;
  return { rect, scale };
}
