/** The most audio the app will pull from the FPP in one file */
export const MAX_AUDIO_DOWNLOAD_BYTES = 50 * 1024 * 1024;

export class DownloadTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`Download is larger than ${maxBytes} bytes`);
    this.name = 'DownloadTooLargeError';
  }
}

/**
 * Read a response body, refusing more than `maxBytes`. A response that announces a size over the limit is
 * turned away without being read; one that doesn't say (or says wrong) is cancelled the moment the running
 * total passes the limit, so it never sits whole in memory. The request's own abort signal keeps applying while
 * the body is read, so a stalled download ends with that signal's timeout error.
 */
export async function readBodyLimited(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new DownloadTooLargeError(maxBytes);
  }
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new DownloadTooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}
