import { describe, expect, it } from 'vitest';
import { decodeGif } from '../src/core/decode';
import { mashGifs } from '../src/core/mash';
import type { MashSource } from '../src/core/mash';
import { estimatePlan, normalizeDelayMs, resolveCanvasSize } from '../src/core/plan';
import { closeTo, options, pixelAt, solidGif, stripedGif } from './helpers';

const RED: [number, number, number, number] = [255, 0, 0, 255];
const GREEN: [number, number, number, number] = [0, 255, 0, 255];
const BLUE: [number, number, number, number] = [0, 0, 255, 255];
const WHITE: [number, number, number, number] = [255, 255, 255, 255];

function source(bytes: Uint8Array, name = 'clip.gif'): MashSource {
  return { bytes, name };
}

describe('mashGifs ordering', () => {
  it('appends clips in the exact order they were added', () => {
    const a = source(solidGif([{ color: RED, delayMs: 100 }, { color: RED, delayMs: 100 }]), 'a.gif');
    const b = source(solidGif([{ color: GREEN, delayMs: 100 }]), 'b.gif');
    const c = source(
      solidGif([
        { color: BLUE, delayMs: 100 },
        { color: BLUE, delayMs: 100 },
        { color: BLUE, delayMs: 100 },
      ]),
      'c.gif',
    );

    return mashGifs([a, b, c], options()).then((result) => {
      expect(result.frameCount).toBe(6);
      const decoded = decodeGif(result.bytes);
      const colours = decoded.frames.map((frame) => pixelAt(frame.data, decoded.width, 0, 0));
      expect(closeTo(colours[0], RED)).toBe(true);
      expect(closeTo(colours[1], RED)).toBe(true);
      expect(closeTo(colours[2], GREEN)).toBe(true);
      expect(closeTo(colours[3], BLUE)).toBe(true);
      expect(closeTo(colours[4], BLUE)).toBe(true);
      expect(closeTo(colours[5], BLUE)).toBe(true);
    });
  });

  it('is deterministic across repeated runs', async () => {
    const src = [
      source(solidGif([{ color: RED, delayMs: 60 }, { color: GREEN, delayMs: 60 }]), 'a.gif'),
      source(solidGif([{ color: BLUE, delayMs: 60 }]), 'b.gif'),
    ];
    const first = await mashGifs(src, options());
    const second = await mashGifs(src, options());
    expect(first.byteLength).toBe(second.byteLength);
    expect(Array.from(first.bytes)).toEqual(Array.from(second.bytes));
  });

  it('honours per-source repeat counts', async () => {
    const src = [
      { ...source(solidGif([{ color: RED, delayMs: 100 }]), 'a.gif'), options: { repeat: 3 } },
      source(solidGif([{ color: BLUE, delayMs: 100 }]), 'b.gif'),
    ];
    const result = await mashGifs(src, options());
    expect(result.frameCount).toBe(4);
    const decoded = decodeGif(result.bytes);
    const colours = decoded.frames.map((frame) => pixelAt(frame.data, decoded.width, 0, 0));
    expect(colours.slice(0, 3).every((c) => closeTo(c, RED))).toBe(true);
    expect(closeTo(colours[3], BLUE)).toBe(true);
  });
});

