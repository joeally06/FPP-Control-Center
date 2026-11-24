import assert from 'assert';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { DownloadTooLargeError, MAX_AUDIO_DOWNLOAD_BYTES, readBodyLimited } from '../lib/limited-download';

function print(msg: string) {
  console.log('[test-limited-download] ' + msg);
}

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf-8');

/** A response whose body is `chunks` pieces of `size` bytes, counting how many were pulled and whether it was cancelled */
function countedResponse(chunks: number, size: number, headers: Record<string, string> = {}) {
  const state = { pulled: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (state.pulled >= chunks) return controller.close();
      state.pulled++;
      controller.enqueue(new Uint8Array(size).fill(7));
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { response: new Response(stream, { headers }), state };
}

async function main() {
  print('Test 1: a body within the limit comes back exactly');
  assert.strictEqual((await readBodyLimited(new Response(Buffer.from('hello world')), 100)).toString(), 'hello world');
  assert.strictEqual((await readBodyLimited(new Response(Buffer.alloc(100, 1)), 100)).length, 100, 'exactly at the limit is fine');
  assert.strictEqual((await readBodyLimited(new Response(null), 100)).length, 0, 'an empty body');

  print('Test 2: a Content-Length over the limit is refused, and the body is not downloaded');
  {
    const { response, state } = countedResponse(10, 40, { 'content-length': '400' });
    await assert.rejects(readBodyLimited(response, 100), DownloadTooLargeError);
    assert.ok(state.cancelled, 'the stream was cancelled');
    assert.ok(state.pulled <= 2, `almost nothing was read (${state.pulled} chunks)`);
  }

  print('Test 3: with no Content-Length, reading stops as soon as the limit is passed');
  {
    const { response, state } = countedResponse(1000, 40);
    await assert.rejects(readBodyLimited(response, 100), (error: unknown) => error instanceof DownloadTooLargeError);
    assert.ok(state.cancelled, 'the stream was cancelled');
    assert.ok(state.pulled < 10, `it did not read the whole body (${state.pulled} of 1000 chunks)`);
  }

  print('Test 4: a body that stalls after the headers is cut off by the signal while it is being read');
  {
    const server = http.createServer((request, response) => {
      response.writeHead(200, { 'content-type': 'audio/mpeg' });
      response.write('start'); // and then nothing, ever
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };
    try {
      const started = Date.now();
      const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(300) });
      assert.strictEqual(response.status, 200, 'the headers arrived');
      await assert.rejects(readBodyLimited(response, 1_000_000), (error: Error) => ['TimeoutError', 'AbortError'].includes(error.name), 'the stalled body is aborted');
      assert.ok(Date.now() - started < 5000, 'and it happened promptly');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  print('Test 5: the download routes use the limited reader and one deadline over the whole download');
  assert.strictEqual(MAX_AUDIO_DOWNLOAD_BYTES, 50 * 1024 * 1024);
  const fppMedia = read('app', 'api', 'fpp', 'media', 'download', 'route.ts');
  const audio = read('app', 'api', 'audio', 'download', 'route.ts');
  for (const [name, source] of [['fpp/media/download', fppMedia], ['audio/download', audio]] as const) {
    assert.ok(source.includes('readBodyLimited('), `${name} reads through readBodyLimited`);
    assert.ok(!/\.arrayBuffer\(\)/.test(source), `${name} no longer reads the whole body unchecked`);
    assert.ok(source.includes('DownloadTooLargeError'), `${name} answers 413 when the file is too big`);
  }
  assert.ok(fppMedia.includes('AbortSignal.timeout('), 'fpp/media/download has one signal over headers and body');
  assert.ok(!fppMedia.includes('clearTimeout('), 'its timer is no longer cleared as soon as the headers arrive');
  assert.ok(/TimeoutError/.test(fppMedia), 'a signal timeout is reported as a timeout (504)');

  print('All tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
