import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import assert from 'assert';
import {
  buildSetupChecklist,
  findLocalAudio,
  listAdminSongs,
  mediaNamesFromPlaylists,
  normalizeAudioName,
  readAudioState,
  songAudio,
  type AudioState,
  type SetupSummary,
} from '../lib/jukebox-songs';

// Tables as lib/database.ts and migrations 005/007/017/019 create them (only the columns read here)
const SCHEMA = `
  CREATE TABLE cached_sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sequence_name TEXT NOT NULL UNIQUE,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    playlist_order INTEGER DEFAULT 0
  );
  CREATE TABLE spotify_metadata (
    sequence_name TEXT PRIMARY KEY,
    album_art_url TEXT,
    artist_name TEXT,
    album_name TEXT,
    track_name TEXT
  );
  CREATE TABLE jukebox_song_details (
    sequence_name TEXT PRIMARY KEY,
    duration_seconds REAL,
    category TEXT
  );
  CREATE TABLE fpp_playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    raw_data TEXT
  );
`;

function print(msg: string) {
  console.log('[test-jukebox-songs] ' + msg);
}

const tmpDir = path.join(process.cwd(), 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
const dbPath = path.join(tmpDir, 'test-jukebox-songs.db');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
const db = new Database(dbPath);
const audioRoot = path.join(tmpDir, 'test-jukebox-songs-root');

try {
  db.exec(SCHEMA);

  // Test 1: names compare like the phone-audio sync does
  print('Test 1: normalizeAudioName / findLocalAudio');
  assert.strictEqual(normalizeAudioName("Rockin'_Around-the  Tree"), 'rockin around the tree');
  const audio: AudioState = {
    mappings: { Custom: 'my-take.mp3', 'Mapped Fseq.fseq': 'other.wav', Gone: 'deleted.mp3' },
    files: ['my-take.mp3', 'other.wav', 'Wizards_In_Winter.mp3', 'notes.txt'],
  };
  assert.strictEqual(findLocalAudio('Custom', audio), 'my-take.mp3');
  assert.strictEqual(findLocalAudio('Mapped Fseq', audio), 'other.wav');
  assert.strictEqual(findLocalAudio('wizards-in-winter', audio), 'Wizards_In_Winter.mp3');
  // A mapping to a file that isn't there falls back to name matching, then gives up
  assert.strictEqual(findLocalAudio('Gone', audio), null);
  // No partial matches
  assert.strictEqual(findLocalAudio('Wizards', audio), null);
  print('Test 1 OK');

  // Test 2: status
  print('Test 2: songAudio');
  assert.deepStrictEqual(songAudio('Custom', null, audio), { audioFile: 'my-take.mp3', audioStatus: 'ready' });
  assert.deepStrictEqual(songAudio('Nope', 'Nope.mp3', audio), { audioFile: null, audioStatus: 'needs-download' });
  assert.deepStrictEqual(songAudio('Nope', null, audio), { audioFile: null, audioStatus: 'needs-mapping' });
  print('Test 2 OK');

  // Test 3: audio file names from cached FPP playlists
  print('Test 3: mediaNamesFromPlaylists');
  const names = mediaNamesFromPlaylists([
    JSON.stringify({
      leadIn: [{ type: 'sequence', sequenceName: 'Intro.fseq' }],
      mainPlaylist: [
        { type: 'both', sequenceName: 'Song A.fseq', mediaName: 'Song A.mp3' },
        { type: 'both', sequenceName: 'Song B.fseq', mediaName: '' },
        null,
      ],
    }),
    'not json',
    'null',
    JSON.stringify({ leadOut: [{ sequenceName: 'Song A.fseq', mediaName: 'later.mp3' }, { sequenceName: 'Outro.FSEQ', mediaName: 'outro.mp3' }] }),
  ]);
  assert.deepStrictEqual([...names.entries()], [['Song A', 'Song A.mp3'], ['Outro', 'outro.mp3']]);
  print('Test 3 OK');

  // Test 4: the admin song list joins details, keeps playlist order and works out audio
  print('Test 4: listAdminSongs');
  db.exec(`
    INSERT INTO cached_sequences (sequence_name, playlist_order) VALUES ('Song B', 2), ('Song A', 1), ('Wizards_In_Winter', 3);
    INSERT INTO spotify_metadata (sequence_name, track_name, artist_name, album_name, album_art_url)
      VALUES ('Song A', 'Song A', 'Artist', 'Album', 'https://i.scdn.co/a.jpg'), ('Song B', '', NULL, NULL, NULL);
    INSERT INTO jukebox_song_details (sequence_name, duration_seconds, category) VALUES ('Song A', 185.5, 'Rock');
  `);
  db.prepare('INSERT INTO fpp_playlists (name, raw_data) VALUES (?, ?)').run('Main', JSON.stringify({
    mainPlaylist: [{ sequenceName: 'Song A.fseq', mediaName: 'Song A.mp3' }, { sequenceName: 'Wizards_In_Winter.fseq', mediaName: 'wiw.mp3' }],
  }));
  const songs = listAdminSongs(db, audio);
  assert.deepStrictEqual(songs.map((song) => song.name), ['Song A', 'Song B', 'Wizards_In_Winter']);
  assert.deepStrictEqual(songs[0], {
    name: 'Song A', title: 'Song A', artist: 'Artist', album: 'Album', albumArt: 'https://i.scdn.co/a.jpg',
    category: 'Rock', durationSeconds: 185.5, mediaName: 'Song A.mp3', audioFile: null, audioStatus: 'needs-download',
  });
  // An empty Media Library title counts as no title
  assert.strictEqual(songs[1].title, null);
  assert.strictEqual(songs[1].audioStatus, 'needs-mapping');
  assert.strictEqual(songs[2].audioStatus, 'ready');
  assert.strictEqual(songs[2].audioFile, 'Wizards_In_Winter.mp3');
  print('Test 4 OK');

  // Test 5: reading the mapping file and audio folder; missing ones are empty
  print('Test 5: readAudioState');
  fs.rmSync(audioRoot, { recursive: true, force: true });
  assert.deepStrictEqual(readAudioState(audioRoot), { mappings: {}, files: [] });
  fs.mkdirSync(path.join(audioRoot, 'data'), { recursive: true });
  fs.mkdirSync(path.join(audioRoot, 'public', 'audio'), { recursive: true });
  fs.writeFileSync(path.join(audioRoot, 'data', 'audio-mapping.json'), JSON.stringify({ A: 'a.mp3' }));
  fs.writeFileSync(path.join(audioRoot, 'public', 'audio', 'a.mp3'), '');
  fs.writeFileSync(path.join(audioRoot, 'public', 'audio', 'readme.txt'), '');
  assert.deepStrictEqual(readAudioState(audioRoot), { mappings: { A: 'a.mp3' }, files: ['a.mp3'] });
  fs.writeFileSync(path.join(audioRoot, 'data', 'audio-mapping.json'), '{broken');
  assert.deepStrictEqual(readAudioState(audioRoot).mappings, {});
  print('Test 5 OK');

  // Test 6: checklist
  print('Test 6: buildSetupChecklist');
  const base: SetupSummary = {
    songs: [], lastSynced: null, themeName: 'Christmas', offeredPlaylists: 0, hasLogo: false, siteName: '', rateLimit: 3,
  };
  const status = (summary: SetupSummary) => Object.fromEntries(buildSetupChecklist(summary).map((item) => [item.id, item.status]));
  assert.deepStrictEqual(status(base), { sync: 'todo', titles: 'todo', audio: 'todo', playlists: 'todo', rules: 'ok', visitor: 'todo' });

  const ready = { title: 'A', audioStatus: 'ready' as const };
  const fresh: SetupSummary = {
    ...base,
    songs: [ready, { title: null, audioStatus: 'needs-download' }, { title: 'C', audioStatus: 'needs-mapping' }],
    lastSynced: '2026-10-26 18:00:00',
    offeredPlaylists: 1,
    siteName: 'Lewis Lights',
  };
  assert.deepStrictEqual(status(fresh), { sync: 'ok', titles: 'warn', audio: 'warn', playlists: 'ok', rules: 'ok', visitor: 'ok' });
  const items = buildSetupChecklist(fresh);
  const byId = (id: string) => items.find((item) => item.id === id)!;
  assert.strictEqual(byId('titles').detail, '1 of 3 show their file name to visitors');
  assert.strictEqual(byId('audio').detail, "2 songs can't play on visitors' phones yet");
  assert.strictEqual(byId('playlists').detail, '1 playlist offered for Christmas');
  assert.strictEqual(byId('visitor').detail, 'Christmas theme, showing "Lewis Lights"');
  assert.deepStrictEqual([byId('titles').tab, byId('titles').filter, byId('audio').filter], ['songs', 'titles', 'audio']);

  assert.deepStrictEqual(status({ ...fresh, songs: [ready], hasLogo: true, siteName: '' }),
    { sync: 'ok', titles: 'ok', audio: 'ok', playlists: 'ok', rules: 'ok', visitor: 'ok' });
  // Synced but FPP had no scheduled songs: nothing to fix yet
  assert.strictEqual(status({ ...fresh, songs: [] }).sync, 'todo');
  print('Test 6 OK');

  print('All tests passed');
} catch (err) {
  console.error('[test-jukebox-songs] ❌', err);
  process.exitCode = 1;
} finally {
  db.close();
  fs.rmSync(audioRoot, { recursive: true, force: true });
}
