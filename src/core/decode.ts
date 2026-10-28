/**
 * GIF decoding built on `gifuct-js`.
 *
 * Browsers hand us GIFs whose frames are often stored as small patches with
 * transparency plus a disposal method. `gifuct-js` exposes those patches, so
 * this module replays the GIF state machine and returns *fully composited*
 * frames. That is what makes mashing reliable: two GIFs with completely
 * different frame encodings combine cleanly once every frame is a plain RGBA
 * bitmap.
 */

import { decompressFrames, parseGIF } from 'gifuct-js';
import type { DecodedGif, RGBAFrame } from './types';

export class GifDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GifDecodeError';
  }
}

export interface GifInfo {
  width: number;
  height: number;
  frameCount: number;
  durationMs: number;
  /** Delay of each frame in milliseconds (indexed like the decoded frames). */
  frameDelaysMs: number[];
  loop: number;
}

export const LOOP_FOREVER = 0;
export const LOOP_ONCE = -1;

/** gifuct types claim `blocks` is a number[] but at runtime it is a byte stream object. */
type LooseBlocks = number[] | Record<string, number> | undefined;

function blockByte(blocks: LooseBlocks, index: number): number {
  if (!blocks) return 0;
  const value = (blocks as Record<string, number>)[index];
  return typeof value === 'number' ? value : 0;
}

function readLoopCount(parsed: ReturnType<typeof parseGIF>): number {
  for (const frame of parsed.frames) {
    if ('application' in frame && frame.application && frame.application.id === 'NETSCAPE2.0') {
      const blocks = frame.application.blocks as LooseBlocks;
      const low = blockByte(blocks, 1);
      const high = blockByte(blocks, 2);
      return low | (high << 8);
    }
  }
  // No NETSCAPE application extension at all means the GIF plays once.
  return LOOP_ONCE;
}

function toUint8Array(bytes: Uint8Array): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBufferLike);
}

/** Is this buffer a GIF? Used to validate dropped files. */
export function isGif(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 6 &&
    bytes[0] === 0x47 && // G
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x38 && // 8
    (bytes[4] === 0x37 || bytes[4] === 0x39) // 7 or 9
  );
}

function parseBytes(bytes: Uint8Array) {
  if (!isGif(bytes)) {
    throw new GifDecodeError('That file is not a GIF (missing GIF87a/GIF89a signature).');
  }
  // parseGIF needs an ArrayBuffer that starts exactly at the GIF header.
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  try {
    return parseGIF(buffer);
  } catch (error) {
    throw new GifDecodeError(
      `Could not read the GIF structure: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Cheap metadata read: parses the block structure but never decompresses pixels. */
export function readGifInfo(bytes: Uint8Array): GifInfo {
  const parsed = parseBytes(toUint8Array(bytes));
  const frameDelaysMs: number[] = [];
  let durationMs = 0;
  for (const frame of parsed.frames) {
    if ('image' in frame && frame.image) {
      // gifuct applies the same "0 means 10cs" rule browsers use.
      const delayCs = frame.gce?.delay || 10;
      const delayMs = delayCs * 10;
      frameDelaysMs.push(delayMs);
      durationMs += delayMs;
    }
  }
  if (frameDelaysMs.length === 0) {
    throw new GifDecodeError('That GIF does not contain any image frames.');
  }
  return {
    width: parsed.lsd.width,
    height: parsed.lsd.height,
    frameCount: frameDelaysMs.length,
    durationMs,
    frameDelaysMs,
    loop: readLoopCount(parsed),
  };
}

/**
 * Decode every frame of a GIF into a fully composited RGBA bitmap.
 *
 * Note: each frame is a full-canvas copy, so memory use is roughly
 * `frames * width * height * 4` bytes. Callers should release the result once
 * it has been rasterised.
 */
export function decodeGif(bytes: Uint8Array): DecodedGif {
  const parsed = parseBytes(toUint8Array(bytes));
  const width = parsed.lsd.width;
  const height = parsed.lsd.height;
  if (width <= 0 || height <= 0) {
    throw new GifDecodeError('That GIF reports a zero-sized canvas.');
  }

  let rawFrames;
  try {
    rawFrames = decompressFrames(parsed, true);
  } catch (error) {
    throw new GifDecodeError(
      `Could not decompress the GIF frames: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (rawFrames.length === 0) {
    throw new GifDecodeError('That GIF does not contain any image frames.');
  }

  const canvas = new Uint8Array(width * height * 4);
  const frames: RGBAFrame[] = [];

  for (const frame of rawFrames) {
    const { dims, patch, disposalType } = frame;
    const snapshot = disposalType === 3 ? canvas.slice() : null;

    // Draw the patch onto the canvas (transparent pixels leave it untouched).
    const patchWidth = dims.width;
    const patchHeight = dims.height;
    const destLeft = dims.left;
    const destTop = dims.top;
    for (let y = 0; y < patchHeight; y++) {
      const destY = destTop + y;
      if (destY < 0 || destY >= height) continue;
      for (let x = 0; x < patchWidth; x++) {
        const destX = destLeft + x;
        if (destX < 0 || destX >= width) continue;
        const pi = (y * patchWidth + x) * 4;
        if (patch[pi + 3] === 0) continue;
        const di = (destY * width + destX) * 4;
        canvas[di] = patch[pi];
        canvas[di + 1] = patch[pi + 1];
        canvas[di + 2] = patch[pi + 2];
        canvas[di + 3] = 255;
      }
    }

    frames.push({
      data: canvas.slice(),
      width,
      height,
      delayMs: frame.delay, // gifuct already converts centiseconds to milliseconds
    });

    // Apply the disposal method for the *next* frame.
    if (disposalType === 2) {
      clearRect(canvas, width, height, destLeft, destTop, patchWidth, patchHeight);
    } else if (disposalType === 3 && snapshot) {
      canvas.set(snapshot);
    }
  }

  return { width, height, loop: readLoopCount(parsed), frames };
}

function clearRect(
  canvas: Uint8Array,
  width: number,
  height: number,
  left: number,
  top: number,
  rectWidth: number,
  rectHeight: number,
): void {
  const x0 = Math.max(0, left);
  const x1 = Math.min(width, left + rectWidth);
  const y0 = Math.max(0, top);
  const y1 = Math.min(height, top + rectHeight);
  if (x1 <= x0) return;
  for (let y = y0; y < y1; y++) {
    const start = (y * width + x0) * 4;
    const end = (y * width + x1) * 4;
    canvas.fill(0, start, end);
  }
}
