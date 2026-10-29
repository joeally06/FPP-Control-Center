import assert from 'assert';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { isFreshPlaying, markFppOffline } from '../lib/fpp-state';

function print(msg: string) {
  console.log('[test-fpp-state] ' + msg);
}

// SQLite CURRENT_TIMESTAMP format: UTC, no zone
const sqlTime = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const NOW = Date.UTC(2026, 9, 29, 20, 30, 0);

print('Test 1: a recent playing state is trusted');
const playing = { status: 'playing', current_sequence: 'Freakshow.fseq', last_updated: sqlTime(NOW - 5_000) };
assert.strictEqual(isFreshPlaying(playing, NOW), true);

print('Test 2: an old playing state is not (the poller stopped writing)');
assert.strictEqual(isFreshPlaying({ ...playing, last_updated: sqlTime(NOW - 120_000) }, NOW), false);

print('Test 3: idle, offline, no sequence, no timestamp and no row are not playing');
assert.strictEqual(isFreshPlaying({ ...playing, status: 'idle' }, NOW), false);
assert.strictEqual(isFreshPlaying({ ...playing, status: 'offline' }, NOW), false);
assert.strictEqual(isFreshPlaying({ ...playing, current_sequence: null }, NOW), false);
assert.strictEqual(isFreshPlaying({ ...playing, last_updated: null }, NOW), false);
assert.strictEqual(isFreshPlaying({ ...playing, last_updated: 'not a date' }, NOW), false);
assert.strictEqual(isFreshPlaying(undefined, NOW), false);

print('Test 4: the timestamp is read as UTC, whatever the server time zone is');
const savedTz = process.env.TZ;
for (const tz of ['UTC', 'America/Chicago', 'Pacific/Auckland']) {
  process.env.TZ = tz;
  assert.strictEqual(isFreshPlaying({ ...playing, last_updated: sqlTime(NOW - 10_000) }, NOW), true, tz);
  assert.strictEqual(isFreshPlaying({ ...playing, last_updated: sqlTime(NOW - 90_000) }, NOW), false, tz);
}
if (savedTz === undefined) delete process.env.TZ; else process.env.TZ = savedTz;

print('Test 5: marking FPP offline clears what was playing and keeps the error from the failed poll');
const db = new Database(':memory:');
db.exec(fs.readFileSync(path.join(process.cwd(), 'migrations', '012_fpp_state_caching.sql'), 'utf-8'));
db.prepare(`
  INSERT OR REPLACE INTO fpp_state
    (id, status, current_sequence, current_playlist, current_playlist_index, current_playlist_count,
     seconds_played, seconds_remaining, volume, mode, last_poll_success, last_error)
  VALUES (1, 'playing', 'Freakshow.fseq', 'Main', 3, 20, 50, 150, 70, 'player', 0, 'Request timeout (5s)')
`).run();
markFppOffline(db);
const row = db.prepare('SELECT * FROM fpp_state WHERE id = 1').get() as Record<string, unknown>;
assert.strictEqual(row.status, 'offline');
assert.strictEqual(row.current_sequence, null);
assert.strictEqual(row.current_playlist, null);
assert.strictEqual(row.current_playlist_index, null);
assert.strictEqual(row.current_playlist_count, null);
assert.strictEqual(row.seconds_played, 0);
assert.strictEqual(row.seconds_remaining, 0);
assert.strictEqual(row.last_poll_success, 0);
assert.strictEqual(row.last_error, 'Request timeout (5s)');
assert.strictEqual(isFreshPlaying({ ...row, last_updated: sqlTime(Date.now()) } as never), false);

print('Test 6: marking offline with no state row is harmless');
const empty = new Database(':memory:');
empty.exec(fs.readFileSync(path.join(process.cwd(), 'migrations', '012_fpp_state_caching.sql'), 'utf-8'));
empty.prepare('DELETE FROM fpp_state').run();
markFppOffline(empty);

print('All tests passed');
