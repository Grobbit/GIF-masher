import { describe, expect, it } from 'vitest';
import { decodeGif, isGif, readGifInfo } from '../src/core/decode';
import { createGifWriter, prepareFrame } from '../src/core/encode';
import { closeTo, pixelAt, solidGif } from './helpers';

const RED: [number, number, number, number] = [255, 0, 0, 255];
const GREEN: [number, number, number, number] = [0, 255, 0, 255];
const BLUE: [number, number, number, number] = [0, 0, 255, 255];

describe('encode + decode round trip', () => {
  it('produces a valid GIF signature', () => {
    const bytes = solidGif([{ color: RED, delayMs: 100 }]);
    expect(isGif(bytes)).toBe(true);
    expect(Array.from(bytes.slice(0, 6))).toEqual([71, 73, 70, 56, 57, 97]);
  });

  it('preserves frame count, size and delays', () => {
    const bytes = solidGif(
      [
        { color: RED, delayMs: 100 },
        { color: GREEN, delayMs: 250 },
        { color: BLUE, delayMs: 40 },
      ],
      { width: 12, height: 6 },
    );
    const decoded = decodeGif(bytes);
    expect(decoded.width).toBe(12);
    expect(decoded.height).toBe(6);
    expect(decoded.frames).toHaveLength(3);
    expect(decoded.frames.map((f) => f.delayMs)).toEqual([100, 250, 40]);
    expect(closeTo(pixelAt(decoded.frames[0].data, 12, 0, 0), RED)).toBe(true);
    expect(closeTo(pixelAt(decoded.frames[1].data, 12, 0, 0), GREEN)).toBe(true);
    expect(closeTo(pixelAt(decoded.frames[2].data, 12, 0, 0), BLUE)).toBe(true);
  });

  it('keeps transparency transparent', () => {
    const bytes = solidGif([{ color: [0, 0, 0, 0], delayMs: 100 }], { width: 4, height: 4 });
    const decoded = decodeGif(bytes);
    expect(pixelAt(decoded.frames[0].data, 4, 1, 1)[3]).toBe(0);
  });

  it('round trips loop counts', () => {
    const gif = solidGif([{ color: RED, delayMs: 100 }], { loop: 3 });
    expect(readGifInfo(gif).loop).toBe(3);
    expect(readGifInfo(solidGif([{ color: RED, delayMs: 100 }], { loop: 0 })).loop).toBe(0);
    expect(readGifInfo(solidGif([{ color: RED, delayMs: 100 }], { loop: -1 })).loop).toBe(-1);
  });

  it('reports metadata without decoding pixels', () => {
    const gif = solidGif(
      [
        { color: RED, delayMs: 100 },
        { color: GREEN, delayMs: 100 },
      ],
      { width: 5, height: 7 },
    );
    const info = readGifInfo(gif);
    expect(info).toMatchObject({ width: 5, height: 7, frameCount: 2, durationMs: 200 });
    expect(info.frameDelaysMs).toEqual([100, 100]);
  });
});

describe('prepareFrame', () => {
  it('reserves palette index 0 for transparency', () => {
    // A gradient plus a transparent corner forces a palette where the
    // transparent entry is not necessarily first.
    const size = 16;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        data[i] = x * 16;
        data[i + 1] = y * 16;
        data[i + 2] = 128;
        data[i + 3] = x === 0 && y === 0 ? 0 : 255;
      }
    }
    const prepared = prepareFrame(data, 256);
    expect(prepared.transparent).toBe(true);
    expect(prepared.palette[0][3]).toBe(0);
    expect(prepared.index[0]).toBe(0);
    expect(prepared.index[1]).toBeGreaterThan(0);
  });

  it('skips alpha handling for fully opaque frames', () => {
    const data = new Uint8Array(4 * 4 * 4).fill(255);
    const prepared = prepareFrame(data, 32);
    expect(prepared.transparent).toBe(false);
    expect(prepared.palette.length).toBeLessThanOrEqual(32);
  });

  it('rejects mismatched frame buffers', () => {
    const writer = createGifWriter(4, 4, { loop: 0, maxColors: 256 });
    expect(() => writer.addFrame(new Uint8Array(8), 100)).toThrow(/size mismatch/i);
  });
});
