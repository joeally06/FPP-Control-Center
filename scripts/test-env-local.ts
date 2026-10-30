import path from 'path';
import fs from 'fs';
import assert from 'assert';
import { spawnSync } from 'child_process';
import { parse } from 'dotenv';
import { loadEnvConfig } from '@next/env';

// scripts/env-local.js writes the .env.local that setup.sh creates. Whatever the user types
// (passwords with $ # & | \ quotes) must come back unchanged through both readers the app uses:
// Next.js (@next/env: dotenv + dotenv-expand) and the poller (dotenv).

function print(msg: string) {
  console.log('[test-env-local] ' + msg);
}

const root = path.join(process.cwd(), 'tmp', 'test-env-local');
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });

const script = path.join(process.cwd(), 'scripts', 'env-local.js');

function run(args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH ?? '', ...env } as unknown as NodeJS.ProcessEnv,
    encoding: 'utf-8',
  });
}

const values: Record<string, string> = {
  NEXTAUTH_URL: 'http://192.168.1.50:3000',
  NEXTAUTH_SECRET: 'abc123=def==',
  ADMIN_EMAILS: 'a@example.com,b@example.com',
  FPP_URL: 'http://192.168.1.2:80',
  GOOGLE_CLIENT_ID: '1234-abc.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'GOCSPX-a"b',
  SPOTIFY_CLIENT_SECRET: "x'y",
  SMTP_PASS: 'p@ss$word#1 &|\\',
  SMTP_USER: 'me@example.com',
  OLLAMA_URL: 'http://localhost:11434',
  NEXT_PUBLIC_TIMEZONE: 'America/Chicago',
  INTERNAL_API_KEY: 'deadbeef',
};

print('Test 1: write creates the file');
const file = path.join(root, '.env.local');
const written = run(['write', file], values);
assert.strictEqual(written.status, 0, written.stderr);
assert.ok(fs.existsSync(file));

print('Test 2: plain values are written bare, so grep-based scripts still match them');
const text = fs.readFileSync(file, 'utf-8');
assert.match(text, /^FPP_URL=http:\/\/192\.168\.1\.2:80$/m);
assert.match(text, /^ADMIN_EMAILS=a@example\.com,b@example\.com$/m);
assert.match(text, /^INTERNAL_API_KEY=deadbeef$/m);

print('Test 3: dotenv (the poller) reads every value back unchanged, apart from the $ escape');
const parsed = parse(text);
for (const [key, value] of Object.entries(values)) {
  assert.strictEqual(parsed[key]?.replace(/\\\$/g, '$'), value, `dotenv: ${key}`);
}

print('Test 4: Next.js (@next/env, with variable expansion) reads every value back unchanged');
for (const key of Object.keys(values)) delete process.env[key];
loadEnvConfig(root, false, { info: () => {}, error: () => {} }, true);
for (const [key, value] of Object.entries(values)) {
  assert.strictEqual(process.env[key], value, `next: ${key}`);
}

print('Test 5: get returns the original value, including one with = and $');
for (const [key, value] of Object.entries(values)) {
  const got = run(['get', key, file]);
  assert.strictEqual(got.status, 0, got.stderr);
  assert.strictEqual(got.stdout.replace(/\n$/, ''), value, `get: ${key}`);
}
assert.strictEqual(run(['get', 'NOT_THERE', file]).stdout, '');

print('Test 6: a missing value is written as empty, not as the word undefined');
const emptyFile = path.join(root, 'empty.env');
assert.strictEqual(run(['write', emptyFile], { NEXTAUTH_URL: 'http://localhost:3000' }).status, 0);
assert.match(fs.readFileSync(emptyFile, 'utf-8'), /^TRUSTED_DOMAINS=$/m);

print('Test 7: a value with a newline is refused and no file is written');
const badFile = path.join(root, 'bad.env');
const bad = run(['write', badFile], { SMTP_PASS: 'line1\nline2' });
assert.notStrictEqual(bad.status, 0);
assert.match(bad.stderr, /SMTP_PASS/);
assert.ok(!fs.existsSync(badFile));

print('Test 8: awkward values survive Next.js and get() (expansion, escapes, quotes, edges)');
const awkward = ['a\\$b', 'a\\nb', 'it\'s "x" `y`', 'tail\\', "q'uote\\n", '${HOME}x', '$HOME', ' lead and trail ', '#hash', ''];
const awkwardFile = path.join(root, 'awkward', '.env.local');
fs.mkdirSync(path.dirname(awkwardFile), { recursive: true });
for (const value of awkward) {
  const result = run(['write', awkwardFile], { SMTP_PASS: value });
  if (result.status !== 0) {
    // Refusing is acceptable for a value no .env syntax can hold; silently changing it is not
    assert.match(result.stderr, /cannot hold/, `unexpected failure for ${JSON.stringify(value)}`);
    continue;
  }
  delete process.env.SMTP_PASS;
  loadEnvConfig(path.dirname(awkwardFile), false, { info: () => {}, error: () => {} }, true);
  assert.strictEqual(process.env.SMTP_PASS ?? '', value, `next: ${JSON.stringify(value)}`);
  assert.strictEqual(run(['get', 'SMTP_PASS', awkwardFile]).stdout.replace(/\n$/, ''), value, `get: ${JSON.stringify(value)}`);
}

if (process.platform !== 'win32') {
  print('Test 9: the file is private to its owner');
  assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
}

fs.rmSync(root, { recursive: true, force: true });
print('All tests passed');
