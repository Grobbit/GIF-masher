/** Browser file helpers: validation, metadata, thumbnails. */

import { readGifInfo } from '../core/decode';
import type { GifInfo } from '../core/decode';

export const MAX_FILE_BYTES = 40 * 1024 * 1024; // 40 MB per clip

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * Quick pre-filter before the (more expensive) signature check.
 *
 * Browsers are inconsistent about the MIME type of pasted or dragged files, so
 * anything unrecognised is let through and validated by `isGif()` later. Only
 * files that are clearly something else (a PNG, a text file, ...) are rejected
 * up front.
 */
export function looksLikeGif(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === 'image/gif') return true;
  if (type.startsWith('image/')) return /\.gif$/i.test(file.name);
  if (type) return /\.gif$/i.test(file.name);
  return true;
}

export async function fileToBytes(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

export interface InspectedFile {
  info: GifInfo;
  thumbnail: string | null;
}

/**
 * Validate a file and pull out everything the UI shows on a clip card.
 * Throws a human readable error when the file is not a usable GIF.
 */
export async function inspectGifFile(file: File): Promise<InspectedFile> {
  if (file.size === 0) throw new Error('That file is empty.');
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('That GIF is larger than 40 MB. Try a smaller clip.');
  }

  const bytes = await fileToBytes(file);
  const info = readGifInfo(bytes); // throws GifDecodeError when malformed

  let thumbnail: string | null = null;
  try {
    thumbnail = await createThumbnail(file);
  } catch {
    // A broken preview must never block adding the clip.
    thumbnail = null;
  }

  return { info, thumbnail };
}

/**
 * Render the first frame of the GIF into a small data URL.
 * `createImageBitmap` decodes just enough of the file to produce frame one,
 * which is far cheaper than decoding every frame in JS.
 */
export async function createThumbnail(file: File, maxEdge = 320): Promise<string | null> {
  if (typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl.startsWith('data:image') ? dataUrl : null;
  } finally {
    bitmap.close?.();
  }
}

/** Files dragged from the OS or pasted into a page. */
export function filesFromDataTransfer(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) return [];
  const files: File[] = [];
  if (dataTransfer.items && dataTransfer.items.length > 0) {
    for (const item of Array.from(dataTransfer.items)) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  if (files.length === 0 && dataTransfer.files) {
    files.push(...Array.from(dataTransfer.files));
  }
  return files;
}
