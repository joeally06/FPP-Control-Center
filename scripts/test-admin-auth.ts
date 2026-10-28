import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { isAdminEmail, parseAdminEmails } from '../lib/admin-emails';

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

print('All tests passed');
