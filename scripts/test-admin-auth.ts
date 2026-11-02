import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { adminSignInResult, isAdminEmail, NOT_ADMIN_REDIRECT, parseAdminEmails } from '../lib/admin-emails';

function print(msg: string) {
  console.log('[test-admin-auth] ' + msg);
}

const saved = process.env.ADMIN_EMAILS;

try {
  print('Test 1: spaces and case in ADMIN_EMAILS and in the address do not matter');
  process.env.ADMIN_EMAILS = ' Joe@Example.com ,  b@x.com,, ';
  assert.deepStrictEqual(parseAdminEmails(), ['joe@example.com', 'b@x.com']);
  assert.strictEqual(isAdminEmail('joe@example.com'), true);
  assert.strictEqual(isAdminEmail('JOE@EXAMPLE.COM'), true);
  assert.strictEqual(isAdminEmail(' b@x.com '), true, 'the second entry after a ", " works');

  print('Test 2: near matches and missing values are not admins');
  assert.strictEqual(isAdminEmail('evil@x.com'), false);
  assert.strictEqual(isAdminEmail('x.com'), false);
  assert.strictEqual(isAdminEmail('joe@example.com.evil.com'), false);
  assert.strictEqual(isAdminEmail(''), false);
  assert.strictEqual(isAdminEmail(null), false);
  assert.strictEqual(isAdminEmail(undefined), false);

  print('Test 3: an empty or missing list means nobody is an admin');
  process.env.ADMIN_EMAILS = '';
  assert.strictEqual(isAdminEmail('joe@example.com'), false);
  assert.strictEqual(isAdminEmail(''), false);
  delete process.env.ADMIN_EMAILS;
  assert.strictEqual(isAdminEmail('joe@example.com'), false);

  print('Test 4: a changed list applies on the next call (read every time)');
  process.env.ADMIN_EMAILS = 'a@x.com,b@x.com';
  assert.strictEqual(isAdminEmail('b@x.com'), true);
  process.env.ADMIN_EMAILS = 'a@x.com';
  assert.strictEqual(isAdminEmail('b@x.com'), false);

  print('Test 4b: sign-in lets admins in and sends everyone else to the visitor page');
  process.env.ADMIN_EMAILS = 'a@x.com';
  assert.strictEqual(adminSignInResult('a@x.com'), true);
  assert.strictEqual(adminSignInResult(' A@X.COM '), true);
  for (const email of ['b@x.com', 'a@x.com.evil.com', '', null, undefined]) {
    assert.strictEqual(adminSignInResult(email), NOT_ADMIN_REDIRECT, `refused: ${String(email)}`);
  }
  assert.ok(NOT_ADMIN_REDIRECT.startsWith('/jukebox') && !NOT_ADMIN_REDIRECT.startsWith('//'), 'a path on this site');
  process.env.ADMIN_EMAILS = '';
  assert.strictEqual(adminSignInResult('a@x.com'), NOT_ADMIN_REDIRECT, 'no list means nobody gets in');
} finally {
  if (saved === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = saved;
}

// Source scan: keep every server-side admin decision on lib/admin-emails.ts
print('Test 5: no route trusts the JWT role or hand-parses ADMIN_EMAILS');
const root = process.cwd();
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}
const rel = (file: string) => path.relative(root, file).split(path.sep).join('/');

const roleCheck = /\brole\s*[!=]==?\s*['"]admin['"]/;
const apiRoutes = walk(path.join(root, 'app', 'api')).filter((file) => file.endsWith('route.ts'));
// proxy.ts gates /dashboard and /settings, so it is held to the same rule
const roleOffenders = [...apiRoutes, path.join(root, 'proxy.ts')].filter((file) => roleCheck.test(fs.readFileSync(file, 'utf-8'))).map(rel);
assert.deepStrictEqual(roleOffenders, [], `API routes and proxy.ts must use isAdminSession()/isAdminEmail(), not the JWT role: ${roleOffenders.join(', ')}`);

const allowedEnvReaders = new Set(['lib/admin-emails.ts']);
const envOffenders = [...walk(path.join(root, 'app')), ...walk(path.join(root, 'lib')), path.join(root, 'proxy.ts')]
  .filter((file) => !allowedEnvReaders.has(rel(file)))
  .filter((file) => /process\.env\.ADMIN_EMAILS/.test(fs.readFileSync(file, 'utf-8')))
  .map(rel);
assert.deepStrictEqual(envOffenders, [], `Only lib/admin-emails.ts may read ADMIN_EMAILS: ${envOffenders.join(', ')}`);

print('Test 6: the sign-in callback uses adminSignInResult and no longer lets every Google account in');
const authRoute = fs.readFileSync(path.join(root, 'app', 'api', 'auth', '[...nextauth]', 'route.ts'), 'utf-8');
assert.ok(/return adminSignInResult\(user\.email\)/.test(authRoute), 'signIn must return adminSignInResult(user.email)');
// The whole signIn callback, up to the next one: it must have no other way to return true
const signInCallback = authRoute.slice(authRoute.indexOf('async signIn('), authRoute.indexOf('async jwt('));
assert.ok(signInCallback.length > 0 && signInCallback.includes('async signIn('), 'found the signIn callback');
assert.ok(!/return\s+true\b/.test(signInCallback), 'signIn must not return true for anyone but through adminSignInResult');

print('Test 7: the jukebox page explains the refusal and signs a non-admin out');
const jukeboxPage = fs.readFileSync(path.join(root, 'app', 'jukebox', 'page.tsx'), 'utf-8');
assert.ok(jukeboxPage.includes("get('signin') !== 'denied'"), 'the page reads ?signin=denied');
assert.ok(jukeboxPage.includes('signOut({ callbackUrl: NOT_ADMIN_REDIRECT })'), 'the page signs a signed-in non-admin out');
// React runs effects twice in development and cancels the first timer: if the parameter were dropped before the
// timer fires, the second run would find nothing and the note would never show
const denyEffect = jukeboxPage.slice(jukeboxPage.indexOf("get('signin') !== 'denied'"));
const denyEffectBody = denyEffect.slice(0, denyEffect.indexOf('}, []);'));
assert.ok(denyEffectBody.includes('setShowNotAdminNotice(true)'), 'the effect sets the note');
assert.ok(denyEffectBody.indexOf('setTimeout') !== -1 && denyEffectBody.indexOf('setTimeout') < denyEffectBody.indexOf('replaceState'), 'the parameter is dropped inside the timer, after the note is set');
assert.ok(denyEffectBody.indexOf('setShowNotAdminNotice(true)') < denyEffectBody.indexOf('replaceState'), 'the note is set before the parameter is dropped');

print('All tests passed');
