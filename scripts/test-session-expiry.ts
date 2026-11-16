import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { installSessionExpiryGuard, isAdminPath, safeCallbackUrl, signInUrl } from '../lib/session-expiry';

function print(msg: string) {
  console.log('[test-session-expiry] ' + msg);
}

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf-8');

type FetchArgs = Parameters<typeof fetch>;

/** A stand-in for `window`: fetch must be called with this as `this`, like the real one */
function fakeWindow(reply: (url: string) => Response) {
  const calls: string[] = [];
  const win = {
    location: { origin: 'https://show.example.com' },
    fetch(this: unknown, ...args: FetchArgs): Promise<Response> {
      assert.strictEqual(this, win, 'fetch is called on the window, not detached (browsers throw "Illegal invocation")');
      const url = String(args[0] instanceof Request ? args[0].url : args[0]);
      calls.push(url);
      return Promise.resolve(reply(url));
    },
  };
  return { win, calls };
}

async function main() {
  print('Test 1: which pages are admin pages');
  for (const p of ['/dashboard', '/settings', '/settings/jukebox', '/admin', '/analytics', '/models', '/device-status', '/theme-settings']) {
    assert.strictEqual(isAdminPath(p), true, p);
  }
  for (const p of ['/', '/jukebox', '/trivia', '/santa', '/auth/signin', '/display', '/settingsfoo', '/privacy']) {
    assert.strictEqual(isAdminPath(p), false, p);
  }

  print('Test 2: the sign-in link brings the admin back to the page they were on');
  assert.strictEqual(signInUrl('/settings/jukebox', '?tab=season'), '/auth/signin?callbackUrl=%2Fsettings%2Fjukebox%3Ftab%3Dseason');
  assert.strictEqual(signInUrl('/dashboard', ''), '/auth/signin?callbackUrl=%2Fdashboard');

  print('Test 3: the return address can only be a page on this site');
  const site = 'https://show.example.com';
  assert.strictEqual(safeCallbackUrl('/settings?tab=rules', site), '/settings?tab=rules');
  assert.strictEqual(safeCallbackUrl('https://show.example.com/settings/jukebox', site), '/settings/jukebox', 'next-auth sends the full address');
  for (const bad of ['https://evil.com/x', '//evil.com', '/\\evil.com', '/\t/evil.com', '/\n/evil.com', 'javascript:alert(1)', '', null, undefined]) {
    assert.strictEqual(safeCallbackUrl(bad as string | null | undefined, site), '/', JSON.stringify(bad));
  }

  print('Test 4: an expired session on a save sends the admin to sign in, once');
  {
    const { win } = fakeWindow(() => new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 }));
    let expired = 0;
    const stop = installSessionExpiryGuard(win, () => { expired++; });
    const res = await win.fetch('/api/settings', { method: 'PUT' });
    assert.strictEqual(res.status, 401, 'the page still gets the response');
    await win.fetch('/api/settings');
    await win.fetch('https://show.example.com/api/admin/jukebox-setup');
    assert.strictEqual(expired, 1, 'redirect fires once even if several requests fail together');
    stop();
  }

  print('Test 4b: if the server says the session is still good, a later failure is checked again');
  {
    const { win } = fakeWindow(() => new Response('{}', { status: 401 }));
    let asked = 0;
    installSessionExpiryGuard(win, () => { asked++; return false; });
    await win.fetch('/api/fppd/status');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await win.fetch('/api/fppd/status');
    assert.strictEqual(asked, 2);
  }

  print('Test 5: other answers are left alone');
  {
    const statuses = [200, 400, 403, 404, 429, 500];
    for (const status of statuses) {
      const { win } = fakeWindow(() => new Response('{}', { status }));
      let expired = 0;
      installSessionExpiryGuard(win, () => { expired++; });
      await win.fetch('/api/settings');
      assert.strictEqual(expired, 0, `status ${status}`);
    }
  }

  print('Test 6: a route that wraps the sign-in failure in a 500 still counts');
  {
    const { win } = fakeWindow(() => new Response(JSON.stringify({ error: 'INTERNAL_ERROR', message: 'Authentication required' }), { status: 500 }));
    let expired = 0;
    installSessionExpiryGuard(win, () => { expired++; });
    await win.fetch('/api/settings');
    assert.strictEqual(expired, 1);
  }

  print('Test 7: sign-in calls, other sites and non-API paths never trigger it');
  {
    const { win } = fakeWindow(() => new Response('{}', { status: 401 }));
    let expired = 0;
    installSessionExpiryGuard(win, () => { expired++; });
    await win.fetch('/api/auth/session');
    await win.fetch('/api/auth/callback/google');
    await win.fetch('https://other.example.net/api/settings');
    await win.fetch('/some/page');
    assert.strictEqual(expired, 0);
  }

  print('Test 8: uninstalling restores the real fetch');
  {
    const { win } = fakeWindow(() => new Response('{}', { status: 401 }));
    const original = win.fetch;
    const stop = installSessionExpiryGuard(win, () => {});
    assert.notStrictEqual(win.fetch, original);
    stop();
    assert.strictEqual(win.fetch, original);
  }

  print('Test 9: the guard is mounted for every page, and sign-in returns to the page');
  assert.ok(read('app', 'providers.tsx').includes('SessionExpiryGuard'));
  const signin = read('app', 'auth', 'signin', 'page.tsx');
  assert.ok(signin.includes('callbackUrl'), 'sign-in page honours callbackUrl');
  assert.ok(signin.includes('safeCallbackUrl'), 'and only for pages on this site');

  print('All tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