describe('mashGifs canvas and fitting', () => {
  it('uses the largest source by default and letterboxes smaller ones', async () => {
    const big = source(stripedGif(20, 20, [BLUE]), 'big.gif');
    const small = source(stripedGif(10, 20, [RED]), 'small.gif');
    const result = await mashGifs([big, small], options());
    expect(result.width).toBe(20);
    expect(result.height).toBe(20);

    const decoded = decodeGif(result.bytes);
    // Frame 1 is the small 10x20 clip centred: transparent at the edges.
    expect(pixelAt(decoded.frames[1].data, 20, 0, 10)[3]).toBe(0);
    expect(closeTo(pixelAt(decoded.frames[1].data, 20, 10, 10), RED)).toBe(true);
  });

  it('fills the letterbox with an opaque background when asked', async () => {
    const big = source(stripedGif(20, 20, [BLUE]), 'big.gif');
    const small = source(stripedGif(10, 20, [RED]), 'small.gif');
    const result = await mashGifs(
      [big, small],
      options({ background: 'white', canvasSize: 'preset', preset: { width: 20, height: 20 } }),
    );
    const decoded = decodeGif(result.bytes);
    const corner = pixelAt(decoded.frames[1].data, 20, 0, 10);
    expect(corner[3]).toBe(255);
    expect(closeTo(corner, WHITE, 4)).toBe(true);
  });

  it('cover crops instead of letterboxing', async () => {
    const wide = source(stripedGif(40, 10, [RED]), 'wide.gif');
    const result = await mashGifs([wide], options({ fit: 'cover' }), undefined);
    const decoded = decodeGif(result.bytes);
    expect(decoded.width).toBe(40);
    expect(decoded.height).toBe(10);
    expect(pixelAt(decoded.frames[0].data, 40, 20, 5)[3]).toBe(255);
  });

  it('stretch distorts to fill the canvas', async () => {
    const src = source(stripedGif(10, 10, [RED]), 'sq.gif');
    const result = await mashGifs([src], options({ width: 40, height: 10, fit: 'stretch' }));
    expect(result.width).toBe(40);
    const decoded = decodeGif(result.bytes);
    expect(closeTo(pixelAt(decoded.frames[0].data, 40, 39, 9), RED)).toBe(true);
  });

  it('supports per-source fit overrides', async () => {
    const small = source(stripedGif(10, 10, [RED]), 'small.gif');
    small.options = { fit: 'stretch' };
    const big = source(stripedGif(20, 20, [BLUE]), 'big.gif');
    const result = await mashGifs([small, big], options());
    const decoded = decodeGif(result.bytes);
    // Stretched source fills the whole 20x20 canvas.
    expect(closeTo(pixelAt(decoded.frames[0].data, 20, 1, 1), RED)).toBe(true);
  });

  it('resolves canvas sizes for each mode', () => {
    const sources = [
      { width: 100, height: 50 },
      { width: 40, height: 200 },
    ];
    expect(resolveCanvasSize(sources, options({ canvasSize: 'largest' }))).toEqual({
      width: 100,
      height: 200,
    });
    expect(resolveCanvasSize(sources, options({ canvasSize: 'smallest' }))).toEqual({
      width: 40,
      height: 50,
    });
    expect(resolveCanvasSize(sources, options({ canvasSize: 'fit-width' }))).toEqual({
      width: 100,
      height: 50,
    });
    expect(resolveCanvasSize(sources, options({ canvasSize: 'fit-height' }))).toEqual({
      width: 400,
      height: 200,
    });
    expect(
      resolveCanvasSize(sources, options({ canvasSize: 'preset', preset: { width: 320, height: 240 } })),
    ).toEqual({ width: 320, height: 240 });
  });
});

