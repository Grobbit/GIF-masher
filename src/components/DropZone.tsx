import { useId, useRef } from 'react';
import { Icon } from './Icon';

interface DropZoneProps {
  compact: boolean;
  isAdding: boolean;
  onFiles: (files: File[]) => void;
  isDragActive: boolean;
}

/** Click, drop or paste target that adds clips to the end of the list. */
export function DropZone({ compact, isAdding, onFiles, isDragActive }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const openPicker = () => inputRef.current?.click();

  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) onFiles(files);
    // Reset so picking the same file twice still fires a change event.
    event.target.value = '';
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  };

  return (
    <div
      className={[
        'dropzone',
        compact ? 'dropzone--compact' : '',
        isDragActive ? 'dropzone--active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="button"
      tabIndex={0}
      aria-label="Add GIFs"
      onClick={openPicker}
      onKeyDown={handleKeyDown}
    >
      <div className="dropzone__icon" aria-hidden="true">
        <Icon name={compact ? 'plus' : 'film'} size={compact ? 17 : 22} />
      </div>

      {compact ? (
        <>
          <div className="dropzone__compact-text">
            <span className="dropzone__title">Add more GIFs</span>
            <span className="dropzone__hint">They are appended to the end of the list</span>
          </div>
          <span className="dropzone__spacer" />
          <span className="btn btn-sm" aria-hidden="true">
            <Icon name="plus" size={14} />
            Browse
          </span>
        </>
      ) : (
        <>
          <span className="dropzone__title">
            {isAdding ? 'Reading your GIFs…' : 'Drop GIFs here'}
          </span>
          <span className="dropzone__hint">
            Or click to browse, or paste from the clipboard. Add them one at a time or all at once —
            the order you add them is the order they play.
          </span>
          <div className="dropzone__actions">
            <span className="btn btn-sm" aria-hidden="true">
              <Icon name="plus" size={14} />
              Choose GIFs
            </span>
            {isAdding && <span className="spinner" aria-hidden="true" />}
          </div>
        </>
      )}

      <input
        id={inputId}
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/gif,.gif"
        multiple
        onChange={handleInput}
        // Programmatic .click() bubbles; stop it so the wrapper does not re-open the picker.
        onClick={(event) => event.stopPropagation()}
        tabIndex={-1}
      />
    </div>
  );
}
