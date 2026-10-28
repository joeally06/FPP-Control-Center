import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { getVotesDbPath } from '../lib/db-path';

function print(msg: string) {
  console.log('[test-db-connections] ' + msg);
}

print('Test 1: getVotesDbPath honours VOTES_DB_PATH and defaults to ./votes.db');
const saved = process.env.VOTES_DB_PATH;
try {
  delete process.env.VOTES_DB_PATH;
  assert.strictEqual(getVotesDbPath(), path.join(process.cwd(), 'votes.db'));
  process.env.VOTES_DB_PATH = '/tmp/elsewhere.db';
  assert.strictEqual(getVotesDbPath(), '/tmp/elsewhere.db');
  process.env.VOTES_DB_PATH = '';
  assert.strictEqual(getVotesDbPath(), path.join(process.cwd(), 'votes.db'), 'an empty value falls back to the default');
} finally {
  if (saved === undefined) delete process.env.VOTES_DB_PATH;
  else process.env.VOTES_DB_PATH = saved;
}

// Source scans: keep database access on the shared connections
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
const read = (file: string) => fs.readFileSync(file, 'utf-8');
const appFiles = walk(path.join(root, 'app'));
const libFiles = walk(path.join(root, 'lib'));

print('Test 2: nothing under app/ opens or imports a database driver itself');
const appOffenders = appFiles
  .filter((file) => /new Database\(|from ['"]better-sqlite3['"]|require\(['"]better-sqlite3['"]\)/.test(read(file)))
  .map(rel);
assert.deepStrictEqual(appOffenders, [], `Routes must use getDb()/getReadOnlyDb() from lib/database: ${appOffenders.join(', ')}`);

print('Test 3: only the files that need their own connection open one in lib/');
// database.ts: the shared connections. fpp-poller and circuit-breaker run in the poller process,
// rate-limit keeps its own lazy read-only connection (so importing it never opens the live DB
// in tests), migrations-runner works on whatever path it is given.
const ownConnection = new Set(['lib/database.ts', 'lib/fpp-poller.ts', 'lib/circuit-breaker.ts', 'lib/rate-limit.ts', 'lib/migrations-runner.ts']);
const libOffenders = libFiles
  .filter((file) => !ownConnection.has(rel(file)))
  .filter((file) => /new Database\(/.test(read(file)))
  .map(rel);
assert.deepStrictEqual(libOffenders, [], `Use getDb()/getReadOnlyDb(): ${libOffenders.join(', ')}`);

print('Test 3b: nothing closes the shared connections (that would break the whole app)');
// The files in ownConnection close only the connections they opened themselves.
const closeCall = /\b(getDb|getReadOnlyDb)\(\)\s*\.close\(|\b(db|database)\.close\(/;
const closeOffenders = [...appFiles, ...libFiles]
  .filter((file) => !ownConnection.has(rel(file)))
  .filter((file) => closeCall.test(read(file)))
  .map(rel);
assert.deepStrictEqual(closeOffenders, [], `Never close the shared connection: ${closeOffenders.join(', ')}`);

print('Test 4: only lib/db-path.ts builds the votes.db path');
const pathOffenders = [...appFiles, ...libFiles]
  .filter((file) => rel(file) !== 'lib/db-path.ts')
  .filter((file) => /join\([^)]*['"]votes\.db['"]/.test(read(file)))
  .map(rel);
assert.deepStrictEqual(pathOffenders, [], `Use getVotesDbPath(): ${pathOffenders.join(', ')}`);

print('Test 5: nothing turns the shared connection read-only (query_only would block every write app-wide)');
const queryOnly = [...appFiles, ...libFiles].filter((file) => /pragma\(\s*['"`]query_only/.test(read(file))).map(rel);
assert.deepStrictEqual(queryOnly, [], `Use getReadOnlyDb() for read-only routes instead: ${queryOnly.join(', ')}`);

print('All tests passed');
