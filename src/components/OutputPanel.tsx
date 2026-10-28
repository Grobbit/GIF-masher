import type { MashProgress, MashWarning } from '../core/types';
import type { MashOutput, MashStatus } from '../hooks/useMashJob';
import type { Estimate } from '../lib/settings';
import {
  formatBytes,
  formatDimensions,
  formatDuration,
  formatNumber,
  pluralize,
} from '../lib/format';
import { Icon } from './Icon';

interface OutputPanelProps {
  status: MashStatus;
  progress: MashProgress | null;
  output: MashOutput | null;
  error: string | null;
  estimate: Estimate | null;
  clipCount: number;
  isStale: boolean;
  isCopying: boolean;
  onMash: () => void;
  onCancel: () => void;
  onDownload: () => void;
  onCopy: () => void;
  onStartOver: () => void;
}

export function OutputPanel({
  status,
  progress,
  output,
  error,
  estimate,
  clipCount,
  isStale,
  isCopying,
  onMash,
  onCancel,
  onDownload,
  onCopy,
  onStartOver,
}: OutputPanelProps) {
  const running = status === 'running';
  const showResult = status === 'done' && output !== null;
  const percent = Math.round((progress?.progress ?? 0) * 100);

  return (
    <section className="card" id="output-panel" aria-labelledby="output-heading">
      <header className="card__header">
        <h2 className="card__title" id="output-heading">
          <Icon name="film" size={15} />
          {showResult ? 'Your GIF' : 'Preview'}
        </h2>
        {showResult && output && (
          <span className="pill pill--good">
            <Icon name="check" size={12} />
            Ready
          </span>
        )}
        {running && <span className="spinner" aria-hidden="true" />}
      </header>

      <div className="card__body">
        {running && (
          <div className="progress" role="status" aria-live="polite">
            <div className="progress__head">
              <span className="progress__stage">{progress?.stage ?? 'Mashing'}</span>
              <span className="progress__pct">{percent}%</span>
            </div>
            <div
              className="progress__track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div className="progress__bar" style={{ width: `${Math.max(2, percent)}%` }} />
            </div>
            <div className="progress__foot">
              <span>
                {progress && progress.framesTotal > 0
                  ? `${formatNumber(progress.framesDone)} / ${formatNumber(progress.framesTotal)} frames`
                  : 'Reading GIFs…'}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {!running && showResult && output && (
          <>
            <div className="output__preview">
              <img src={output.url} alt="Your mashed GIF, playing in order" />
            </div>

            <div className="output__stats">
              <span className="pill">{formatBytes(output.byteLength)}</span>
              <span className="pill">{formatDimensions(output.width, output.height)}</span>
              <span className="pill">{pluralize(output.frameCount, 'frame')}</span>
              <span className="pill">{formatDuration(output.durationMs)}</span>
            </div>

            <div className="output__actions">
              <button type="button" className="btn btn-primary" onClick={onDownload}>
                <Icon name="download" size={16} />
                Download GIF
              </button>
              <button
                type="button"
                className="btn"
                onClick={onCopy}
                disabled={isCopying}
                title="Copy the GIF to your clipboard"
              >
                <Icon name={isCopying ? 'check' : 'copy'} size={16} />
                Copy
              </button>
            </div>

            {output.warnings.length > 0 && (
              <div className="output__warnings">
                {output.warnings.slice(0, 4).map((warning, index) => (
                  <WarningRow key={`${warning.sourceIndex}-${index}`} warning={warning} />
                ))}
              </div>
            )}

            {isStale && (
              <p className="field__hint" style={{ marginTop: 10 }}>
                <Icon name="info" size={12} /> Your clips or settings changed since this mash.
              </p>
            )}

            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-block" onClick={onMash}>
                <Icon name="restart" size={15} />
                Mash again
              </button>
              <button type="button" className="btn btn-ghost" onClick={onStartOver}>
                Start over
              </button>
            </div>
          </>
        )}

        {!running && !showResult && (
          <>
            <div className="output__preview">
              <div className="output__placeholder">
                <Icon name="image" size={22} />
                <strong>Nothing mashed yet</strong>
                <span>Add GIFs, then hit Mash. The result plays right here.</span>
              </div>
            </div>

            {estimate ? (
              <div className="summary" style={{ marginTop: 12 }}>
                <div className="summary__item">
                  <span className="summary__label">Output size</span>
                  <span className="summary__value">
                    {formatDimensions(estimate.width, estimate.height)}
                  </span>
                </div>
                <div className="summary__item">
                  <span className="summary__label">Frames</span>
                  <span className="summary__value">{formatNumber(estimate.frames)}</span>
                </div>
                <div className="summary__item">
                  <span className="summary__label">Duration</span>
                  <span className="summary__value">{formatDuration(estimate.durationMs)}</span>
                </div>
                <div className="summary__item">
                  <span className="summary__label">Clips</span>
                  <span className="summary__value">{formatNumber(clipCount)}</span>
                </div>
              </div>
            ) : (
              <p className="field__hint" style={{ marginTop: 12 }}>
                Add at least one GIF to see the output summary.
              </p>
            )}
          </>
        )}

        {!running && status !== 'done' && (
          <div className="mash-cta" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              onClick={onMash}
              disabled={clipCount === 0}
            >
              <Icon name="sparkles" size={17} />
              {clipCount === 0
                ? 'Add GIFs to mash'
                : `Mash ${pluralize(clipCount, 'clip')}`}
            </button>
            <span className="mash-cta__hint">
              {clipCount === 0 ? (
                'Everything happens locally in your browser.'
              ) : (
                <>
                  or press <span className="kbd">Ctrl</span> + <span className="kbd">Enter</span>
                </>
              )}
            </span>
          </div>
        )}

        {error && status === 'error' && (
          <p className="warning" style={{ marginTop: 12 }} role="alert">
            <Icon name="warning" size={14} />
            <span>{error}</span>
          </p>
        )}
      </div>
    </section>
  );
}

function WarningRow({ warning }: { warning: MashWarning }) {
  return (
    <p className="warning">
      <Icon name="warning" size={14} />
      <span>{warning.message}</span>
    </p>
  );
}
