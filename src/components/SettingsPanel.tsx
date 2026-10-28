import { useId } from 'react';
import type { BackgroundMode, CanvasSizeMode, FitMode } from '../core/types';
import {
  BACKGROUND_MODES,
  CANVAS_MODES,
  COLOR_OPTIONS,
  FIT_MODES,
  LOOP_OPTIONS,
  type UISettings,
} from '../lib/settings';
import { Field, Segmented, Slider } from './ui';
import { Icon } from './Icon';

interface SettingsPanelProps {
  settings: UISettings;
  onChange: (patch: Partial<UISettings>) => void;
  onReset: () => void;
  disabled: boolean;
}

export function SettingsPanel({ settings, onChange, onReset, disabled }: SettingsPanelProps) {
  const widthId = useId();
  const heightId = useId();
  const backgroundId = useId();
  const loopId = useId();

  const canvasHint = CANVAS_MODES.find((mode) => mode.value === settings.canvasMode)?.hint ?? '';
  const fitHint = FIT_MODES.find((mode) => mode.value === settings.fit)?.hint ?? '';

  return (
    <section className="card" aria-labelledby="settings-heading">
      <header className="card__header">
        <h2 className="card__title" id="settings-heading">
          <Icon name="sparkles" size={15} />
          Output settings
        </h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>
          <Icon name="restart" size={14} />
          Reset
        </button>
      </header>

      <div className="card__body">
        <div className="settings">
          {/* ---------------------------------------------------- canvas */}
          <Field label="Canvas size" htmlFor="canvas-mode" hint={canvasHint}>
            <select
              id="canvas-mode"
              className="select"
              value={settings.canvasMode}
              disabled={disabled}
              onChange={(event) => onChange({ canvasMode: event.target.value as CanvasSizeMode })}
            >
              {CANVAS_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </Field>

          {settings.canvasMode === 'preset' && (
            <div className="settings__row">
              <Field label="Width" htmlFor={widthId}>
                <input
                  id={widthId}
                  className="input"
                  type="number"
                  min={16}
                  max={2000}
                  step={1}
                  value={settings.presetWidth}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({ presetWidth: clamp(event.target.value, 16, 2000, 480) })
                  }
                />
              </Field>
              <Field label="Height" htmlFor={heightId}>
                <input
                  id={heightId}
                  className="input"
                  type="number"
                  min={16}
                  max={2000}
                  step={1}
                  value={settings.presetHeight}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({ presetHeight: clamp(event.target.value, 16, 2000, 480) })
                  }
                />
              </Field>
            </div>
          )}

          {/* ------------------------------------------------------- fit */}
          <Field label="How clips fit" hint={fitHint}>
            <Segmented
              label="Fit mode"
              options={FIT_MODES}
              value={settings.fit}
              onChange={(fit) => onChange({ fit: fit as FitMode })}
            />
          </Field>

          {/* ------------------------------------------------ background */}
          <div className="field">
            <div className="field__label">
              <label htmlFor={backgroundId}>Background</label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                id={backgroundId}
                className="select"
                value={settings.background}
                disabled={disabled}
                onChange={(event) =>
                  onChange({ background: event.target.value as BackgroundMode })
                }
              >
                {BACKGROUND_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
              {settings.background === 'custom' && (
                <input
                  className="swatch"
                  type="color"
                  aria-label="Background colour"
                  value={settings.backgroundColor}
                  disabled={disabled}
                  onChange={(event) => onChange({ backgroundColor: event.target.value })}
                />
              )}
            </div>
            <p className="field__hint">Fills the space around clips that do not match the canvas.</p>
          </div>

          <div className="settings__divider" />

          {/* ---------------------------------------------------- timing */}
          <Slider
            label="Speed"
            value={settings.speed}
            min={0.25}
            max={4}
            step={0.05}
            display={`${settings.speed.toFixed(2).replace(/0$/, '')}x`}
            onChange={(speed) => onChange({ speed })}
            hint="Applies to every clip. 2x plays twice as fast."
            disabled={disabled}
          />

          <div className="field">
            <div className="field__label">
              <label htmlFor="delay-toggle">Frame timing</label>
              <button
                id="delay-toggle"
                type="button"
                className={`btn btn-sm ${settings.useFixedDelay ? 'btn-primary' : ''}`}
                aria-pressed={settings.useFixedDelay}
                disabled={disabled}
                onClick={() => onChange({ useFixedDelay: !settings.useFixedDelay })}
              >
                {settings.useFixedDelay ? 'Fixed' : 'From clips'}
              </button>
            </div>
            {settings.useFixedDelay ? (
              <Slider
                label="Frame delay"
                value={settings.fixedDelayMs}
                min={20}
                max={500}
                step={10}
                display={`${settings.fixedDelayMs}ms`}
                onChange={(fixedDelayMs) => onChange({ fixedDelayMs })}
                disabled={disabled}
              />
            ) : (
              <p className="field__hint">Each clip keeps its own frame delays.</p>
            )}
          </div>

          <Slider
            label="Pause between clips"
            value={settings.gapMs}
            min={0}
            max={1000}
            step={50}
            display={settings.gapMs === 0 ? 'off' : `${settings.gapMs}ms`}
            onChange={(gapMs) => onChange({ gapMs })}
            hint="Holds the last frame of each clip before the next one starts."
            disabled={disabled}
          />

          <div className="settings__divider" />

          {/* ---------------------------------------------- output format */}
          <div className="settings__row">
            <Field label="Loop" htmlFor={loopId}>
              <select
                id={loopId}
                className="select"
                value={settings.loop}
                disabled={disabled}
                onChange={(event) => onChange({ loop: Number(event.target.value) })}
              >
                {LOOP_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Colours" hint="Fewer = smaller file.">
              <Segmented
                label="Colour count"
                options={COLOR_OPTIONS}
                value={settings.maxColors}
                onChange={(maxColors) => onChange({ maxColors: Number(maxColors) })}
              />
            </Field>
          </div>
        </div>
      </div>
    </section>
  );
}

function clamp(raw: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
