import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <header className="dialog__header">
          <h2 id="help-title" style={{ fontSize: '1.05rem' }}>
            How GIF Masher works
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="dialog__body">
          <p>
            Drop in as many GIFs as you like. They play <strong>one after another, in the order
            shown in the playlist</strong> — the first clip you added is the first one you see, and
            so on. Nothing is shuffled or sorted.
          </p>

          <h3>Making a mash</h3>
          <ul>
            <li>
              Add clips by dropping them anywhere on the page, pasting, or using{' '}
              <strong>Add GIFs</strong>.
            </li>
            <li>Drag a clip by its handle, or use the arrows, to change the order.</li>
            <li>
              Every clip can repeat, or override the global fit mode (letterbox, fill or stretch).
            </li>
            <li>
              Press <strong>Mash</strong> (or <kbd>Ctrl</kbd>+<kbd>Enter</kbd>) and download the
              result.
            </li>
          </ul>

          <h3>What happens under the hood</h3>
          <ul>
            <li>
              Each GIF is decoded frame by frame and composited (disposal methods, transparency and
              partial frames included) so no visual information is lost.
            </li>
            <li>
              Frames are resized into one shared canvas, with box-filtered downscaling and bilinear
              upscaling.
            </li>
            <li>
              Every frame gets its own optimised palette of up to 256 colours, then the whole
              sequence is LZW-encoded into a single GIF.
            </li>
            <li>Timing is preserved from the source clips unless you change speed or delays.</li>
          </ul>

          <h3>Good to know</h3>
          <ul>
            <li>
              GIF only supports 1-bit transparency. Semi-transparent pixels become either fully
              visible or fully transparent.
            </li>
            <li>Delays are stored in 1/100s, so timings snap to 10ms steps.</li>
            <li>
              Everything runs locally in your browser (in a Web Worker, so the page stays
              responsive). No uploads, no servers.
            </li>
            <li>Large clips mean large files — 4,000 output frames is the hard cap.</li>
          </ul>

          <p className="dim" style={{ fontSize: '0.78rem' }}>
            Built with React, gifenc and gifuct-js. MIT licensed.
          </p>
        </div>
      </div>
    </div>
  );
}
