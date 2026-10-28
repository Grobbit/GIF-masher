/** Saving the finished GIF. */

/** Turn the bytes into a blob URL the `<img>` preview can animate. */
export function bytesToObjectUrl(bytes: Uint8Array): string {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'image/gif' });
  return URL.createObjectURL(blob);
}

export function safeFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/\.gif$/i, '')
    .replace(/[^a-z0-9-_ .]+/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
  return `${cleaned || 'gif-mash'}.gif`;
}

/** Trigger a download of the given bytes. */
export function downloadBytes(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'image/gif' });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, safeFileName(fileName));
  // Give the browser a moment to start the download before cleaning up.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadUrl(url: string, fileName: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** Copy the finished GIF to the clipboard (where supported). */
export async function copyGifToClipboard(bytes: Uint8Array): Promise<boolean> {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    if (!window.isSecureContext) return false;
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'image/gif' });
    await navigator.clipboard.write([new ClipboardItem({ 'image/gif': blob })]);
    return true;
  } catch {
    return false;
  }
}
