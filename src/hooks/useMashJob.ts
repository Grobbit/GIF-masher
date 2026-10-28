import { useCallback, useEffect, useRef, useState } from 'react';
import { bytesToObjectUrl } from '../lib/download';
import type { MashOptions, MashProgress, MashWarning } from '../core/types';
import type { WorkerRequest, WorkerResponse, WorkerSource } from '../workers/protocol';

export type MashStatus = 'idle' | 'running' | 'done' | 'error';

export interface MashOutput {
  bytes: Uint8Array;
  url: string;
  width: number;
  height: number;
  frameCount: number;
  durationMs: number;
  byteLength: number;
  warnings: MashWarning[];
}

export interface MashJobState {
  status: MashStatus;
  progress: MashProgress | null;
  output: MashOutput | null;
  error: string | null;
  start: (sources: WorkerSource[], options: MashOptions) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

let jobCounter = 0;

/**
 * Runs mashes inside a Web Worker (falling back to the main thread when Workers
 * are unavailable) and owns the preview object URL.
 */
export function useMashJob(): MashJobState {
  const [status, setStatus] = useState<MashStatus>('idle');
  const [progress, setProgress] = useState<MashProgress | null>(null);
  const [output, setOutput] = useState<MashOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const jobIdRef = useRef(0);
  const resolverRef = useRef<((result: MashOutput | null) => void) | null>(null);
  const urlRef = useRef<string | null>(null);

  const revokeUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const disposeWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(
    () => () => {
      disposeWorker();
      revokeUrl();
    },
    [disposeWorker, revokeUrl],
  );

  const finish = useCallback((result: MashOutput | null) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
  }, []);

  const ensureWorker = useCallback((): Worker | null => {
    if (workerRef.current) return workerRef.current;
    if (typeof Worker === 'undefined') return null;
    try {
      const worker = new Worker(new URL('../workers/mash.worker.ts', import.meta.url), {
        type: 'module',
        name: 'gif-masher',
      });
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data;
        if (message.id !== jobIdRef.current) return;

        if (message.type === 'progress') {
          setProgress(message.progress);
          return;
        }
        if (message.type === 'done') {
          const result = message.result;
          revokeUrl();
          const url = bytesToObjectUrl(result.bytes);
          urlRef.current = url;
          const next: MashOutput = {
            bytes: result.bytes,
            url,
            width: result.width,
            height: result.height,
            frameCount: result.frameCount,
            durationMs: result.durationMs,
            byteLength: result.byteLength,
            warnings: result.warnings,
          };
          setOutput(next);
          setStatus('done');
          setProgress(null);
          finish(next);
          return;
        }
        setStatus('error');
        setError(message.message);
        setProgress(null);
        finish(null);
      };
      worker.onerror = () => {
        setStatus('error');
        setError('The encoder crashed. Try again with a smaller clip or fewer frames.');
        setProgress(null);
        finish(null);
      };
      workerRef.current = worker;
      return worker;
    } catch {
      return null;
    }
  }, [finish, revokeUrl]);

  const runOnMainThread = useCallback(
    async (sources: WorkerSource[], options: MashOptions) => {
      const { mashGifs } = await import('../core/mash');
      const result = await mashGifs(sources, options, {
        onProgress: setProgress,
      });
      revokeUrl();
      const url = bytesToObjectUrl(result.bytes);
      urlRef.current = url;
      const next: MashOutput = {
        bytes: result.bytes,
        url,
        width: result.width,
        height: result.height,
        frameCount: result.frameCount,
        durationMs: result.durationMs,
        byteLength: result.byteLength,
        warnings: result.warnings,
      };
      setOutput(next);
      setStatus('done');
      setProgress(null);
      finish(next);
    },
    [finish, revokeUrl],
  );

  const start = useCallback(
    async (sources: WorkerSource[], options: MashOptions) => {
      if (sources.length === 0) return;
      jobCounter += 1;
      const id = jobCounter;
      jobIdRef.current = id;

      setStatus('running');
      setError(null);
      setProgress({ progress: 0, stage: 'Preparing', framesDone: 0, framesTotal: 0 });

      const worker = ensureWorker();
      if (!worker) {
        try {
          await runOnMainThread(sources, options);
        } catch (caught) {
          setStatus('error');
          setError(caught instanceof Error ? caught.message : String(caught));
          setProgress(null);
        }
        return;
      }

      // Transfer the buffers instead of copying them.
      const transfer = sources.map((source) => source.bytes.buffer as ArrayBuffer);
      const request: WorkerRequest = { type: 'mash', id, sources, options };
      worker.postMessage(request, transfer);
    },
    [ensureWorker, runOnMainThread],
  );

  const cancel = useCallback(() => {
    if (status !== 'running') return;
    // Terminating the worker drops the in-flight job; the next mash spins up a
    // fresh one, and any late messages from the old worker are ignored by id.
    disposeWorker();
    setStatus('idle');
    setProgress(null);
    setError(null);
    finish(null);
  }, [disposeWorker, finish, status]);

  const reset = useCallback(() => {
    revokeUrl();
    setOutput(null);
    setStatus('idle');
    setProgress(null);
    setError(null);
  }, [revokeUrl]);

  return { status, progress, output, error, start, cancel, reset };
}
