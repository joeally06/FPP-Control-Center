import assert from 'assert';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { migrateDatabase } from './database-migrations';
import { withBuildDatabase } from './build';
import { assertDatabaseReady } from '../lib/db-compatibility';
import { applySchema } from '../lib/db-schema';

const tmp = path.resolve('tmp');
fs.mkdirSync(tmp, { recursive: true });
const dir = fs.mkdtempSync(path.join(tmp, 'test-lifecycle-'));
const database = path.join(dir, 'sentinel.db');
const db = new Database(database);
try {
  console.log('[test-database-lifecycle] fresh setup, repeated migration, existing data');
  assert.throws(() => assertDatabaseReady(db), /needs migration/);
  assert.ok(migrateDatabase(db) > 0);
  assertDatabaseReady(db);
  db.prepare("UPDATE settings SET value = 'Sentinel show' WHERE key = 'display_show_name'").run();
  db.prepare("INSERT INTO jukebox_queue (sequence_name, requester_ip) VALUES ('Keep me', 'test')").run();
  assert.strictEqual(migrateDatabase(db), 0);
  const dump = () => JSON.stringify({ schema: db.prepare('SELECT * FROM sqlite_master ORDER BY name').all(), settings: db.prepare('SELECT * FROM settings ORDER BY key').all(), queue: db.prepare('SELECT * FROM jukebox_queue').all() });
  const before = dump();

  console.log('[test-database-lifecycle] failed upgrade rolls back the entire pending batch');
  const failing = path.join(dir, 'migrations');
  fs.mkdirSync(failing);
  fs.writeFileSync(path.join(failing, '999_first.sql'), "UPDATE settings SET value = 'wrong' WHERE key = 'display_show_name'; CREATE TABLE should_rollback (id INTEGER);");
  fs.writeFileSync(path.join(failing, '999_second.sql'), 'INVALID SQL;');
  assert.throws(() => migrateDatabase(db, failing));
  assert.strictEqual(dump(), before);

  console.log('[test-database-lifecycle] importing application database changes no schema/data');
  const imported = spawnSync(process.execPath, ['-r', 'esbuild-register', '-e', "require('./lib/database.ts').getDb().close()"], { env: { ...process.env, VOTES_DB_PATH: database }, encoding: 'utf8' });
  assert.strictEqual(imported.status, 0, imported.stderr);
  assert.strictEqual(dump(), before);

  console.log('[test-database-lifecycle] build database is separate and scoped to child environment');
  const originalPath = process.env.VOTES_DB_PATH;
  process.env.VOTES_DB_PATH = database;
  let disposable = '';
  try {
    withBuildDatabase((env: NodeJS.ProcessEnv) => {
      disposable = env.VOTES_DB_PATH!;
      assert.notStrictEqual(disposable, database);
      assert.strictEqual(env.FPP_BUILD, '1');
      const isolated = new Database(disposable);
      assertDatabaseReady(isolated);
      assert.strictEqual((isolated.prepare('SELECT COUNT(*) n FROM jukebox_queue').get() as { n: number }).n, 0);
      isolated.close();
      assert.strictEqual(process.env.VOTES_DB_PATH, database);
    });
    assert.ok(!fs.existsSync(disposable));
    assert.strictEqual(dump(), before);
  } finally {
    if (originalPath === undefined) delete process.env.VOTES_DB_PATH;
    else process.env.VOTES_DB_PATH = originalPath;
  }

  console.log('[test-database-lifecycle] CLI setup/migrate honour explicit path and snapshot directory');
  const cliDb = path.join(dir, 'cli.db');
  const env = { ...process.env, VOTES_DB_PATH: cliDb, DB_BACKUP_DIR: path.join(dir, 'backups') };
  for (const script of ['init-database.js', 'migrate-database.js']) {
    const run = spawnSync(process.execPath, [path.join('scripts', script)], { env, encoding: 'utf8' });
    assert.strictEqual(run.status, 0, run.stderr);
  }
  assert.strictEqual(fs.readdirSync(env.DB_BACKUP_DIR).length, 1);
  assert.strictEqual(dump(), before);
  console.log('[test-database-lifecycle] a database built by the old app-start schema top-up (only 001-008 recorded) upgrades');
  const legacyDb = new Database(path.join(dir, 'legacy.db'));
  try {
    migrateDatabase(legacyDb);
    legacyDb.prepare("DELETE FROM schema_migrations WHERE CAST(substr(version, 1, 3) AS INTEGER) > 8").run();
    legacyDb.prepare("UPDATE settings SET value = 'Legacy show' WHERE key = 'display_show_name'").run();
    legacyDb.prepare("INSERT INTO jukebox_queue (sequence_name, requester_ip) VALUES ('Legacy song', 'test')").run();
    assert.ok(migrateDatabase(legacyDb) > 0);
    assertDatabaseReady(legacyDb);
    assert.strictEqual((legacyDb.prepare("SELECT value FROM settings WHERE key = 'display_show_name'").get() as { value: string }).value, 'Legacy show');
    assert.strictEqual((legacyDb.prepare('SELECT COUNT(*) n FROM jukebox_queue').get() as { n: number }).n, 1);
    assert.strictEqual(migrateDatabase(legacyDb), 0);

    console.log('[test-database-lifecycle] only "already there" errors in old migrations are tolerated');
    const odd = path.join(dir, 'odd');
    fs.mkdirSync(odd);
    fs.writeFileSync(path.join(odd, '001_t.sql'), 'CREATE TABLE odd_t (a INTEGER);');
    fs.writeFileSync(path.join(odd, '002_dup.sql'), 'ALTER TABLE odd_t ADD COLUMN a INTEGER;');
    const oddDb = new Database(path.join(dir, 'odd.db'));
    try {
      assert.strictEqual(migrateDatabase(oddDb, odd), 2, 'a duplicate column in an old migration counts as already applied');
      fs.writeFileSync(path.join(odd, '003_bad.sql'), 'INVALID SQL;');
      assert.throws(() => migrateDatabase(oddDb, odd), 'any other error still stops the upgrade');
      fs.rmSync(path.join(odd, '003_bad.sql'));
      fs.writeFileSync(path.join(odd, '027_dup.sql'), 'ALTER TABLE odd_t ADD COLUMN a INTEGER;');
      assert.throws(() => migrateDatabase(oddDb, odd), /duplicate column/, 'new migrations (027 and later) stay strict');
    } finally {
      oddDb.close();
    }
  } finally {
    legacyDb.close();
  }
  console.log('[test-database-lifecycle] migration 027 is frozen: what lib/db-schema.ts and lib/db-columns.ts build must not change');
  // Existing installs never re-run 027, so editing those two files would make new and old installs differ. Add a new numbered migration instead.
  const old = path.join(dir, 'migrations-to-026');
  fs.mkdirSync(old);
  for (const name of fs.readdirSync('migrations')) if (/.sql$/.test(name) && parseInt(name, 10) < 27) fs.copyFileSync(path.join('migrations', name), path.join(old, name));
  const frozen = new Database(':memory:');
  try {
    migrateDatabase(frozen, old);
    applySchema(frozen);
    const schema = frozen.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
    const seeded = frozen.prepare('SELECT key, value, category FROM settings ORDER BY key').all();
    assert.strictEqual(crypto.createHash('sha256').update(JSON.stringify({ schema, settings: seeded })).digest('hex'), '71a9c1e60686675cf0d540a297880536e4e5bb3f0280bfbac445996872af8673');
  } finally {
    frozen.close();
  }
  console.log('[test-database-lifecycle] All tests passed');
} finally {
  db.close();
  if (path.dirname(dir) !== tmp) throw new Error('Invalid test cleanup');
  fs.rmSync(dir, { recursive: true, force: true });
}
