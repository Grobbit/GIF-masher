import { describe, expect, it } from 'vitest';
import { decodeGif, GifDecodeError, readGifInfo } from '../src/core/decode';
import { buildGif, fill } from './gifBuilder';
import { pixelAt } from './helpers';

const RED: [number, number, number] = [255, 0, 0];
const GREEN: [number, number, number] = [0, 255, 0];
const BLUE: [number, number, number] = [0, 0, 255];
const PALETTE: [number, number, number][] = [RED, GREEN, BLUE, [0, 0, 0]];

describe('decodeGif compositing', () => {
  it('overlays a partial frame onto the previous one', () => {
    const gif = buildGif(
      [
        { indices: fill([0], 16), delayCs: 5, disposal: 1 },
        {
          // 2x2 green patch at (1,1) on a 4x4 canvas.
          indices: fill([1], 4),
          left: 1,
          top: 1,
          width: 2,
          height: 2,
          delayCs: 5,
          disposal: 1,
        },
      ],
      { width: 4, height: 4, palette: PALETTE },
    );

    const decoded = decodeGif(gif);
    expect(decoded.frames).toHaveLength(2);
    // Frame 1 is plain red.
    expect(pixelAt(decoded.frames[0].data, 4, 0, 0)).toEqual([255, 0, 0, 255]);
    // Frame 2 keeps red around the green patch, which is the whole point of
    // compositing before resizing.
    const frame2 = decoded.frames[1].data;
    expect(pixelAt(frame2, 4, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(frame2, 4, 1, 1)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(frame2, 4, 2, 2)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(frame2, 4, 3, 3)).toEqual([255, 0, 0, 255]);
  });

  it('honours the transparent index inside a patch', () => {
    const gif = buildGif(
      [
        { indices: fill([0], 16), delayCs: 5, disposal: 1 },
        {
          // 2x2 patch where index 1 is transparent: nothing changes.
          indices: [1, 1, 1, 1],
          left: 1,
          top: 1,
          width: 2,
          height: 2,
          delayCs: 5,
          disposal: 1,
          transparent: true,
          transparentIndex: 1,
        },
      ],
      { width: 4, height: 4, palette: PALETTE },
    );
    const decoded = decodeGif(gif);
    expect(pixelAt(decoded.frames[1].data, 4, 1, 1)).toEqual([255, 0, 0, 255]);
  });

  it('clears the frame rect after display for disposal method 2', () => {
    const gif = buildGif(
      [
        { indices: fill([0], 16), delayCs: 5, disposal: 2 },
        {
          indices: fill([1], 4),
          left: 1,
          top: 1,
          width: 2,
          height: 2,
          delayCs: 5,
          disposal: 2,
        },
      ],
      { width: 4, height: 4, palette: PALETTE },
    );
    const decoded = decodeGif(gif);
    // The first frame is still fully red...
    expect(pixelAt(decoded.frames[0].data, 4, 0, 0)).toEqual([255, 0, 0, 255]);
    // ...but its pixels were cleared before frame 2 was drawn.
    expect(pixelAt(decoded.frames[1].data, 4, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(decoded.frames[1].data, 4, 1, 1)).toEqual([0, 255, 0, 255]);
  });

  it('restores the previous canvas for disposal method 3', () => {
    const gif = buildGif(
      [
        { indices: fill([0], 16), delayCs: 5, disposal: 1 },
        { indices: fill([2], 16), delayCs: 5, disposal: 3 },
        { indices: fill([1], 4), left: 0, top: 0, width: 2, height: 2, delayCs: 5, disposal: 1 },
      ],
      { width: 4, height: 4, palette: PALETTE },
    );
    const decoded = decodeGif(gif);
    expect(pixelAt(decoded.frames[1].data, 4, 0, 0)).toEqual([0, 0, 255, 255]);
    // Frame 3 is drawn on the restored (red) canvas, so the rest is red again.
    expect(pixelAt(decoded.frames[2].data, 4, 3, 3)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(decoded.frames[2].data, 4, 0, 0)).toEqual([0, 255, 0, 255]);
  });

  it('supports local colour tables', () => {
    const gif = buildGif(
      [
        { indices: fill([0], 4), delayCs: 5 },
        {
          indices: fill([0], 4),
          delayCs: 5,
          palette: [
            [10, 20, 30],
            [40, 50, 60],
          ],
        },
      ],
      { width: 2, height: 2, palette: PALETTE },
    );
    const decoded = decodeGif(gif);
    expect(pixelAt(decoded.frames[1].data, 2, 0, 0)).toEqual([10, 20, 30, 255]);
  });

  it('reads the Netscape loop count', () => {
    const gif = buildGif([{ indices: fill([0], 4), delayCs: 5 }], {
      width: 2,
      height: 2,
      palette: PALETTE,
      loop: 7,
    });
    expect(decodeGif(gif).loop).toBe(7);
    expect(readGifInfo(gif).loop).toBe(7);
  });
});

describe('decodeGif errors', () => {
  it('rejects a PNG', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(() => decodeGif(png)).toThrow(GifDecodeError);
    expect(() => readGifInfo(png)).toThrow(/not a GIF/i);
  });

  it('reports truncated GIFs instead of throwing something obscure', () => {
    const gif = buildGif([{ indices: fill([0], 16), delayCs: 5 }], {
      width: 4,
      height: 4,
      palette: PALETTE,
    });
    expect(() => readGifInfo(gif.slice(0, 20))).toThrow(GifDecodeError);
  });
});
