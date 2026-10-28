/// <reference lib="webworker" />
/**
 * Web Worker entry point.
 *
 * Decoding and quantising GIFs is CPU heavy; doing it off the main thread keeps
 * the UI (and the progress bar) responsive. Input bytes are *transferred*, so
 * no copies are made, and the finished GIF is transferred back the same way.
 */

import { mashGifs } from '../core/mash';
import type { WorkerRequest, WorkerResponse } from './protocol';

const context = self as unknown as DedicatedWorkerGlobalScope;

function post(response: WorkerResponse, transfer?: Transferable[]): void {
  context.postMessage(response, transfer ?? []);
}

context.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (!request || request.type !== 'mash') return;

  const { id } = request;
  try {
    const result = await mashGifs(request.sources, request.options, {
      onProgress: (progress) => post({ type: 'progress', id, progress }),
    });

    // `bytes` owns a fresh buffer, so transferring it is safe.
    post({ type: 'done', id, result }, [result.bytes.buffer]);
  } catch (error) {
    post({
      type: 'error',
      id,
      message: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : 'Error',
    });
  }
};
