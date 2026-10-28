/**
 * Frame rasterising.
 *
 * Every source frame is drawn into an output canvas of exactly
 * `dstWidth x dstHeight` pixels. Scaling happens in premultiplied alpha space:
 *
 *  - when shrinking, we box-filter (average the source pixels that land on the
 *    destination pixel) which avoids the aliasing you get from naive nearest
 *    neighbour sampling;
 *  - when enlarging, we bilinearly interpolate.
 *
 * GIF only supports 1-bit transparency, so the output alpha is snapped to
 * either 0 or 255 at the end (threshold 128). Anything below the threshold is
 * dropped, which keeps edges crisp instead of producing grey halos.
 */

import type { BackgroundMode, FitMode } from './types';

export interface FitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Rectangle (possibly fractional) that a source of `src` size occupies in a destination. */
export function computeFitRect(src: Size, dst: Size, fit: FitMode): FitRect {
  if (fit === 'stretch') {
    return { x: 0, y: 0, width: dst.width, height: dst.height };
  }
  const scale =
    fit === 'cover'
      ? Math.max(dst.width / src.width, dst.height / src.height)
      : Math.min(dst.width / src.width, dst.height / src.height);
  const width = src.width * scale;
  const height = src.height * scale;
  return {
    x: (dst.width - width) / 2,
    y: (dst.height - height) / 2,
    width,
    height,
  };
}

