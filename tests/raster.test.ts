import { describe, expect, it } from 'vitest';
import {
  computeFitRect,
  hasTransparency,
  parseHexColor,
  resolveBackground,
  transformFrame,
} from '../src/core/raster';
import { pixelAt } from './helpers';

const RED: [number, number, number, number] = [255, 0, 0, 255];
const BLUE: [number, number, number, number] = [0, 0, 255, 255];

function solid(width: number, height: number, color: [number, number, number, number]) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(color, i * 4);
  return data;
}

describe('computeFitRect', () => {
  it('letterboxes with contain', () => {
    const rect = computeFitRect({ width: 100, height: 50 }, { width: 100, height: 100 }, 'contain');
    expect(rect).toEqual({ x: 0, y: 25, width: 100, height: 50 });
  });

  it('crops with cover', () => {
    const rect = computeFitRect({ width: 100, height: 50 }, { width: 100, height: 100 }, 'cover');
    expect(rect).toEqual({ x: -50, y: 0, width: 200, height: 100 });
  });

  it('fills with stretch', () => {
    expect(computeFitRect({ width: 10, height: 40 }, { width: 20, height: 20 }, 'stretch')).toEqual({
      x: 0,
      y: 0,
      width: 20,
      height: 20,
    });
  });
});

describe('transformFrame', () => {
  it('draws a letterboxed frame with transparent bars', () => {
    // A 10x20 clip in a 20x20 canvas keeps its aspect ratio: a 10x20 block
    // centred horizontally, leaving 5px transparent bars on each side.
    const dst = new Uint8Array(20 * 20 * 4);
    transformFrame({
      src: solid(10, 20, RED),
      srcWidth: 10,
      srcHeight: 20,
      dst,
      dstWidth: 20,
      dstHeight: 20,
      fit: 'contain',
      background: null,
    });
    expect(pixelAt(dst, 20, 0, 10)[3]).toBe(0);
    expect(pixelAt(dst, 20, 4, 10)[3]).toBe(0);
    expect(pixelAt(dst, 20, 5, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(dst, 20, 14, 19)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(dst, 20, 15, 10)[3]).toBe(0);
  });

  it('fills bars with the background colour', () => {
    const dst = new Uint8Array(20 * 20 * 4);
    transformFrame({
      src: solid(10, 20, BLUE),
      srcWidth: 10,
      srcHeight: 20,
      dst,
      dstWidth: 20,
      dstHeight: 20,
      fit: 'contain',
      background: [0, 0, 0],
    });
    expect(pixelAt(dst, 20, 0, 10)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(dst, 20, 10, 10)).toEqual([0, 0, 255, 255]);
  });

  it('averages source pixels when shrinking a checkerboard', () => {
    // 8x8 black/white checkerboard shrunk to 2x2 must come out mid-grey,
    // not pure black or pure white.
    const src = new Uint8Array(8 * 8 * 4);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const value = (x + y) % 2 === 0 ? 255 : 0;
        const i = (y * 8 + x) * 4;
        src[i] = value;
        src[i + 1] = value;
        src[i + 2] = value;
        src[i + 3] = 255;
      }
    }
    const dst = new Uint8Array(2 * 2 * 4);
    transformFrame({
      src,
      srcWidth: 8,
      srcHeight: 8,
      dst,
      dstWidth: 2,
      dstHeight: 2,
      fit: 'stretch',
      background: null,
    });
    for (let i = 0; i < 4; i++) {
      const value = dst[i * 4];
      expect(value).toBeGreaterThan(100);
      expect(value).toBeLessThan(160);
      expect(dst[i * 4 + 3]).toBe(255);
    }
  });

  it('reuses the destination buffer without leaking the previous frame', () => {
    const dst = new Uint8Array(4 * 4 * 4);
    // Frame 1 covers everything in red.
    transformFrame({
      src: solid(4, 4, RED),
      srcWidth: 4,
      srcHeight: 4,
      dst,
      dstWidth: 4,
      dstHeight: 4,
      fit: 'stretch',
      background: null,
    });
    expect(pixelAt(dst, 4, 0, 0)).toEqual([255, 0, 0, 255]);
    // Frame 2 is a narrow clip letterboxed in the same buffer.
    transformFrame({
      src: solid(1, 2, BLUE),
      srcWidth: 1,
      srcHeight: 2,
      dst,
      dstWidth: 4,
      dstHeight: 4,
      fit: 'contain',
      background: null,
    });
    expect(pixelAt(dst, 4, 0, 0)[3]).toBe(0);
    expect(pixelAt(dst, 4, 1, 0)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(dst, 4, 2, 3)).toEqual([0, 0, 255, 255]);
  });

  it('snaps semi-transparent edges to 1-bit alpha', () => {
    // Half of the row opaque, half transparent: after upscaling the alpha
    // averages to ~50%, which must become fully transparent (GIF has no
    // partial alpha) rather than a grey halo.
    const src = new Uint8Array(2 * 1 * 4);
    src.set([255, 0, 0, 255], 0);
    src.set([0, 0, 0, 0], 4);
    const dst = new Uint8Array(4 * 1 * 4);
    transformFrame({
      src,
      srcWidth: 2,
      srcHeight: 1,
      dst,
      dstWidth: 4,
      dstHeight: 1,
      fit: 'stretch',
      background: null,
    });
    expect(dst[3]).toBe(255);
    expect(dst[15]).toBe(0);
  });

  it('handles zero-sized sources without throwing', () => {
    const dst = new Uint8Array(4);
    expect(() =>
      transformFrame({
        src: new Uint8Array(0),
        srcWidth: 0,
        srcHeight: 0,
        dst,
        dstWidth: 1,
        dstHeight: 1,
        fit: 'contain',
        background: null,
      }),
    ).not.toThrow();
    expect(Array.from(dst)).toEqual([0, 0, 0, 0]);
  });
});

describe('colour helpers', () => {
  it('parses hex colours', () => {
    expect(parseHexColor('#ff8000')).toEqual([255, 128, 0]);
    expect(parseHexColor('f00')).toEqual([255, 0, 0]);
    expect(parseHexColor('nope')).toEqual([0, 0, 0]);
  });

  it('resolves background modes', () => {
    expect(resolveBackground('transparent', '#123456')).toBeNull();
    expect(resolveBackground('white', '#123456')).toEqual([255, 255, 255]);
    expect(resolveBackground('black', '#123456')).toEqual([0, 0, 0]);
    expect(resolveBackground('custom', '#123456')).toEqual([0x12, 0x34, 0x56]);
  });

  it('detects transparency', () => {
    expect(hasTransparency(solid(2, 2, RED))).toBe(false);
    const withHole = solid(2, 2, RED);
    withHole[3] = 0;
    expect(hasTransparency(withHole)).toBe(true);
  });
});
