/**
 * GIF encoding built on `gifenc`.
 *
 * Each output frame gets its own optimised palette (up to 256 colours), which
 * keeps quality high when clips with very different colour ranges are mashed
 * together. Transparent frames are encoded with a 1-bit alpha palette and index
 * 0 reserved for "fully transparent", which is what GIF supports.
 */

import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import type { Palette } from 'gifenc';
import { hasTransparency } from './raster';

export interface GifWriterOptions {
  /** 0 = loop forever, -1 = play once, n > 0 = extra loops. */
  loop: number;
  /** Maximum colours per frame (2..256). */
  maxColors: number;
}

export interface GifWriter {
  addFrame(rgba: Uint8Array, delayMs: number): void;
  finish(): Uint8Array;
}

const TRANSPARENT: [number, number, number, number] = [0, 0, 0, 0];

function clampColors(maxColors: number): number {
  if (!Number.isFinite(maxColors)) return 256;
  return Math.min(256, Math.max(2, Math.floor(maxColors)));
}

interface PreparedFrame {
  index: Uint8Array;
  palette: Palette;
  transparent: boolean;
}

/**
 * Quantise one RGBA frame into an indexed bitmap plus its palette.
 *
 * gifenc writes the transparent index into the Graphic Control Extension, so to
 * use `transparentIndex: 0` we make sure the transparent colour really sits at
 * position 0, swapping entries (and remapping the indices) when needed.
 */
export function prepareFrame(rgba: Uint8Array, maxColors: number): PreparedFrame {
  const colors = clampColors(maxColors);
  const transparent = hasTransparency(rgba);

  if (!transparent) {
    const palette = quantize(rgba, colors, { format: 'rgb565' });
    const index = applyPalette(rgba, palette, 'rgb565');
    return { index, palette, transparent: false };
  }

  const palette = quantize(rgba, colors, {
    format: 'rgba4444',
    oneBitAlpha: true,
    clearAlpha: true,
    clearAlphaColor: 0x00,
  });

  let transparentIndex = palette.findIndex((color) => color.length > 3 && color[3] === 0);
  if (transparentIndex < 0) {
    // Quantiser merged every transparent pixel into an opaque colour; append one.
    if (palette.length >= 256) palette.length = 255;
    palette.push([...TRANSPARENT]);
    transparentIndex = palette.length - 1;
  }

  if (transparentIndex !== 0) {
    const first = palette[0];
    palette[0] = palette[transparentIndex];
    palette[transparentIndex] = first;
  }

  const index = applyPalette(rgba, palette, 'rgba4444');
  // Pin fully transparent pixels to the reserved index; GIF cannot store
  // partial alpha and nearest-colour matching is not always exact.
  for (let pixel = 0; pixel < index.length; pixel++) {
    if (rgba[pixel * 4 + 3] < 128) index[pixel] = 0;
  }

  return { index, palette, transparent: true };
}

/** Streaming GIF writer: push frames in order, then `finish()` once. */
export function createGifWriter(
  width: number,
  height: number,
  options: GifWriterOptions,
): GifWriter {
  const gif = GIFEncoder();
  const loop = Number.isFinite(options.loop) ? Math.trunc(options.loop) : 0;
  let frameCount = 0;

  return {
    addFrame(rgba, delayMs) {
      if (rgba.length !== width * height * 4) {
        throw new Error(
          `Frame size mismatch: expected ${width * height * 4} bytes, received ${rgba.length}.`,
        );
      }
      const { index, palette, transparent } = prepareFrame(rgba, options.maxColors);
      gif.writeFrame(index, width, height, {
        palette,
        delay: delayMs,
        // gifenc only uses `repeat` while writing the first frame's header.
        repeat: loop,
        transparent,
        transparentIndex: transparent ? 0 : undefined,
        // Disposal 2 ("restore to background") on *every* frame means each
        // frame is drawn on a clean canvas. Without it, a transparent area
        // would show the previous frame through it, which is almost never what
        // people expect from a mash.
        dispose: 2,
      });
      frameCount++;
    },
    finish() {
      gif.finish();
      return gif.bytes();
    },
  };
}

/** Convenience wrapper for a handful of frames (used by tests and the CLI). */
export function encodeFrames(
  frames: { data: Uint8Array; delayMs: number }[],
  width: number,
  height: number,
  options: GifWriterOptions,
): Uint8Array {
  const writer = createGifWriter(width, height, options);
  for (const frame of frames) writer.addFrame(frame.data, frame.delayMs);
  return writer.finish();
}