/** Parse `#rgb`, `#rrggbb` (and the same without `#`) into bytes. Falls back to black. */
export function parseHexColor(hex: string): [number, number, number] {
  let value = hex.trim().replace(/^#/, '');
  if (value.length === 3) {
    value = value
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return [0, 0, 0];
  const num = Number.parseInt(value, 16);
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

/** Resolve the background setting into an opaque colour, or `null` for transparency. */
export function resolveBackground(
  mode: BackgroundMode,
  customColor: string,
): [number, number, number] | null {
  switch (mode) {
    case 'transparent':
      return null;
    case 'white':
      return [255, 255, 255];
    case 'black':
      return [0, 0, 0];
    case 'custom':
      return parseHexColor(customColor);
    default:
      return null;
  }
}

/**
 * Fill a destination buffer with the background (or fully transparent black).
 * Uses a 32-bit view when alignment allows, which is several times faster than
 * a per-byte loop for large canvases.
 */
export function fillFrame(dst: Uint8Array, color: [number, number, number] | null): void {
  if (!color) {
    dst.fill(0);
    return;
  }
  const [r, g, b] = color;
  if (dst.byteOffset % 4 === 0) {
    const view = new Uint32Array(dst.buffer, dst.byteOffset, dst.length >> 2);
    // Pack as little-endian ABGR: alpha | blue << 8 | green << 16 | red << 24.
    const packed = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    view.fill(packed);
    const remainderStart = view.length * 4;
    for (let i = remainderStart; i < dst.length; i += 4) {
      dst[i] = r;
      dst[i + 1] = g;
      dst[i + 2] = b;
      dst[i + 3] = 255;
    }
    return;
  }
  for (let i = 0; i < dst.length; i += 4) {
    dst[i] = r;
    dst[i + 1] = g;
    dst[i + 2] = b;
    dst[i + 3] = 255;
  }
}

interface TransformArgs {
  src: Uint8Array;
  srcWidth: number;
  srcHeight: number;
  dst: Uint8Array;
  dstWidth: number;
  dstHeight: number;
  fit: FitMode;
  /** `null` leaves the gaps transparent. */
  background: [number, number, number] | null;
}

/**
 * Draw `src` into `dst` (which must be `dstWidth * dstHeight * 4` bytes).
 * The destination is cleared first, so the same buffer can be reused for every
 * frame of a mash.
 */
export function transformFrame(args: TransformArgs): void {
  const { src, srcWidth, srcHeight, dst, dstWidth, dstHeight, fit, background } = args;
  fillFrame(dst, background);
  if (srcWidth <= 0 || srcHeight <= 0 || dstWidth <= 0 || dstHeight <= 0) return;

  const rect = computeFitRect(
    { width: srcWidth, height: srcHeight },
    { width: dstWidth, height: dstHeight },
    fit,
  );

  // Destination pixel range actually covered by the source rectangle.
  const x0 = Math.max(0, Math.floor(rect.x));
  const x1 = Math.min(dstWidth, Math.ceil(rect.x + rect.width));
  const y0 = Math.max(0, Math.floor(rect.y));
  const y1 = Math.min(dstHeight, Math.ceil(rect.y + rect.height));
  if (x1 <= x0 || y1 <= y0) return;

  const scaleX = rect.width / srcWidth;
  const scaleY = rect.height / srcHeight;
  const footprintX = 1 / scaleX;
  const footprintY = 1 / scaleY;
  const opaque = background !== null;

  for (let y = y0; y < y1; y++) {
    // Source coordinate of the destination pixel centre.
    const sy = (y + 0.5 - rect.y) / scaleY;
    for (let x = x0; x < x1; x++) {
      const sx = (x + 0.5 - rect.x) / scaleX;

      let r: number;
      let g: number;
      let b: number;
      let a: number;

      if (footprintX <= 1 && footprintY <= 1) {
        // Magnification: bilinear.
        const n = sampleBilinear(src, srcWidth, srcHeight, sx, sy);
        r = n[0];
        g = n[1];
        b = n[2];
        a = n[3];
      } else {
        // Minification: box filter over the source footprint of this pixel.
        const n = sampleBox(
          src,
          srcWidth,
          srcHeight,
          sx - footprintX / 2,
          sy - footprintY / 2,
          sx + footprintX / 2,
          sy + footprintY / 2,
        );
        r = n[0];
        g = n[1];
        b = n[2];
        a = n[3];
      }

      // GIF has no partial transparency: snap to 1-bit alpha.
      if (a < 128) continue;
      a = 255;

      const di = (y * dstWidth + x) * 4;
      if (opaque) {
        // Source-over on the opaque background we just filled in.
        const weight = a / 255;
        const inverse = 1 - weight;
        dst[di] = r * weight + dst[di] * inverse;
        dst[di + 1] = g * weight + dst[di + 1] * inverse;
        dst[di + 2] = b * weight + dst[di + 2] * inverse;
      } else {
        // Transparent canvas: copy the (already un-premultiplied) colour.
        dst[di] = r;
        dst[di + 1] = g;
        dst[di + 2] = b;
      }
      dst[di + 3] = 255;
    }
  }
}

const bilinearScratch = new Float32Array(4);
const boxScratch = new Float32Array(4);

/** Bilinear sample in premultiplied space; returns straight RGBA in `bilinearScratch`. */
function sampleBilinear(
  src: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): Float32Array {
  const cx = Math.min(width - 1, Math.max(0, x - 0.5));
  const cy = Math.min(height - 1, Math.max(0, y - 0.5));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;

  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;

  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;

  const a00 = src[i00 + 3];
  const a10 = src[i10 + 3];
  const a01 = src[i01 + 3];
  const a11 = src[i11 + 3];

  const alpha = a00 * w00 + a10 * w10 + a01 * w01 + a11 * w11;
  if (alpha <= 0) {
    bilinearScratch[0] = 0;
    bilinearScratch[1] = 0;
    bilinearScratch[2] = 0;
    bilinearScratch[3] = 0;
    return bilinearScratch;
  }

  // Un-premultiply: sum(colour * alpha * weight) / sum(alpha * weight).
  const scale = 1 / alpha;
  bilinearScratch[0] =
    scale * (src[i00] * a00 * w00 + src[i10] * a10 * w10 + src[i01] * a01 * w01 + src[i11] * a11 * w11);
  bilinearScratch[1] =
    scale *
    (src[i00 + 1] * a00 * w00 +
      src[i10 + 1] * a10 * w10 +
      src[i01 + 1] * a01 * w01 +
      src[i11 + 1] * a11 * w11);
  bilinearScratch[2] =
    scale *
    (src[i00 + 2] * a00 * w00 +
      src[i10 + 2] * a10 * w10 +
      src[i01 + 2] * a01 * w01 +
      src[i11 + 2] * a11 * w11);
  bilinearScratch[3] = alpha;
  return bilinearScratch;
}

/** Area-average sample in premultiplied space; returns straight RGBA in `boxScratch`. */
function sampleBox(
  src: Uint8Array,
  width: number,
  height: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): Float32Array {
  const x0 = Math.max(0, Math.floor(left));
  const x1 = Math.min(width, Math.ceil(right));
  const y0 = Math.max(0, Math.floor(top));
  const y1 = Math.min(height, Math.ceil(bottom));

  if (x1 <= x0 || y1 <= y0) {
    boxScratch[0] = 0;
    boxScratch[1] = 0;
    boxScratch[2] = 0;
    boxScratch[3] = 0;
    return boxScratch;
  }

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumA = 0;
  let weightSum = 0;

  for (let y = y0; y < y1; y++) {
    const wy = Math.min(y + 1, bottom) - Math.max(y, top);
    if (wy <= 0) continue;
    const rowOffset = y * width * 4;
    for (let x = x0; x < x1; x++) {
      const wx = Math.min(x + 1, right) - Math.max(x, left);
      if (wx <= 0) continue;
      const w = wx * wy;
      const i = rowOffset + x * 4;
      const a = src[i + 3];
      if (a === 0) {
        weightSum += w; // count transparent area in the denominator
        continue;
      }
      const wa = (w * a) / 255;
      sumR += src[i] * wa;
      sumG += src[i + 1] * wa;
      sumB += src[i + 2] * wa;
      sumA += wa;
      weightSum += w;
    }
  }

  if (sumA <= 0 || weightSum <= 0) {
    boxScratch[0] = 0;
    boxScratch[1] = 0;
    boxScratch[2] = 0;
    boxScratch[3] = 0;
    return boxScratch;
  }

  boxScratch[0] = sumR / sumA;
  boxScratch[1] = sumG / sumA;
  boxScratch[2] = sumB / sumA;
  boxScratch[3] = (sumA / weightSum) * 255;
  return boxScratch;
}

/** True when any pixel in the frame is transparent (used to pick the encoder path). */
export function hasTransparency(data: Uint8Array): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 128) return true;
  }
  return false;
}
