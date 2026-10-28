import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import assert from 'assert';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { snapshotDatabase, pruneBackups } = require('./backup-db.js') as {
  snapshotDatabase: (src: string, dest: string) => void;
  pruneBackups: (dir: string, keep?: number) => string[];
};

function print(msg: string) {
  console.log('[test-db-backup] ' + msg);
}

const root = path.join(process.cwd(), 'tmp', 'test-db-backup');
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });

const srcPath = path.join(root, 'live.db');
const live = new Database(srcPath);
try {
  live.pragma('journal_mode = WAL');
  live.pragma('wal_autocheckpoint = 0'); // keep every write in the WAL, like a busy app
  live.exec('CREATE TABLE votes (id INTEGER PRIMARY KEY, name TEXT)');
  const insert = live.prepare('INSERT INTO votes (name) VALUES (?)');
  for (let i = 0; i < 50; i++) insert.run(`song ${i}`);
  assert.ok(fs.statSync(srcPath + '-wal').size > 0, 'precondition: rows are sitting in the WAL');

  print('Test 1: snapshot has the WAL-only rows and opens by itself');
  const snapDir = path.join(root, 'snap');
  fs.mkdirSync(snapDir);
  const snapPath = path.join(snapDir, 'votes.db');
  snapshotDatabase(srcPath, snapPath);
  const files = fs.readdirSync(snapDir);
  assert.deepStrictEqual(files, ['votes.db'], 'no -wal/-shm needed beside the snapshot');
  const snap = new Database(snapPath, { readonly: true });
  assert.strictEqual((snap.prepare('SELECT COUNT(*) AS n FROM votes').get() as { n: number }).n, 50);
  assert.strictEqual(snap.pragma('integrity_check', { simple: true }), 'ok');
  snap.close();

  print('Test 2: the live database is unchanged and still writable');
  insert.run('after backup');
  assert.strictEqual((live.prepare('SELECT COUNT(*) AS n FROM votes').get() as { n: number }).n, 51);

  print('Test 3: an existing destination is an error and is left alone');
  const before = fs.readFileSync(snapPath);
  assert.throws(() => snapshotDatabase(srcPath, snapPath));
  assert.ok(before.equals(fs.readFileSync(snapPath)));

  print('Test 4: a missing source is an error');
  assert.throws(() => snapshotDatabase(path.join(root, 'nope.db'), path.join(root, 'x.db')));
} finally {
  live.close();
}

print('Test 5: prune keeps the newest N folders and nothing else is touched');
const backups = path.join(root, 'backups');
fs.mkdirSync(backups);
const names = ['20260101_010101', '20260102_010101', '20260103_010101', '2026-01-04_01-01-01'];
names.forEach((name, i) => {
  const dir = path.join(backups, name);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'votes.db.backup'), 'x');
  fs.utimesSync(dir, new Date(2026, 0, i + 1), new Date(2026, 0, i + 1));
});
const migFile = path.join(backups, '2026-01-05T00-00-00-000Z_votes.db.backup');
fs.writeFileSync(migFile, 'x');
fs.utimesSync(migFile, new Date(2026, 0, 5), new Date(2026, 0, 5));
fs.writeFileSync(path.join(backups, 'notes.txt'), 'keep me');
fs.mkdirSync(path.join(backups, 'my-own-folder'));

const removed = pruneBackups(backups, 2);
assert.deepStrictEqual(removed.sort(), ['20260101_010101', '20260102_010101']);
assert.deepStrictEqual(
  fs.readdirSync(backups).sort(),
  ['2026-01-04_01-01-01', '2026-01-05T00-00-00-000Z_votes.db.backup', '20260103_010101', 'my-own-folder', 'notes.txt'].sort()
);

print('Test 6: each kind keeps its own newest N, so migration copies never push out a real backup');
const mixed = path.join(root, 'mixed');
fs.mkdirSync(mixed);
const oldFolder = path.join(mixed, '20260101_010101');
fs.mkdirSync(oldFolder);
fs.writeFileSync(path.join(oldFolder, 'votes.db.backup'), 'real backup');
fs.utimesSync(oldFolder, new Date(2026, 0, 1), new Date(2026, 0, 1));
for (let i = 0; i < 15; i++) {
  const file = path.join(mixed, `2026-02-${String(i + 1).padStart(2, '0')}T00-00-00-000Z_votes.db.backup`);
  fs.writeFileSync(file, 'x');
  fs.utimesSync(file, new Date(2026, 1, i + 1), new Date(2026, 1, i + 1));
}
const mixedRemoved = pruneBackups(mixed, 10);
assert.strictEqual(mixedRemoved.length, 5);
assert.ok(mixedRemoved.every((name) => name.endsWith('_votes.db.backup')));
assert.ok(fs.existsSync(oldFolder), 'the older real backup folder survives');
assert.strictEqual(fs.readdirSync(mixed).length, 11);

print('Test 7: prune with fewer backups than the limit, a missing folder and bad limits');
assert.deepStrictEqual(pruneBackups(backups, 10), []);
assert.deepStrictEqual(pruneBackups(path.join(root, 'no-such-dir'), 10), []);
assert.throws(() => pruneBackups(backups, 0));
assert.throws(() => pruneBackups(backups, NaN));

fs.rmSync(root, { recursive: true, force: true });
print('All tests passed');
