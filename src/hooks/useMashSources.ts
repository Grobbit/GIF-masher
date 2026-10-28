import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FitMode } from '../core/types';
import { createId, inspectGifFile, looksLikeGif } from '../lib/files';

export interface SourceItem {
  id: string;
  file: File;
  name: string;
  size: number;
  width: number;
  height: number;
  frameCount: number;
  durationMs: number;
  loop: number;
  thumbnail: string | null;
  /** Per-clip overrides. */
  repeat: number;
  fit: FitMode | 'inherit';
}

export interface Notice {
  id: string;
  kind: 'error' | 'info';
  message: string;
}

const MAX_SOURCES = 40;

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/**
 * Owns the ordered list of clips.
 *
 * Order is the single source of truth for the mash: new clips always append to
 * the end, reordering is explicit, and nothing is ever sorted or shuffled.
 */
export function useMashSources() {
  const [items, setItems] = useState<SourceItem[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  // Mirror of `items` for event handlers, so they never close over stale state.
  const itemsRef = useRef<SourceItem[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const pushNotice = useCallback((message: string, kind: Notice['kind'] = 'error') => {
    const notice: Notice = { id: createId(), kind, message };
    setNotices((current) => [...current.slice(-3), notice]);
    const ttl = kind === 'error' ? 7000 : 4000;
    setTimeout(() => {
      setNotices((current) => current.filter((entry) => entry.id !== notice.id));
    }, ttl);
  }, []);

  const dismissNotice = useCallback((id: string) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
  }, []);

  const addFiles = useCallback(
    async (files: File[] | FileList) => {
      const list = Array.from(files);
      if (list.length === 0) return;

      setIsAdding(true);
      try {
        const known = itemsRef.current;
        const existing = new Set(known.map((item) => fileKey(item.file)));
        const accepted: File[] = [];

        for (const file of list) {
          if (!looksLikeGif(file)) {
            pushNotice(`"${file.name}" is not a GIF. This tool only mashes GIFs.`);
            continue;
          }
          const key = fileKey(file);
          if (existing.has(key)) {
            pushNotice(`"${file.name}" is already in the list.`, 'info');
            continue;
          }
          if (known.length + accepted.length >= MAX_SOURCES) {
            pushNotice(`Clips are limited to ${MAX_SOURCES} per mash.`);
            break;
          }
          existing.add(key);
          accepted.push(file);
        }

        if (accepted.length === 0) return;

        // Inspect in parallel but keep the incoming order.
        const inspected = await Promise.all(
          accepted.map(async (file) => {
            try {
              const result = await inspectGifFile(file);
              return { file, result };
            } catch (error) {
              pushNotice(
                `"${file.name}": ${error instanceof Error ? error.message : String(error)}`,
              );
              return null;
            }
          }),
        );

        const newItems: SourceItem[] = [];
        for (const entry of inspected) {
          if (!entry) continue;
          const { file, result } = entry;
          newItems.push({
            id: createId(),
            file,
            name: file.name,
            size: file.size,
            width: result.info.width,
            height: result.info.height,
            frameCount: result.info.frameCount,
            durationMs: result.info.durationMs,
            loop: result.info.loop,
            thumbnail: result.thumbnail,
            repeat: 1,
            fit: 'inherit',
          });
        }

        if (newItems.length > 0) {
          setItems((current) => [...current, ...newItems]);
          pushNotice(
            newItems.length === 1
              ? `Added ${newItems[0].name}`
              : `Added ${newItems.length} clips, in the order you picked them`,
            'info',
          );
        }
      } finally {
        setIsAdding(false);
      }
    },
    [pushNotice],
  );

  const remove = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  /** Move an item by `delta` positions (negative = towards the front). */
  const move = useCallback((id: string, delta: number) => {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      if (index < 0) return current;
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = current.slice();
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }, []);

  /** Move an item to an explicit index (drag & drop reordering). */
  const reorder = useCallback((id: string, targetIndex: number) => {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      if (index < 0) return current;
      const clamped = Math.max(0, Math.min(current.length - 1, targetIndex));
      if (clamped === index) return current;
      const next = current.slice();
      const [item] = next.splice(index, 1);
      next.splice(clamped, 0, item);
      return next;
    });
  }, []);

  const update = useCallback((id: string, patch: Partial<Pick<SourceItem, 'repeat' | 'fit'>>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const stats = useMemo(() => {
    const totalBytes = items.reduce((sum, item) => sum + item.size, 0);
    const totalRawFrames = items.reduce((sum, item) => sum + item.frameCount * item.repeat, 0);
    return { count: items.length, totalBytes, totalRawFrames };
  }, [items]);

  return {
    items,
    stats,
    isAdding,
    notices,
    addFiles,
    remove,
    clear,
    move,
    reorder,
    update,
    pushNotice,
    dismissNotice,
  };
}