describe('mashGifs timing', () => {
  it('keeps source delays by default', async () => {
    const src = source(
      solidGif([
        { color: RED, delayMs: 50 },
        { color: GREEN, delayMs: 150 },
      ]),
    );
    const result = await mashGifs([src], options());
    const decoded = decodeGif(result.bytes);
    expect(decoded.frames.map((f) => f.delayMs)).toEqual([50, 150]);
    expect(result.durationMs).toBe(200);
  });

  it('applies playback speed', async () => {
    const src = source(solidGif([{ color: RED, delayMs: 200 }]));
    const result = await mashGifs([src], options({ speed: 2 }));
    expect(decodeGif(result.bytes).frames[0].delayMs).toBe(100);
  });

  it('applies a fixed frame delay override', async () => {
    const src = source(
      solidGif([
        { color: RED, delayMs: 30 },
        { color: GREEN, delayMs: 300 },
      ]),
    );
    const result = await mashGifs([src], options({ frameDelayMs: 80 }));
    expect(decodeGif(result.bytes).frames.map((f) => f.delayMs)).toEqual([80, 80]);
  });

  it('adds an inter-clip gap when requested', async () => {
    const a = source(solidGif([{ color: RED, delayMs: 100 }]), 'a.gif');
    const b = source(solidGif([{ color: BLUE, delayMs: 100 }]), 'b.gif');
    const result = await mashGifs([a, b], options({ gapMs: 400 }));
    const decoded = decodeGif(result.bytes);
    expect(result.frameCount).toBe(3);
    expect(decoded.frames.map((f) => f.delayMs)).toEqual([100, 400, 100]);
  });

  it('clamps unrealistically short and long delays', () => {
    expect(normalizeDelayMs(5)).toBe(100); // sub-frame delays render as 100ms in browsers
    expect(normalizeDelayMs(12)).toBe(100);
    expect(normalizeDelayMs(19)).toBe(100);
    expect(normalizeDelayMs(20)).toBe(20);
    expect(normalizeDelayMs(1234)).toBe(1230);
    expect(normalizeDelayMs(999_999)).toBe(10_000);
    expect(normalizeDelayMs(Number.NaN)).toBe(100);
  });

  it('propagates the loop setting', async () => {
    const src = source(solidGif([{ color: RED, delayMs: 100 }]));
    const result = await mashGifs([src], options({ loop: 5 }));
    expect(decodeGif(result.bytes).loop).toBe(5);
    const forever = await mashGifs([src], options({ loop: 0 }));
    expect(decodeGif(forever.bytes).loop).toBe(0);
  });
});

describe('mashGifs guards', () => {
  it('rejects an empty source list', async () => {
    await expect(mashGifs([], options())).rejects.toThrow(/at least one GIF/i);
  });

  it('rejects files that are not GIFs', async () => {
    const bogus = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    await expect(mashGifs([source(bogus, 'notes.txt')], options())).rejects.toThrow(/notes\.txt/);
  });

  it('refuses to build absurdly long animations', async () => {
    const frames = Array.from({ length: 100 }, () => ({ color: RED, delayMs: 100 }));
    const src = { ...source(solidGif(frames), 'long.gif'), options: { repeat: 50 } };
    await expect(mashGifs([src], options())).rejects.toThrow(/limit/i);
  });

  it('reports warnings through the hook', async () => {
    const seen: string[] = [];
    const src = source(solidGif([{ color: RED, delayMs: 10 }]), 'fast.gif');
    const result = await mashGifs([src], options(), {
      onWarning: (warning) => seen.push(warning.message),
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(result.warnings.length).toBe(seen.length);
  });
});

describe('progress reporting', () => {
  it('reports monotonically increasing progress ending at 1', async () => {
    const values: number[] = [];
    const src = [
      source(solidGif([{ color: RED, delayMs: 60 }, { color: GREEN, delayMs: 60 }]), 'a.gif'),
      source(solidGif([{ color: BLUE, delayMs: 60 }]), 'b.gif'),
    ];
    await mashGifs(src, options(), {
      onProgress: (progress) => values.push(progress.progress),
    });
    expect(values.length).toBeGreaterThan(2);
    expect(values.at(-1)).toBe(1);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });

  it('estimates a plan that matches the encoder frame count', async () => {
    const sources = [
      {
        name: 'a.gif',
        width: 20,
        height: 20,
        frameCount: 3,
        durationMs: 300,
        loop: 0,
        options: { repeat: 2 },
      },
      { name: 'b.gif', width: 40, height: 10, frameCount: 2, durationMs: 100, loop: 0 },
    ];
    const plan = estimatePlan(sources, options());
    expect(plan.width).toBe(40);
    expect(plan.height).toBe(20);
    expect(plan.frames).toHaveLength(8);

    const result = await mashGifs(
      [
        { bytes: solidGif(Array.from({ length: 3 }, () => ({ color: RED, delayMs: 100 })), { width: 20, height: 20 }), options: { repeat: 2 } },
        { bytes: solidGif(Array.from({ length: 2 }, () => ({ color: BLUE, delayMs: 50 })), { width: 40, height: 10 }) },
      ],
      options(),
    );
    expect(result.frameCount).toBe(plan.frames.length);
    expect(result.durationMs).toBe(plan.totalDurationMs);
  });
});
