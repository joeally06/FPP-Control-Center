import assert from 'assert';
import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';
import { NOT_ADMIN_REDIRECT } from '../lib/admin-emails';

function print(msg: string) {
  console.log('[test-proxy-admin-pages] ' + msg);
}

// The real proxy() with real requests and a real session cookie. No server is started.
const SECRET = 'test-secret-for-the-proxy-test';
process.env.NEXTAUTH_SECRET = SECRET;
process.env.ADMIN_EMAILS = 'admin@example.com';
delete process.env.NEXTAUTH_URL; // not https, so the session cookie is named plain "next-auth.session-token"

const { proxy } = require('../proxy.ts') as typeof import('../proxy');

const cookieFor = async (email: string) => `next-auth.session-token=${await encode({ token: { email }, secret: SECRET })}`;

async function call(pathAndQuery: string, cookie?: string) {
  const request = new NextRequest(`http://localhost:3000${pathAndQuery}`, { headers: cookie ? { cookie } : {} });
  const response = await proxy(request);
  const location = response.headers.get('location');
  return { response, location, passedThrough: response.headers.get('x-middleware-next') === '1' && !location };
}

/** Where a redirect to the sign-in page sends the visitor, and what it brings them back to */
function signIn(location: string | null) {
  assert.ok(location, 'redirected');
  const url = new URL(location);
  return { path: url.pathname, back: url.searchParams.get('callbackUrl') };
}

async function main() {
  const adminPages = [
    '/analytics', '/analytics?view=requests', '/models', '/device-status', '/santa-letters',
    '/theme-settings', '/admin', '/settings', '/settings/jukebox?tab=songs',
  ];
  const publicPages = ['/', '/jukebox', '/trivia', '/privacy', '/display', '/auth/signin', '/santa/confirm', '/api/health'];

  print('Test 1: a stranger opening an admin page is sent to sign in, and comes back to the same page');
  for (const page of adminPages) {
    const { response, location } = await call(page);
    assert.strictEqual(response.status, 307, `${page} redirects`);
    const { path, back } = signIn(location);
    assert.strictEqual(path, '/auth/signin', `${page} goes to the sign-in page`);
    assert.strictEqual(back, page, `${page} returns to itself, query string included`);
  }

  print('Test 2: a signed-in admin gets every admin page');
  const admin = await cookieFor('admin@example.com');
  for (const page of adminPages) {
    assert.ok((await call(page, admin)).passedThrough, `${page} loads for the admin`);
  }

  print('Test 3: a signed-in account that is not on ADMIN_EMAILS goes to the visitor page, not the sign-in page');
  // The sign-in page sends anyone with a session straight back to where they came from, so sending them there
  // would loop. The visitor page signs them out and explains why.
  const other = await cookieFor('someone@example.com');
  for (const page of ['/analytics', '/models', '/settings/jukebox', '/analytics?view=requests']) {
    const { response, location } = await call(page, other);
    assert.strictEqual(response.status, 307, page);
    const url = new URL(location ?? '');
    assert.strictEqual(url.pathname + url.search, NOT_ADMIN_REDIRECT, page);
    assert.ok(!url.searchParams.has('callbackUrl'), 'no way back into the admin page');
  }

  print('Test 4: public pages are untouched for a visitor with no session');
  for (const page of publicPages) {
    assert.ok((await call(page)).passedThrough, `${page} is not redirected`);
  }

  print('Test 4b: the same admin pages written another way are still gated (encoded letters, doubled slash, capitals)');
  for (const page of ['/%61nalytics', '/%73ettings/jukebox', '//analytics', '/Analytics', '/MODELS', '/device%2Dstatus']) {
    const { response, location } = await call(page);
    assert.strictEqual(response.status, 307, `${page} redirects`);
    assert.strictEqual(signIn(location).path, '/auth/signin', page);
  }

  print('Test 5: a page that merely starts with an admin name is not an admin page');
  for (const page of ['/settingsfoo', '/analytics-public', '/santa']) {
    assert.ok((await call(page)).passedThrough, `${page} is not redirected`);
  }

  print('All tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
