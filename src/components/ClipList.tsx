import { useState } from 'react';
import type { SourceItem } from '../hooks/useMashSources';
import { formatBytes, formatNumber } from '../lib/format';
import { ClipCard } from './ClipCard';
import { Icon } from './Icon';

interface ClipListProps {
  items: SourceItem[];
  totalBytes: number;
  onMove: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Pick<SourceItem, 'repeat' | 'fit'>>) => void;
  onReorder: (id: string, index: number) => void;
  onClear: () => void;
}

export function ClipList({
  items,
  totalBytes,
  onMove,
  onRemove,
  onUpdate,
  onReorder,
  onClear,
}: ClipListProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const handleDrop = (index: number) => {
    if (draggedId) onReorder(draggedId, index);
    setDraggedId(null);
    setOverIndex(null);
  };

  return (
    <>
      <div className="clips-toolbar">
        <span className="clips-toolbar__title">
          <Icon name="layers" size={15} />
          Playlist
        </span>
        <span className="pill pill--accent">order = output</span>
        <div className="clips-toolbar__meta">
          <span className="mono">{formatNumber(items.length)}</span> clips ·{' '}
          <span className="mono">{formatBytes(totalBytes)}</span>
          {confirmClear ? (
            <span className="clip__remove-confirm">
              <button type="button" className="btn btn-danger btn-sm" onClick={onClear}>
                Clear all
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmClear(false)}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirmClear(true)}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <ol
        className="clip-list"
        onDragOver={(event) => {
          if (draggedId) event.preventDefault();
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setOverIndex(null);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (overIndex !== null) handleDrop(overIndex);
        }}
      >
        {items.map((item, index) => (
          <ClipCard
            key={item.id}
            item={item}
            index={index}
            total={items.length}
            onMove={onMove}
            onRemove={onRemove}
            onUpdate={onUpdate}
            onDragStart={setDraggedId}
            onDragEnter={setOverIndex}
            onDragEnd={() => {
              setDraggedId(null);
              setOverIndex(null);
            }}
            onDropOnCard={handleDrop}
            isDragging={draggedId === item.id}
            isDropTarget={draggedId !== null && draggedId !== item.id && overIndex === index}
          />
        ))}
      </ol>
    </>
  );
}
