/**
 * A deliberately tiny, "dumb" GIF writer used only by the tests.
 *
 * Real encoders merge identical pixels and emit compact LZW streams, which
 * means they never produce the awkward cases that break GIF compositing:
 * partial frame rectangles, per-frame disposal methods, transparent indices.
 * This builder emits those cases on purpose.
 *
 * The LZW stream is valid but intentionally naive: every pixel is preceded by a
 * clear code, so the dictionary never grows past the initial code width. That
 * keeps the bit-packing trivial (fixed 3- or 4-bit codes) at the cost of size.
 */

export interface BuilderFrame {
  /** Palette indices, row-major, exactly width*height long. */
  indices: number[];
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  /** Frame duration in centiseconds. */
  delayCs?: number;
  /** 0 = unspecified, 1 = do not dispose, 2 = restore to background, 3 = restore to previous. */
  disposal?: number;
  /** Palette index treated as transparent (needs `transparent: true`). */
  transparentIndex?: number;
  transparent?: boolean;
  /** Local colour table for this frame. */
  palette?: [number, number, number][];
  interlaced?: boolean;
}

export interface BuilderOptions {
  width: number;
  height: number;
  palette: [number, number, number][];
  loop?: number;
}

function nextPowerOfTwo(value: number): number {
  let size = 2;
  while (size < value) size <<= 1;
  return size;
}

function pushUint16(bytes: number[], value: number): void {
  bytes.push(value & 0xff, (value >> 8) & 0xff);
}

function pushString(bytes: number[], text: string): void {
  for (const char of text) bytes.push(char.charCodeAt(0));
}

/** Pack LZW codes LSB-first into 8-bit sub-blocks. */
function encodeNaiveLzw(indices: number[], minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const codeSize = minCodeSize + 1;
  const out: number[] = [minCodeSize];

  const data: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  const writeCode = (code: number) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      data.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  for (const index of indices) {
    writeCode(clearCode);
    writeCode(index);
  }
  writeCode(endCode);
  if (bitCount > 0) data.push(bitBuffer & 0xff);

  for (let offset = 0; offset < data.length; offset += 255) {
    const chunk = data.slice(offset, offset + 255);
    out.push(chunk.length, ...chunk);
  }
  out.push(0); // block terminator
  return out;
}

function pushColorTable(bytes: number[], palette: [number, number, number][], size: number): void {
  for (let i = 0; i < size; i++) {
    const color = palette[i] ?? [0, 0, 0];
    bytes.push(color[0], color[1], color[2]);
  }
}

/** Build a GIF from the given frames. */
export function buildGif(frames: BuilderFrame[], options: BuilderOptions): Uint8Array {
  const { width, height, palette } = options;
  const bytes: number[] = [];

  pushString(bytes, 'GIF89a');
  const globalTableSize = nextPowerOfTwo(palette.length);
  pushUint16(bytes, width);
  pushUint16(bytes, height);
  // Global colour table flag + colour resolution + size.
  const gctBits = Math.log2(globalTableSize) - 1;
  bytes.push(0xf0 | (gctBits & 0x07), 0, 0);
  pushColorTable(bytes, palette, globalTableSize);

  const loop = options.loop ?? 0;
  if (loop >= 0) {
    bytes.push(0x21, 0xff, 11);
    pushString(bytes, 'NETSCAPE2.0');
    bytes.push(3, 1);
    pushUint16(bytes, loop);
    bytes.push(0);
  }

  for (const frame of frames) {
    const left = frame.left ?? 0;
    const top = frame.top ?? 0;
    const frameWidth = frame.width ?? width;
    const frameHeight = frame.height ?? height;
    const disposal = frame.disposal ?? 0;
    const transparent = frame.transparent ?? frame.transparentIndex !== undefined;
    const transparentIndex = frame.transparentIndex ?? 0;

    // Graphic control extension.
    bytes.push(0x21, 0xf9, 4);
    bytes.push(((disposal & 0x07) << 2) | (transparent ? 1 : 0));
    pushUint16(bytes, frame.delayCs ?? 10);
    bytes.push(transparent ? transparentIndex : 0);
    bytes.push(0);

    // Image descriptor.
    bytes.push(0x2c);
    pushUint16(bytes, left);
    pushUint16(bytes, top);
    pushUint16(bytes, frameWidth);
    pushUint16(bytes, frameHeight);

    const table = frame.palette ?? palette;
    const useLocalTable = Boolean(frame.palette);
    const localTableSize = nextPowerOfTwo(table.length);
    if (useLocalTable) {
      const bits = Math.log2(localTableSize) - 1;
      bytes.push(0x80 | (frame.interlaced ? 0x40 : 0) | (bits & 0x07));
      pushColorTable(bytes, table, localTableSize);
    } else {
      bytes.push(frame.interlaced ? 0x40 : 0);
    }

    const minCodeSize = Math.max(2, Math.log2(useLocalTable ? localTableSize : globalTableSize));
    bytes.push(...encodeNaiveLzw(frame.indices, minCodeSize));
  }

  bytes.push(0x3b); // trailer
  return Uint8Array.from(bytes);
}

/** Repeat a palette index `count` times. */
export function fill(indices: number[], count: number): number[] {
  return Array.from({ length: count }, (_, index) => indices[index % indices.length]);
}
