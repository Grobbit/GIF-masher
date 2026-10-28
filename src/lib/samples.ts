/**
 * Built-in demo clips.
 *
 * Generated procedurally at runtime (a few hundred bytes each) so the tool can
 * be tried before the user has any GIFs of their own. They are also handy for
 * eyeballing the ordering guarantee: each clip is visually distinct and its
 * frames are numbered.
 */

import { createGifWriter } from '../core/encode';

type RGBA = [number, number, number, number];

interface SampleSpec {
  name: string;
  width: number;
  height: number;
  frames: number;
  delayMs: number;
  draw: (data: Uint8Array, frame: number, width: number, height: number, total: number) => void;
}

/** Draw a filled rectangle, clipped to the canvas. */
function rect(
  data: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  color: RGBA,
): void {
  const startX = Math.max(0, Math.round(x0));
  const endX = Math.min(width, Math.round(x0 + w));
  const startY = Math.max(0, Math.round(y0));
  const endY = Math.min(height, Math.round(y0 + h));
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const i = (y * width + x) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = color[3];
    }
  }
}

/** Draw a filled circle (GIF has 1-bit alpha, so no edge blending is needed). */
function circle(
  data: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  color: RGBA,
): void {
  const startX = Math.max(0, Math.floor(cx - radius));
  const endX = Math.min(width, Math.ceil(cx + radius));
  const startY = Math.max(0, Math.floor(cy - radius));
  const endY = Math.min(height, Math.ceil(cy + radius));
  const radiusSq = radius * radius;
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > radiusSq) continue;
      const i = (y * width + x) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = color[3];
    }
  }
}

const SAMPLES: SampleSpec[] = [
  {
    name: 'sample-sunrise.gif',
    width: 160,
    height: 120,
    frames: 12,
    delayMs: 110,
    draw(data, frame, width, height, total) {
      const t = frame / total;
      // Sky gradient: warm at the bottom, deep purple up top.
      for (let y = 0; y < height; y++) {
        const mix = y / height;
        const r = Math.round(255 * (0.28 + 0.62 * mix));
        const g = Math.round(90 * (0.3 + 0.9 * mix) + 60 * mix);
        const b = Math.round(140 * (1 - mix * 0.75) + 30 * mix);
        rect(data, width, height, 0, y, width, 1, [r, g, b, 255]);
      }
      const sunY = height * 0.78 - t * height * 0.5;
      circle(data, width, height, width / 2, sunY, 26, [255, 214, 102, 255]);
      circle(data, width, height, width / 2, sunY, 18, [255, 248, 214, 255]);
      // Horizon band.
      rect(data, width, height, 0, height - 10, width, 10, [24, 18, 40, 255]);
    },
  },
  {
    name: 'sample-orbit.gif',
    width: 96,
    height: 96,
    frames: 12,
    delayMs: 80,
    draw(data, frame, width, height, total) {
      // Transparent background: shows off the checkerboard + 1-bit alpha.
      data.fill(0);
      const angle = (frame / total) * Math.PI * 2;
      const cx = width / 2 + Math.cos(angle) * 30;
      const cy = height / 2 + Math.sin(angle) * 30;
      circle(data, width, height, cx, cy, 11, [34, 211, 238, 255]);
      circle(data, width, height, width / 2, height / 2, 9, [139, 92, 246, 255]);
    },
  },
  {
    name: 'sample-wipe.gif',
    width: 200,
    height: 80,
    frames: 10,
    delayMs: 90,
    draw(data, frame, width, height, total) {
      data.fill(0);
      rect(data, width, height, 0, 0, width, height, [10, 12, 20, 255]);
      const t = frame / total;
      const colors: RGBA[] = [
        [255, 61, 129, 255],
        [139, 92, 246, 255],
        [34, 211, 238, 255],
      ];
      const barWidth = width / 3;
      for (let i = 0; i < 3; i++) {
        const offset = ((t + i / 3) % 1) * width;
        for (let y = 0; y < height; y++) {
          const shift = (y * 0.35 + offset) % (width + barWidth);
          rect(data, width, height, shift - barWidth / 2, y, barWidth, 1, colors[i]);
        }
      }
    },
  },
];

function buildSample(spec: SampleSpec): File {
  const writer = createGifWriter(spec.width, spec.height, { loop: 0, maxColors: 128 });
  const frame = new Uint8Array(spec.width * spec.height * 4);
  for (let index = 0; index < spec.frames; index++) {
    frame.fill(0);
    spec.draw(frame, index, spec.width, spec.height, spec.frames);
    writer.addFrame(frame, spec.delayMs);
  }
  const bytes = writer.finish();
  return new File([bytes.slice().buffer as ArrayBuffer], spec.name, { type: 'image/gif' });
}

/** Build the three demo clips (in the order they should be appended). */
export function createSampleGifs(): File[] {
  return SAMPLES.map(buildSample);
}
