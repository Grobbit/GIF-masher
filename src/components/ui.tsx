/** Small form primitives shared by the settings panel. */

import { useId } from 'react';
import type { ReactNode } from 'react';

interface FieldProps {
  label: string;
  hint?: string;
  value?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}

export function Field({ label, hint, value, children, htmlFor }: FieldProps) {
  return (
    <div className="field">
      <div className="field__label">
        <label htmlFor={htmlFor}>{label}</label>
        {value !== undefined && <span className="field__value">{value}</span>}
      </div>
      {children}
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

interface SegmentedProps<T extends string | number> {
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: SegmentedProps<T>) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className="segmented__option"
          aria-pressed={option.value === value}
          title={option.hint}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: ReactNode;
  onChange: (value: number) => void;
  hint?: string;
  disabled?: boolean;
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  hint,
  disabled,
}: SliderProps) {
  const id = useId();
  const progress = ((value - min) / (max - min)) * 100;
  return (
    <div className="field">
      <div className="field__label">
        <label htmlFor={id}>{label}</label>
        <span className="field__value">{display}</span>
      </div>
      <input
        id={id}
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ ['--progress' as string]: `${progress}%` }}
      />
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}

export function Toggle({ checked, onChange, label, hint }: ToggleProps) {
  const id = useId();
  return (
    <div className="field">
      <div className="field__label">
        <label htmlFor={id}>{label}</label>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          className={`btn btn-sm ${checked ? 'btn-primary' : ''}`}
          onClick={() => onChange(!checked)}
        >
          {checked ? 'On' : 'Off'}
        </button>
      </div>
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}
