import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import assert from 'assert';
import {
  listJukeboxPlaylists,
  listVisitorPlaylists,
  normalizePlaylistTheme,
  playlistDetails,
  setPlaylistThemes,
  syncJukeboxPlaylists,
  type PlaylistDetails,
} from '../lib/jukebox-playlists';
import {
  addToQueueTransactional,
  insertStartDeadline,
  queueItemProgress,
  START_GRACE_MS,
  type MonitoredRequest,
} from '../lib/jukebox-queue';
import { playlistButtonState, playlistDetailsLine } from '../lib/jukebox-display';

// Tables as lib/database.ts creates them (jukebox_queue with the request_kind column; migration 023)
const SCHEMA = `
  CREATE TABLE jukebox_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sequence_name TEXT NOT NULL,
    media_name TEXT,
    requester_name TEXT,
    requester_ip TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    latitude REAL,
    longitude REAL,
    city TEXT,
    region TEXT,
    country_code TEXT,
    distance_from_show REAL,
    request_kind TEXT DEFAULT 'song'
  );
  CREATE TABLE jukebox_rate_limit_resets (
    requester_ip TEXT PRIMARY KEY,
    reset_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE jukebox_playlists (
    name TEXT PRIMARY KEY,
    theme TEXT CHECK (theme IN ('christmas', 'halloween')),
    item_count INTEGER NOT NULL DEFAULT 0,
    duration_seconds REAL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

function print(msg: string) {
  console.log('[test-jukebox-playlists] ' + msg);
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return (err as { code?: string }).code;
  }
  return undefined;
}

const tmpDir = path.join(process.cwd(), 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
const dbPath = path.join(tmpDir, 'test-jukebox-playlists.db');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
const db = new Database(dbPath);

try {
  db.exec(SCHEMA);

  // Test 1: song count and length from FPP's playlist JSON
  print('Test 1: playlistDetails');
  assert.deepStrictEqual(playlistDetails({
    leadIn: [{ type: 'sequence', sequenceName: 'Intro.fseq' }],
    mainPlaylist: [
      { type: 'both', sequenceName: 'A.fseq', mediaName: 'A.mp3' },
      { type: 'pause', duration: 5 },
      { type: 'media', mediaName: 'B.mp3' },
      { type: 'command', command: 'Volume Set' },
    ],
    leadOut: [{ type: 'sequence', sequenceName: '' }],
    playlistInfo: { total_duration: 612.5 },
  }), { itemCount: 3, durationSeconds: 612.5 });
  assert.deepStrictEqual(playlistDetails({}), { itemCount: 0, durationSeconds: null });
  assert.strictEqual(playlistDetails({ playlistInfo: { total_duration: '600' } }).durationSeconds, null);
  print('Test 1 OK');

  // Test 2: syncing with FPP keeps admin themes, keeps counts when details fail, prunes removed playlists
  print('Test 2: syncJukeboxPlaylists');
  const details = (entries: [string, PlaylistDetails][]) => new Map(entries);
  syncJukeboxPlaylists(db, ['Christmas Classics', 'Spooky', 'Old'], details([
    ['Christmas Classics', { itemCount: 12, durationSeconds: 2400 }],
    ['Spooky', { itemCount: 8, durationSeconds: 1500 }],
    ['Old', { itemCount: 3, durationSeconds: null }],
  ]));
  setPlaylistThemes(db, [['Christmas Classics', 'christmas'], ['Spooky', 'halloween'], ['Not on FPP', 'christmas']]);
  // Spooky's details fail this time; Old is gone from FPP; New arrives
  syncJukeboxPlaylists(db, ['Christmas Classics', 'Spooky', 'New'], details([
    ['Christmas Classics', { itemCount: 13, durationSeconds: 2600 }],
    ['New', { itemCount: 0, durationSeconds: null }],
  ]));
  assert.deepStrictEqual(listJukeboxPlaylists(db), [
    { name: 'Christmas Classics', theme: 'christmas', item_count: 13, duration_seconds: 2600 },
    { name: 'New', theme: null, item_count: 0, duration_seconds: null },
    { name: 'Spooky', theme: 'halloween', item_count: 8, duration_seconds: 1500 },
  ]);
  print('Test 2 OK');

  // Test 3: visitors see only playlists of the active theme that have songs
  print('Test 3: listVisitorPlaylists');
  setPlaylistThemes(db, [['New', 'christmas']]);
  assert.deepStrictEqual(listVisitorPlaylists(db, 'christmas'), [{ name: 'Christmas Classics', itemCount: 13, durationSeconds: 2600 }]);
  assert.deepStrictEqual(listVisitorPlaylists(db, 'halloween').map((p) => p.name), ['Spooky']);
  setPlaylistThemes(db, [['Spooky', null]]);
  assert.deepStrictEqual(listVisitorPlaylists(db, 'halloween'), []);
  print('Test 3 OK');

  // Test 4: admin theme values
  print('Test 4: normalizePlaylistTheme');
  assert.strictEqual(normalizePlaylistTheme('christmas'), 'christmas');
  assert.strictEqual(normalizePlaylistTheme('halloween'), 'halloween');
  assert.strictEqual(normalizePlaylistTheme(''), null);
  assert.strictEqual(normalizePlaylistTheme(null), null);
  assert.throws(() => normalizePlaylistTheme('easter'));
  assert.throws(() => normalizePlaylistTheme(1));
  print('Test 4 OK');

  // Test 5: one playlist in line at a time; it counts as one request; songs are unaffected
  print('Test 5: addToQueueTransactional with playlists');
  const base = { requester_name: 'Ava', rateLimit: 3 };
  const first = addToQueueTransactional(db, { ...base, sequence_name: 'Christmas Classics', requester_ip: '192.0.2.10', request_kind: 'playlist' });
  assert.strictEqual(first.requestsUsed, 1);
  const row = db.prepare('SELECT request_kind, sequence_name FROM jukebox_queue WHERE id = ?').get(first.id) as { request_kind: string; sequence_name: string };
  assert.deepStrictEqual(row, { request_kind: 'playlist', sequence_name: 'Christmas Classics' });
  assert.strictEqual(
    codeOf(() => addToQueueTransactional(db, { ...base, sequence_name: 'New', requester_ip: '192.0.2.11', request_kind: 'playlist' })),
    'PLAYLIST_ACTIVE'
  );
  const song = addToQueueTransactional(db, { ...base, sequence_name: 'Wizards', requester_ip: '192.0.2.11' });
  const songKind = db.prepare('SELECT request_kind FROM jukebox_queue WHERE id = ?').get(song.id) as { request_kind: string };
  assert.strictEqual(songKind.request_kind, 'song');
  // Still blocked while it plays; allowed again once it is done
  db.prepare("UPDATE jukebox_queue SET status = 'playing' WHERE id = ?").run(first.id);
  assert.strictEqual(
    codeOf(() => addToQueueTransactional(db, { ...base, sequence_name: 'New', requester_ip: '192.0.2.11', request_kind: 'playlist' })),
    'PLAYLIST_ACTIVE'
  );
  db.prepare("UPDATE jukebox_queue SET status = 'completed' WHERE id = ?").run(first.id);
  const second = addToQueueTransactional(db, { ...base, sequence_name: 'New', requester_ip: '192.0.2.11', request_kind: 'playlist' });
  assert.strictEqual(second.requestsUsed, 2);
  // The hourly limit applies to playlists like songs
  db.prepare("UPDATE jukebox_queue SET status = 'completed' WHERE id = ?").run(second.id);
  addToQueueTransactional(db, { ...base, sequence_name: 'Another', requester_ip: '192.0.2.11' });
  assert.strictEqual(
    codeOf(() => addToQueueTransactional(db, { ...base, sequence_name: 'Christmas Classics', requester_ip: '192.0.2.11', request_kind: 'playlist' })),
    'RATE_LIMIT_EXCEEDED'
  );
  print('Test 5 OK');

  // Test 6: watching a request FPP has been sent
  print('Test 6: queueItemProgress');
  const now = 1_000_000;
  const song6: MonitoredRequest = { kind: 'song', name: 'Wizards', status: 'pending', startDeadline: now + 60_000, startedAt: null, durationSec: null };
  const other = { currentSequence: 'Carol.fseq', currentPlaylist: 'Main Show' };
  // Waiting for the current song to end is not a failure (the old 10 s rule dropped these)
  assert.strictEqual(queueItemProgress(song6, other, now + 15_000), 'waiting');
  assert.strictEqual(queueItemProgress(song6, other, now + 61_000), 'gave_up');
  assert.strictEqual(queueItemProgress(song6, { currentSequence: 'Wizards.fseq', currentPlaylist: 'Wizards.fseq' }, now + 20_000), 'started');
  assert.strictEqual(queueItemProgress({ ...song6, name: 'Wizards.fseq' }, { currentSequence: 'Wizards.fseq' }, now), 'started');
  const playingSong = { ...song6, status: 'playing', startedAt: now };
  assert.strictEqual(queueItemProgress(playingSong, { currentSequence: 'Wizards.fseq' }, now + 100_000), 'waiting');
  assert.strictEqual(queueItemProgress(playingSong, other, now + 200_000), 'finished');
  assert.strictEqual(queueItemProgress(playingSong, {}, now + 200_000), 'finished');

  const list: MonitoredRequest = { kind: 'playlist', name: 'Christmas Classics', status: 'pending', startDeadline: now + 60_000, startedAt: null, durationSec: 600 };
  // A playlist is matched by playlist name, not by the song inside it
  assert.strictEqual(queueItemProgress(list, { currentSequence: 'Christmas Classics.fseq', currentPlaylist: 'Main Show' }, now), 'waiting');
  assert.strictEqual(queueItemProgress(list, { currentSequence: 'A.fseq', currentPlaylist: 'Christmas Classics' }, now), 'started');
  assert.strictEqual(queueItemProgress({ ...list, name: '' }, { currentPlaylist: null }, now), 'waiting');
  const playingList = { ...list, status: 'playing', startedAt: now };
  assert.strictEqual(queueItemProgress(playingList, { currentSequence: 'B.fseq', currentPlaylist: 'Christmas Classics' }, now + 600_000), 'waiting');
  assert.strictEqual(queueItemProgress(playingList, other, now + 300_000), 'finished');
  // Safety cap: still reported as playing well past its length
  assert.strictEqual(queueItemProgress(playingList, { currentPlaylist: 'Christmas Classics' }, now + 600_000 + 121_000), 'finished');
  assert.strictEqual(queueItemProgress({ ...playingList, durationSec: null }, { currentPlaylist: 'Christmas Classics' }, now + 9_000_000), 'waiting');
  print('Test 6 OK');

  // Test 7: start deadline covers the rest of the current song when the insert waits for it
  print('Test 7: insertStartDeadline');
  assert.strictEqual(insertStartDeadline(now, true, 95), now + 95_000 + START_GRACE_MS);
  assert.strictEqual(insertStartDeadline(now, true, '95.5'), now + 95_500 + START_GRACE_MS);
  assert.strictEqual(insertStartDeadline(now, false, 95), now + START_GRACE_MS);
  assert.strictEqual(insertStartDeadline(now, true, undefined), now + START_GRACE_MS);
  assert.strictEqual(insertStartDeadline(now, true, 'n/a'), now + START_GRACE_MS);
  print('Test 7 OK');

  // Test 8: visitor playlist buttons
  print('Test 8: playlistButtonState / playlistDetailsLine');
  const state = (playingPlaylist: string | null, queuedPlaylists: string[], requestsRemaining: number | null) =>
    playlistButtonState({ name: 'Spooky', playingPlaylist, queuedPlaylists, requestsRemaining });
  assert.strictEqual(state('Spooky', [], 0), 'playing');
  assert.strictEqual(state(null, ['Spooky'], 0), 'queued');
  assert.strictEqual(state('Other', [], 3), 'blocked');
  assert.strictEqual(state(null, ['Other'], 3), 'blocked');
  assert.strictEqual(state(null, [], 0), 'limit');
  assert.strictEqual(state(null, [], null), 'available');
  assert.strictEqual(playlistDetailsLine({ itemCount: 12, durationSeconds: 2490 }), '12 songs · 41:30');
  assert.strictEqual(playlistDetailsLine({ itemCount: 1, durationSeconds: null }), '1 song');
  print('Test 8 OK');

  print('All tests passed');
} catch (err) {
  console.error('[test-jukebox-playlists] ❌', err);
  process.exitCode = 1;
} finally {
  db.close();
}
