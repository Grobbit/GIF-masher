/**
 * Shared types for the GIF Masher engine.
 *
 * The engine is deliberately platform agnostic: it only deals with bytes and
 * flat RGBA buffers, so the exact same code runs in the browser, in a Web
 * Worker and in Node (see `src/cli`).
 */

/** How a source frame is scaled into the output canvas. */
export type FitMode = 'contain' | 'cover' | 'stretch';

/** How the output canvas size is derived from the sources. */
export type CanvasSizeMode = 'largest' | 'smallest' | 'fit-width' | 'fit-height' | 'preset';

/** Where extra space around a source frame comes from. */
export type BackgroundMode = 'transparent' | 'white' | 'black' | 'custom';

/** Per-source overrides. */
export interface SourceOptions {
  /** How many times this source is appended (>= 1). */
  repeat?: number;
  /** Fit mode override for this source. */
  fit?: FitMode;
}

export interface MashOptions {
  /** Output canvas width in pixels (already resolved -- see `resolveCanvasSize`). */
  width?: number;
  /** Output canvas height in pixels (already resolved -- see `resolveCanvasSize`). */
  height?: number;
  /** How the canvas size is computed when width/height are not given. */
  canvasSize?: CanvasSizeMode;
  /** Fixed size used by the `preset` canvas mode. */
  preset?: { width: number; height: number };
  /** How each source frame is scaled into the canvas. */
  fit: FitMode;
  /** Background behind the frames. */
  background: BackgroundMode;
  /** Hex colour (`#rrggbb`) used when `background` is `custom`. */
  backgroundColor: string;
  /** Playback speed multiplier for every frame (1 = keep original timing). */
  speed: number;
  /** Override every frame delay (ms). `null` keeps the source delays. */
  frameDelayMs: number | null;
  /** 0 = loop forever, -1 = play once, n > 0 = extra loops. */
  loop: number;
  /** Maximum colours per frame palette (2..256). */
  maxColors: number;
  /** Extra seamless gap between clips, in ms (useful for legibility). */
  gapMs: number;
}

export interface RGBAFrame {
  /** Straight (non-premultiplied) RGBA bytes, `width * height * 4` long. */
  data: Uint8Array;
  width: number;
  height: number;
  /** Frame duration in milliseconds. */
  delayMs: number;
}

export interface DecodedGif {
  width: number;
  height: number;
  /** Raw Netscape loop value: 0 = forever, -1 = once, n > 0 = extra loops. */
  loop: number;
  /** Fully composited frames, ready to be resized. */
  frames: RGBAFrame[];
}

/** Everything the planner needs to know about one source. */
export interface SourceInfo {
  name: string;
  width: number;
  height: number;
  frameCount: number;
  /** Sum of the source's frame delays, in ms. */
  durationMs: number;
  /** Loop behaviour recorded in the source GIF. */
  loop: number;
  /** Source level overrides coming from the UI. */
  options?: SourceOptions;
}

/** Which frame of which source is emitted at a given position. */
export interface PlannedFrame {
  sourceIndex: number;
  frameIndex: number;
  delayMs: number;
}

export interface MashPlan {
  width: number;
  height: number;
  frames: PlannedFrame[];
  totalDurationMs: number;
}

export interface MashWarning {
  sourceIndex: number;
  message: string;
}

export interface MashResult {
  bytes: Uint8Array;
  mimeType: 'image/gif';
  width: number;
  height: number;
  frameCount: number;
  durationMs: number;
  /** Size in bytes of the produced GIF. */
  byteLength: number;
  warnings: MashWarning[];
}

/** One input GIF handed to the engine. */
export interface MashSourceInput {
  bytes: Uint8Array;
  /** Per-source overrides (repeat count, fit). */
  options?: SourceOptions;
}

export interface MashProgress {
  /** 0..1 */
  progress: number;
  /** Human readable stage label. */
  stage: string;
  /** Frames encoded so far. */
  framesDone: number;
  framesTotal: number;
}

export const DEFAULT_OPTIONS: MashOptions = {
  fit: 'contain',
  background: 'transparent',
  backgroundColor: '#000000',
  canvasSize: 'largest',
  speed: 1,
  frameDelayMs: null,
  loop: 0,
  maxColors: 256,
  gapMs: 0,
};
