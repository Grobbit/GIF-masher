/** Message protocol shared by the main thread and the mash worker. */

import type { MashOptions, MashProgress, MashResult, SourceOptions } from '../core/types';

export interface WorkerSource {
  bytes: Uint8Array;
  name: string;
  options?: SourceOptions;
}

export interface MashRequest {
  type: 'mash';
  id: number;
  sources: WorkerSource[];
  options: MashOptions;
}

export interface CancelRequest {
  type: 'cancel';
  id: number;
}

export type WorkerRequest = MashRequest | CancelRequest;

export interface ProgressMessage {
  type: 'progress';
  id: number;
  progress: MashProgress;
}

export interface DoneMessage {
  type: 'done';
  id: number;
  result: MashResult;
}

export interface ErrorMessage {
  type: 'error';
  id: number;
  message: string;
  /** Name of the original error, so the UI can special-case decode failures. */
  errorName: string;
}

export type WorkerResponse = ProgressMessage | DoneMessage | ErrorMessage;
