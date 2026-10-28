/** UI settings <-> engine options, plus the live estimate shown in the sidebar. */

import { estimatePlan } from '../core/plan';
import type {
  BackgroundMode,
  CanvasSizeMode,
  FitMode,
  MashOptions,
  MashPlan,
  SourceInfo,
} from '../core/types';
import type { SourceItem } from '../hooks/useMashSources';

export interface UISettings {
  canvasMode: CanvasSizeMode;
  presetWidth: number;
  presetHeight: number;
  fit: FitMode;
  background: BackgroundMode;
  backgroundColor: string;
  speed: number;
  /** `true` = every frame uses `fixedDelayMs`. */
  useFixedDelay: boolean;
  fixedDelayMs: number;
  loop: number;
  maxColors: number;
  gapMs: number;
}

export const DEFAULT_SETTINGS: UISettings = {
  canvasMode: 'largest',
  presetWidth: 480,
  presetHeight: 480,
  fit: 'contain',
  background: 'transparent',
  backgroundColor: '#101014',
  speed: 1,
  useFixedDelay: false,
  fixedDelayMs: 100,
  loop: 0,
  maxColors: 256,
  gapMs: 0,
};

export const CANVAS_MODES: { value: CanvasSizeMode; label: string; hint: string }[] = [
  {
    value: 'largest',
    label: 'Largest clip',
    hint: 'Nothing gets downscaled. Smaller clips are centred.',
  },
  {
    value: 'smallest',
    label: 'Smallest clip',
    hint: 'Nothing gets upscaled. Larger clips are shrunk to fit.',
  },
  { value: 'fit-width', label: 'Match width', hint: 'Every clip is scaled to the widest one.' },
  { value: 'fit-height', label: 'Match height', hint: 'Every clip is scaled to the tallest one.' },
  { value: 'preset', label: 'Custom size', hint: 'Pick an exact output size.' },
];

export const FIT_MODES: { value: FitMode; label: string; hint: string }[] = [
  { value: 'contain', label: 'Fit', hint: 'Whole clip visible, letterboxed if needed.' },
  { value: 'cover', label: 'Fill', hint: 'Fills the frame and crops the overflow.' },
  { value: 'stretch', label: 'Stretch', hint: 'Fills the frame, ignoring aspect ratio.' },
];

export const BACKGROUND_MODES: { value: BackgroundMode; label: string }[] = [
  { value: 'transparent', label: 'Transparent' },
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black' },
  { value: 'custom', label: 'Custom' },
];

export const LOOP_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Forever' },
  { value: -1, label: 'Once' },
  { value: 1, label: '2x' },
  { value: 2, label: '3x' },
  { value: 4, label: '5x' },
];

export const COLOR_OPTIONS: { value: number; label: string }[] = [
  { value: 256, label: '256' },
  { value: 128, label: '128' },
  { value: 64, label: '64' },
  { value: 32, label: '32' },
];

/** Translate the UI settings into engine options. */
export function toMashOptions(settings: UISettings): MashOptions {
  return {
    canvasSize: settings.canvasMode,
    preset: { width: settings.presetWidth, height: settings.presetHeight },
    width: settings.canvasMode === 'preset' ? settings.presetWidth : undefined,
    height: settings.canvasMode === 'preset' ? settings.presetHeight : undefined,
    fit: settings.fit,
    background: settings.background,
    backgroundColor: settings.backgroundColor,
    speed: settings.speed,
    frameDelayMs: settings.useFixedDelay ? settings.fixedDelayMs : null,
    loop: settings.loop,
    maxColors: settings.maxColors,
    gapMs: settings.gapMs,
  };
}

export function toSourceInfo(item: SourceItem): SourceInfo {
  return {
    name: item.name,
    width: item.width,
    height: item.height,
    frameCount: item.frameCount,
    durationMs: item.durationMs,
    loop: item.loop,
    options: {
      repeat: item.repeat,
      fit: item.fit === 'inherit' ? undefined : item.fit,
    },
  };
}

export interface Estimate {
  plan: MashPlan;
  frames: number;
  durationMs: number;
  width: number;
  height: number;
}

/** Cheap "what will I get?" estimate for the sidebar. */
export function estimateOutput(items: SourceItem[], settings: UISettings): Estimate | null {
  if (items.length === 0) return null;
  const plan = estimatePlan(items.map(toSourceInfo), toMashOptions(settings));
  return {
    plan,
    frames: plan.frames.length,
    durationMs: plan.totalDurationMs,
    width: plan.width,
    height: plan.height,
  };
}

const STORAGE_KEY = 'gif-masher:settings:v1';

/** Restore settings from localStorage, ignoring anything malformed. */
export function loadSettings(): UISettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<UISettings>;
    return sanitizeSettings(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: UISettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode / quota: settings just won't persist.
  }
}

/** Clamp persisted values so a stale or hand-edited entry cannot break the UI. */
export function sanitizeSettings(input: Partial<UISettings>): UISettings {
  const merged = { ...DEFAULT_SETTINGS, ...input };
  return {
    ...merged,
    canvasMode: CANVAS_MODES.some((mode) => mode.value === merged.canvasMode)
      ? merged.canvasMode
      : DEFAULT_SETTINGS.canvasMode,
    fit: FIT_MODES.some((mode) => mode.value === merged.fit) ? merged.fit : DEFAULT_SETTINGS.fit,
    background: BACKGROUND_MODES.some((mode) => mode.value === merged.background)
      ? merged.background
      : DEFAULT_SETTINGS.background,
    backgroundColor: /^#[0-9a-f]{6}$/i.test(merged.backgroundColor)
      ? merged.backgroundColor
      : DEFAULT_SETTINGS.backgroundColor,
    presetWidth: clampNumber(merged.presetWidth, 16, 2000, DEFAULT_SETTINGS.presetWidth),
    presetHeight: clampNumber(merged.presetHeight, 16, 2000, DEFAULT_SETTINGS.presetHeight),
    speed: clampNumber(merged.speed, 0.25, 4, DEFAULT_SETTINGS.speed),
    fixedDelayMs: clampNumber(merged.fixedDelayMs, 20, 2000, DEFAULT_SETTINGS.fixedDelayMs),
    maxColors: COLOR_OPTIONS.some((option) => option.value === merged.maxColors)
      ? merged.maxColors
      : DEFAULT_SETTINGS.maxColors,
    gapMs: clampNumber(merged.gapMs, 0, 2000, DEFAULT_SETTINGS.gapMs),
    useFixedDelay: Boolean(merged.useFixedDelay),
    loop: LOOP_OPTIONS.some((option) => option.value === merged.loop)
      ? merged.loop
      : DEFAULT_SETTINGS.loop,
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100));
}
