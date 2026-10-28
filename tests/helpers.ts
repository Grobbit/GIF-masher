/** Test helpers: build known GIFs entirely in memory. */

import { createGifWriter } from '../src/core/encode';
import type { MashOptions } from '../src/core/types';
import { DEFAULT_OPTIONS } from '../src/core/types';

export interface SolidFrameSpec {
  /** Straight RGBA colour. */
  color: [number, number, number, number];
  delayMs: number;
}

export interface SolidGifOptions {
  width?: number;
  height?: number;
  loop?: number;
  maxColors?: number;
}

/** A GIF whose frames are a single flat colour, handy for asserting order. */
export function solidGif(frames: SolidFrameSpec[], opts: SolidGifOptions = {}): Uint8Array {
  const width = opts.width ?? 8;
  const height = opts.height ?? 8;
  const writer = createGifWriter(width, height, {
    loop: opts.loop ?? 0,
    maxColors: opts.maxColors ?? 256,
  });
  const frame = new Uint8Array(width * height * 4);
  for (const spec of frames) {
    for (let i = 0; i < width * height; i++) {
      frame[i * 4] = spec.color[0];
      frame[i * 4 + 1] = spec.color[1];
      frame[i * 4 + 2] = spec.color[2];
      frame[i * 4 + 3] = spec.color[3];
    }
    writer.addFrame(frame, spec.delayMs);
  }
  return writer.finish();
}

/** A GIF where each frame is a vertical stripe, used to check geometry. */
export function stripedGif(
  width: number,
  height: number,
  colors: [number, number, number, number][],
  delayMs = 100,
  loop = 0,
): Uint8Array {
  const writer = createGifWriter(width, height, { loop, maxColors: 256 });
  const frame = new Uint8Array(width * height * 4);
  const stripe = Math.max(1, Math.floor(width / colors.length));
  for (let x = 0; x < width; x++) {
    const color = colors[Math.min(colors.length - 1, Math.floor(x / stripe))];
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      frame[i] = color[0];
      frame[i + 1] = color[1];
      frame[i + 2] = color[2];
      frame[i + 3] = color[3];
    }
  }
  writer.addFrame(frame, delayMs);
  return writer.finish();
}

export function options(overrides: Partial<MashOptions> = {}): MashOptions {
  return { ...DEFAULT_OPTIONS, ...overrides };
}

/** Read the RGBA pixel at (x, y) from a flat buffer. */
export function pixelAt(
  data: Uint8Array,
  width: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

/** Colour similarity helper that tolerates palette quantisation. */
export function closeTo(
  actual: [number, number, number, number],
  expected: [number, number, number, number],
  tolerance = 12,
): boolean {
  return expected.every(
    (value, index) => Math.abs(value - actual[index]) <= (index === 3 ? 0 : tolerance),
  );
}
