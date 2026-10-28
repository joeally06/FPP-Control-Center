import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import assert from 'assert';
import { isRequestableSong, lookupMediaName } from '../lib/jukebox-catalog';

const SCHEMA = `
  CREATE TABLE cached_sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sequence_name TEXT NOT NULL UNIQUE,
    playlist_order INTEGER DEFAULT 0
  );
  CREATE TABLE fpp_playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    raw_data TEXT
  );
`;

function print(msg: string) {
  console.log('[test-jukebox-catalog] ' + msg);
}

const tmpDir = path.join(process.cwd(), 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
const dbPath = path.join(tmpDir, 'test-jukebox-catalog.db');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
const db = new Database(dbPath);

try {
  db.exec(SCHEMA);

  print('Test 1: empty cache accepts nothing and finds no media name');
  assert.strictEqual(isRequestableSong(db, 'Song A'), false);
  assert.strictEqual(lookupMediaName(db, 'Song A'), null);

  db.prepare("INSERT INTO cached_sequences (sequence_name) VALUES ('Song A'), ('Song B'), ('Song C')").run();
  const playlist = {
    leadIn: [{ sequenceName: 'Song A.fseq', mediaName: 'a.mp3' }],
    mainPlaylist: [{ sequenceName: 'Song B.fseq', mediaName: 'b.mp3' }, { sequenceName: 'Hidden.fseq', mediaName: 'h.mp3' }],
    leadOut: [{ sequenceName: 'Song C.fseq', mediaName: 'c.mp3' }],
  };
  db.prepare('INSERT INTO fpp_playlists (name, raw_data) VALUES (?, ?)').run('Main', JSON.stringify(playlist));

  print('Test 2: synced songs are requestable; others (even in a playlist) are not');
  assert.strictEqual(isRequestableSong(db, 'Song A'), true);
  assert.strictEqual(isRequestableSong(db, 'Hidden'), false);
  assert.strictEqual(isRequestableSong(db, 'Nope'), false);

  print('Test 3: names match exactly (case and extension)');
  assert.strictEqual(isRequestableSong(db, 'song a'), false);
  assert.strictEqual(isRequestableSong(db, 'Song A.fseq'), false);
  assert.strictEqual(isRequestableSong(db, "Song A' OR 1=1 --"), false);

  print('Test 4: media name comes from leadIn, mainPlaylist and leadOut');
  assert.strictEqual(lookupMediaName(db, 'Song A'), 'a.mp3');
  assert.strictEqual(lookupMediaName(db, 'Song B'), 'b.mp3');
  assert.strictEqual(lookupMediaName(db, 'Song C'), 'c.mp3');
  assert.strictEqual(lookupMediaName(db, 'Other'), null);

  print('All tests passed');
} finally {
  db.close();
  try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
}
