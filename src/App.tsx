import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipList } from './components/ClipList';
import { DropZone } from './components/DropZone';
import { HelpDialog } from './components/HelpDialog';
import { Icon } from './components/Icon';
import { OrderStrip } from './components/OrderStrip';
import { OutputPanel } from './components/OutputPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { useMashJob } from './hooks/useMashJob';
import { useMashSources } from './hooks/useMashSources';
import { copyGifToClipboard, downloadBytes } from './lib/download';
import { fileToBytes, filesFromDataTransfer } from './lib/files';
import { createSampleGifs } from './lib/samples';
import {
  DEFAULT_SETTINGS,
  estimateOutput,
  loadSettings,
  saveSettings,
  toMashOptions,
  type UISettings,
} from './lib/settings';
import type { WorkerSource } from './workers/protocol';

export default function App() {
  const {
    items,
    stats,
    isAdding,
    notices,
    addFiles: addFilesToList,
    remove,
    clear,
    move,
    reorder,
    update,
    pushNotice,
    dismissNotice,
  } = useMashSources();

  const { status, progress, output, error, start, cancel, reset } = useMashJob();

  // Read persisted settings during the first render.
  const [settings, setSettings] = useState<UISettings>(() => loadSettings());
  const [helpOpen, setHelpOpen] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [mashedSignature, setMashedSignature] = useState<string | null>(null);
  const dragDepth = useRef(0);

  const updateSettings = useCallback((patch: Partial<UISettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
  }, []);

  const estimate = useMemo(() => estimateOutput(items, settings), [items, settings]);

  /** Identifies the exact clip list + settings a mash was produced from. */
  const signature = useMemo(
    () => JSON.stringify({ settings, clips: items.map((item) => [item.id, item.repeat, item.fit]) }),
    [settings, items],
  );

  const isStale = status === 'done' && mashedSignature !== null && mashedSignature !== signature;
  const canMash = items.length > 0 && status !== 'running';

  // ---------------------------------------------------------------- mashing
  const handleMash = useCallback(async () => {
    if (!canMash) return;
    const signatureAtStart = signature;
    try {
      // Read the current bytes of every clip, preserving list order.
      const payload: WorkerSource[] = await Promise.all(
        items.map(async (item) => ({
          name: item.name,
          bytes: await fileToBytes(item.file),
          options: {
            repeat: item.repeat,
            ...(item.fit === 'inherit' ? {} : { fit: item.fit }),
          },
        })),
      );
      setMashedSignature(signatureAtStart);
      await start(payload, toMashOptions(settings));

      if (window.matchMedia('(max-width: 1080px)').matches) {
        document.getElementById('output-panel')?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (caught) {
      pushNotice(
        `Could not read the clips: ${caught instanceof Error ? caught.message : String(caught)}`,
      );
    }
  }, [canMash, items, pushNotice, settings, signature, start]);

  const handleDownload = useCallback(() => {
    if (!output) return;
    const first = items[0]?.name.replace(/\.gif$/i, '') ?? 'gif';
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBytes(output.bytes, `${first}-mash-${items.length}-clips-${stamp}.gif`);
    pushNotice('GIF downloaded.', 'info');
  }, [items, output, pushNotice]);

  const handleCopy = useCallback(async () => {
    if (!output) return;
    setIsCopying(true);
    const ok = await copyGifToClipboard(output.bytes);
    setIsCopying(false);
    pushNotice(
      ok
        ? 'GIF copied to the clipboard.'
        : 'Your browser blocked clipboard access — use Download instead.',
      ok ? 'info' : 'error',
    );
  }, [output, pushNotice]);

  const handleStartOver = useCallback(() => {
    reset();
    clear();
    setMashedSignature(null);
  }, [clear, reset]);

  // ------------------------------------------------------- adding & dropping
  const addFiles = useCallback(
    (files: File[]) => {
      void addFilesToList(files);
    },
    [addFilesToList],
  );

  const handleLoadSamples = useCallback(() => {
    addFiles(createSampleGifs());
  }, [addFiles]);

  const hasFiles = useCallback((transfer: DataTransfer | null) => {
    if (!transfer) return false;
    return Array.from(transfer.types ?? []).includes('Files');
  }, []);

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event.dataTransfer)) return;
      dragDepth.current += 1;
      setIsDraggingFiles(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event.dataTransfer)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setIsDraggingFiles(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setIsDraggingFiles(false);
      const files = filesFromDataTransfer(event.dataTransfer);
      if (files.length > 0) addFiles(files);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [addFiles, hasFiles]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void handleMash();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleMash]);

  const hasClips = items.length > 0;

  return (
    <div className="app">
      <TopBar onOpenHelp={() => setHelpOpen(true)} />

      <main className="page">
        <div className="workspace">
          <div className="clips-column">
            {!hasClips && (
              <>
                <DropZone
                  compact={false}
                  isAdding={isAdding}
                  onFiles={addFiles}
                  isDragActive={isDraggingFiles}
                />
                <div className="empty-state">
                  <h3>Your playlist is empty</h3>
                  <p>
                    GIF Masher stitches any number of GIFs into one file, preserving the order you
                    add them in.
                  </p>
                  <div className="steps">
                    <div className="step">
                      <span className="step__number">01</span>
                      <span className="step__title">Add GIFs</span>
                      <span className="step__text">
                        Drop, paste or browse. Picking several at once keeps their order.
                      </span>
                    </div>
                    <div className="step">
                      <span className="step__number">02</span>
                      <span className="step__title">Arrange</span>
                      <span className="step__text">
                        Drag to reorder, repeat clips, or fit them to one canvas.
                      </span>
                    </div>
                    <div className="step">
                      <span className="step__number">03</span>
                      <span className="step__title">Mash &amp; save</span>
                      <span className="step__text">
                        Preview the result, then download it as a single GIF.
                      </span>
                    </div>
                  </div>
                  <button type="button" className="btn btn-sm" onClick={handleLoadSamples}>
                    <Icon name="sparkles" size={14} />
                    Try three sample GIFs
                  </button>
                </div>
              </>
            )}

            {hasClips && (
              <>
                <ClipList
                  items={items}
                  totalBytes={stats.totalBytes}
                  onMove={move}
                  onRemove={remove}
                  onUpdate={update}
                  onReorder={reorder}
                  onClear={clear}
                />
                <DropZone
                  compact
                  isAdding={isAdding}
                  onFiles={addFiles}
                  isDragActive={isDraggingFiles}
                />
              </>
            )}
          </div>

          <aside className="sidebar">
            <OutputPanel
              status={status}
              progress={progress}
              output={output}
              error={error}
              estimate={estimate}
              clipCount={items.length}
              isStale={isStale}
              isCopying={isCopying}
              onMash={() => void handleMash()}
              onCancel={cancel}
              onDownload={handleDownload}
              onCopy={() => void handleCopy()}
              onStartOver={handleStartOver}
            />

            <SettingsPanel
              settings={settings}
              onChange={updateSettings}
              onReset={resetSettings}
              disabled={status === 'running'}
            />

            <section className="card" aria-labelledby="order-heading">
              <header className="card__header">
                <h2 className="card__title" id="order-heading">
                  <Icon name="layers" size={15} />
                  Clips in order
                </h2>
                <span className="pill mono">{items.length}</span>
              </header>
              <div className="card__body">
                <OrderStrip items={items} />
              </div>
            </section>

          </aside>
        </div>
      </main>

      <footer className="footer">
        <div className="footer__inner">
          <span>
            <Icon name="shield" size={12} /> Your GIFs never leave this tab.
          </span>
          <span className="mono">gifenc · gifuct-js · React</span>
          <span style={{ marginLeft: 'auto' }}>
            <a
              href="https://github.com/Grobbit/GIF-masher"
              target="_blank"
              rel="noreferrer noopener"
            >
              MIT licensed
            </a>
          </span>
        </div>
      </footer>

      {isDraggingFiles && (
        <div className="drop-veil" aria-hidden="true">
          <div className="drop-veil__inner">
            <Icon name="plus" size={26} />
            Drop to add to the end of the playlist
          </div>
        </div>
      )}

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <Toasts notices={notices} onDismiss={dismissNotice} />
    </div>
  );
}
