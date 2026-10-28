import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import assert from 'assert';
import { spawnSync } from 'child_process';
import { addMissingColumns } from '../lib/db-columns';

function print(msg: string) {
  console.log('[test-database-init] ' + msg);
}

// ── addMissingColumns, on in-memory databases ─────────────────────────────
print('Test 1: adds a missing column, skips existing ones, is safe to repeat');
{
  const mem = new Database(':memory:');
  mem.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, a TEXT)');
  const specs = [
    { table: 't', column: 'a', definition: 'TEXT' },
    { table: 't', column: 'b', definition: 'INTEGER DEFAULT 5' },
  ];
  assert.deepStrictEqual(addMissingColumns(mem, specs).added, ['t.b']);
  assert.deepStrictEqual(addMissingColumns(mem, specs).added, [], 'second run adds nothing');
  mem.prepare('INSERT INTO t (a) VALUES (?)').run('x');
  assert.strictEqual((mem.prepare('SELECT b FROM t').get() as { b: number }).b, 5);

  print('Test 2: a table that does not exist yet is skipped and reported');
  const result = addMissingColumns(mem, [{ table: 'later', column: 'c', definition: 'TEXT' }]);
  assert.deepStrictEqual(result, { added: [], skippedTables: ['later'] });

  print('Test 3: a real ALTER failure is thrown, not swallowed');
  assert.throws(() => addMissingColumns(mem, [{ table: 't', column: 'bad', definition: 'NOT VALID SQL (' }]));

  print('Test 4: unsafe names are refused');
  assert.throws(() => addMissingColumns(mem, [{ table: 't; DROP TABLE t', column: 'x', definition: 'TEXT' }]), /Invalid table or column/);
  mem.close();
}

print('Test 5: only a "duplicate column name" race is ignored');
{
  const fakeDb = (message: string) => ({
    pragma: () => [{ name: 'id' }],
    exec: () => { throw new Error(message); },
  }) as unknown as Database.Database;
  const spec = [{ table: 't', column: 'b', definition: 'TEXT' }];
  assert.deepStrictEqual(addMissingColumns(fakeDb('duplicate column name: b'), spec).added, []);
  assert.throws(() => addMissingColumns(fakeDb('database is locked'), spec), /locked/);
}

// ── lib/database.ts against throwaway databases ──────────────────────────
const root = path.join(process.cwd(), 'tmp', 'test-database-init');
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });

function importDatabase(dbFile: string) {
  return spawnSync(
    process.execPath,
    ['-r', 'esbuild-register', '-e', "const m = require('./lib/database.ts'); console.log('columns:' + m.getDb().prepare(\"PRAGMA table_info(cached_sequences)\").all().map((c) => c.name).join(','))"],
    { cwd: process.cwd(), env: { ...process.env, VOTES_DB_PATH: dbFile }, encoding: 'utf-8' }
  );
}

print('Test 6: an unmigrated database fails with a clear message');
{
  const empty = path.join(root, 'empty.db');
  const run = importDatabase(empty);
  assert.notStrictEqual(run.status, 0);
  assert.match(run.stderr, /has not been set up yet/);
  assert.match(run.stderr, /node scripts\/init-database\.js/);
}

print('Test 7: after the real migrations, lib/database.ts imports, and importing again is a no-op');
{
  const migrated = path.join(root, 'migrated.db');
  const db = new Database(migrated);
  const dir = path.join(process.cwd(), 'migrations');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    db.transaction(() => db.exec(fs.readFileSync(path.join(dir, file), 'utf-8')))();
  }
  db.close();

  const first = importDatabase(migrated);
  assert.strictEqual(first.status, 0, first.stderr);
  assert.match(first.stdout, /columns:.*playlist_order/);
  const second = importDatabase(migrated);
  assert.strictEqual(second.status, 0, second.stderr);

  const check = new Database(migrated, { readonly: true });
  const cols = (check.pragma('table_info(jukebox_queue)') as Array<{ name: string }>).map((c) => c.name);
  for (const col of ['request_kind', 'latitude', 'media_name']) assert.ok(cols.includes(col), `jukebox_queue.${col}`);
  check.close();
}

fs.rmSync(root, { recursive: true, force: true });
print('All tests passed');
