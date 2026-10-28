import { useState } from 'react';
import type { FitMode } from '../core/types';
import type { SourceItem } from '../hooks/useMashSources';
import { formatBytes, formatDimensions, formatDuration } from '../lib/format';
import { Icon } from './Icon';

interface ClipCardProps {
  item: SourceItem;
  index: number;
  total: number;
  onMove: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Pick<SourceItem, 'repeat' | 'fit'>>) => void;
  onDragStart: (id: string) => void;
  onDragEnter: (index: number) => void;
  onDragEnd: () => void;
  onDropOnCard: (index: number) => void;
  isDragging: boolean;
  isDropTarget: boolean;
}

const FIT_CHOICES: { value: FitMode | 'inherit'; label: string }[] = [
  { value: 'inherit', label: 'Global fit' },
  { value: 'contain', label: 'Fit' },
  { value: 'cover', label: 'Fill' },
  { value: 'stretch', label: 'Stretch' },
];

export function ClipCard({
  item,
  index,
  total,
  onMove,
  onRemove,
  onUpdate,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDropOnCard,
  isDragging,
  isDropTarget,
}: ClipCardProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li
      className={[
        'clip',
        isDragging ? 'clip--dragging' : '',
        isDropTarget ? 'clip--drop-target' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        // A custom type keeps the document-level "add files" handler out of it.
        event.dataTransfer.setData('application/x-gif-masher-clip', item.id);
        onDragStart(item.id);
      }}
      onDragEnter={() => onDragEnter(index)}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDropOnCard(index);
      }}
      onDragEnd={onDragEnd}
      aria-posinset={index + 1}
      aria-setsize={total}
    >
      <button
        type="button"
        className="clip__handle"
        aria-label={`Drag to reorder ${item.name}`}
        title="Drag to reorder"
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            onMove(item.id, -1);
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            onMove(item.id, 1);
          }
        }}
      >
        <Icon name="grip" size={16} />
      </button>

      <div className="clip__thumb">
        <span className="clip__index" aria-hidden="true">
          {index + 1}
        </span>
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" draggable={false} />
        ) : (
          <Icon name="image" size={18} className="clip__thumb--empty" />
        )}
      </div>

      <div className="clip__body">
        <span className="clip__name" title={item.name}>
          {item.name}
        </span>
        <span className="clip__meta">
          <span>
            <Icon name="film" size={12} />
            {formatDimensions(item.width, item.height)}
          </span>
          <span>
            <Icon name="layers" size={12} />
            {item.frameCount.toLocaleString()} {item.frameCount === 1 ? 'frame' : 'frames'}
          </span>
          <span>
            <Icon name="clock" size={12} />
            {formatDuration(item.durationMs)}
          </span>
          <span>{formatBytes(item.size)}</span>
        </span>
      </div>

      <div className="clip__controls">
        <label className="clip__repeat">
          <span>Repeat</span>
          <span className="stepper">
            <button
              type="button"
              className="stepper__btn"
              onClick={() => onUpdate(item.id, { repeat: Math.max(1, item.repeat - 1) })}
              disabled={item.repeat <= 1}
              aria-label={`Play ${item.name} one fewer time`}
            >
              −
            </button>
            <span className="stepper__value" aria-live="polite">
              {item.repeat}x
            </span>
            <button
              type="button"
              className="stepper__btn"
              onClick={() => onUpdate(item.id, { repeat: Math.min(20, item.repeat + 1) })}
              disabled={item.repeat >= 20}
              aria-label={`Play ${item.name} one more time`}
            >
              +
            </button>
          </span>
        </label>

        <label>
          <span className="sr-only">Fit mode for {item.name}</span>
          <select
            className="select"
            value={item.fit}
            onChange={(event) =>
              onUpdate(item.id, { fit: event.target.value as FitMode | 'inherit' })
            }
          >
            {FIT_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>

        <div className="clip__actions">
          <button
            type="button"
            className="icon-btn"
            onClick={() => onMove(item.id, -1)}
            disabled={index === 0}
            aria-label={`Move ${item.name} earlier`}
            title="Move earlier"
          >
            <Icon name="arrow-up" size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onMove(item.id, 1)}
            disabled={index === total - 1}
            aria-label={`Move ${item.name} later`}
            title="Move later"
          >
            <Icon name="arrow-down" size={15} />
          </button>

          {confirming ? (
            <span className="clip__remove-confirm">
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => onRemove(item.id)}
              >
                Remove
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setConfirming(false)}
                aria-label="Keep clip"
              >
                <Icon name="close" size={14} />
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="icon-btn icon-btn--danger"
              onClick={() => setConfirming(true)}
              aria-label={`Remove ${item.name}`}
              title="Remove clip"
            >
              <Icon name="trash" size={15} />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
