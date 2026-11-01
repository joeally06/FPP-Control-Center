import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import assert from 'assert';
import {
  buildSetupChecklist,
  findLocalAudio,
  listAdminSongs,
  listPlaylistSongs,
  mediaNamesFromPlaylists,
  normalizeAudioName,
  playlistForNowPlaying,
  playlistSongDetails,
  readAudioState,
  resolveSongDetails,
  songAudio,
  songNameKeys,
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
  CREATE TABLE jukebox_playlist_songs (
    playlist_name TEXT NOT NULL,
    position INTEGER NOT NULL,
    sequence_name TEXT NOT NULL,
    title TEXT,
    artist TEXT,
    album TEXT,
    art_url TEXT,
    art_id INTEGER,
    PRIMARY KEY (playlist_name, position)
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

  // Test 4b: a playlist's own details are laid over the song's defaults, field by field
  print('Test 4b: resolveSongDetails / listPlaylistSongs');
  const own = db.prepare('INSERT INTO jukebox_playlist_songs (playlist_name, position, sequence_name, title, artist, album, art_url) VALUES (?, ?, ?, ?, ?, ?, ?)');
  own.run('Christmas 2026', 0, 'Song A', null, null, null, '/api/jukebox/song-art/5');            // only its own picture
  own.run('Christmas 2026', 1, 'Brand New', 'Brand New (live)', 'The Band', null, null);          // not synced to the visitor cache yet
  own.run('Christmas 2026', 2, 'Song B', null, null, null, null);                                 // nothing of its own
  own.run('Classics', 0, 'Song A', 'Song A (classic cut)', null, null, null);

  // Resolver: the playlist's value wins field by field, else the default, else nothing
  assert.deepStrictEqual(resolveSongDetails(db, 'Christmas 2026', 'Song A'),
    { title: 'Song A', artist: 'Artist', album: 'Album', albumArt: '/api/jukebox/song-art/5', hasOwn: true });
  assert.deepStrictEqual(resolveSongDetails(db, 'Classics', 'Song A'),
    { title: 'Song A (classic cut)', artist: 'Artist', album: 'Album', albumArt: 'https://i.scdn.co/a.jpg', hasOwn: true });
  assert.deepStrictEqual(resolveSongDetails(db, null, 'Song A'),
    { title: 'Song A', artist: 'Artist', album: 'Album', albumArt: 'https://i.scdn.co/a.jpg', hasOwn: false }, 'no playlist = the defaults');
  assert.deepStrictEqual(resolveSongDetails(db, 'Christmas 2026', 'Song B'),
    { title: null, artist: null, album: null, albumArt: null, hasOwn: false }, 'an empty default title is no title');
  assert.deepStrictEqual(resolveSongDetails(db, 'Other', 'Song A').hasOwn, false, 'a playlist that does not hold the song has nothing of its own');
  assert.deepStrictEqual(resolveSongDetails(db, 'Christmas 2026', 'Never Heard Of It'),
    { title: null, artist: null, album: null, albumArt: null, hasOwn: false });

  // The same song reads differently in two playlists
  const christmas = listPlaylistSongs(db, 'Christmas 2026', audio);
  assert.deepStrictEqual(christmas.map((song) => song.name), ['Song A', 'Brand New', 'Song B'], 'playlist order');
  assert.deepStrictEqual([christmas[0].title, christmas[0].albumArt, christmas[0].ownDetails], ['Song A', '/api/jukebox/song-art/5', true]);
  assert.deepStrictEqual(christmas[0].own, { title: null, artist: null, album: null, albumArt: '/api/jukebox/song-art/5' });
  assert.deepStrictEqual(christmas[0].category, 'Rock', 'category and length still come from the song');
  assert.deepStrictEqual([christmas[1].title, christmas[1].artist, christmas[1].audioStatus, christmas[1].ownDetails], ['Brand New (live)', 'The Band', 'needs-mapping', true], 'a song not in the visitor cache still lists');
  assert.deepStrictEqual([christmas[2].title, christmas[2].ownDetails], [null, false]);
  const classics = listPlaylistSongs(db, 'Classics', audio);
  assert.deepStrictEqual([classics[0].title, classics[0].albumArt], ['Song A (classic cut)', 'https://i.scdn.co/a.jpg']);
  assert.deepStrictEqual(listPlaylistSongs(db, 'Nothing', audio), []);
  // A song matched on Spotify earlier but not in the visitor cache (an unscheduled playlist) still shows its default details
  db.prepare("INSERT INTO spotify_metadata (sequence_name, track_name, artist_name, album_name, album_art_url) VALUES ('Last Season', 'Last Season Song', 'Old Band', 'Old Album', 'https://i.scdn.co/old.jpg')").run();
  own.run('Archive', 0, 'Last Season', null, null, null, null);
  const archive = listPlaylistSongs(db, 'Archive', audio);
  assert.deepStrictEqual([archive[0].title, archive[0].artist, archive[0].albumArt, archive[0].ownDetails],
    ['Last Season Song', 'Old Band', 'https://i.scdn.co/old.jpg', false]);
  print('Test 4b OK');

  // Test 4c: finding a playlist's own details for the song that is playing, and which playlist that is
  print('Test 4c: songNameKeys / playlistSongDetails / playlistForNowPlaying');
  assert.deepStrictEqual(songNameKeys('Song A.fseq'), ['Song A']);
  assert.deepStrictEqual(songNameKeys('Song A.mp3', 'Song A.fseq'), ['Song A'], 'the same song through its audio and sequence names');
  assert.deepStrictEqual(songNameKeys('Pick Out A Tree_25.mp3'), ['Pick Out A Tree_25', 'Pick Out A Tree'], 'FPP year suffix: exact name first, then without it');
  assert.deepStrictEqual(songNameKeys(null, undefined, '  '), []);
  assert.deepStrictEqual(playlistSongDetails(db, 'Classics', ['Song A']), { title: 'Song A (classic cut)', artist: null, album: null, albumArt: null });
  assert.deepStrictEqual(playlistSongDetails(db, 'Christmas 2026', ['Nope', 'Song A']), { title: null, artist: null, album: null, albumArt: '/api/jukebox/song-art/5' }, 'the first key the playlist holds');
  assert.strictEqual(playlistSongDetails(db, 'Christmas 2026', ['Song B']), null, 'a song the playlist holds but set nothing for');
  assert.strictEqual(playlistSongDetails(db, 'Other', ['Song A']), null, 'a playlist that does not hold it');
  assert.strictEqual(playlistSongDetails(db, 'Classics', []), null);
  assert.strictEqual(playlistSongDetails(db, "x' OR '1'='1", ['Song A']), null, 'names are bound, not pasted into the query');

  const fppKeys = songNameKeys('Song A.fseq');
  assert.strictEqual(playlistForNowPlaying({ request_kind: 'playlist', sequence_name: 'Classics' }, fppKeys, 'Classics'), 'Classics', 'a requested playlist FPP is in');
  assert.strictEqual(playlistForNowPlaying({ request_kind: 'playlist', sequence_name: 'Classics' }, fppKeys, null), 'Classics', 'FPP names no playlist: trust the request');
  assert.strictEqual(playlistForNowPlaying({ request_kind: 'playlist', sequence_name: 'Classics' }, fppKeys, 'Main Show'), 'Main Show', 'FPP has already left the requested playlist');
  assert.strictEqual(playlistForNowPlaying({ request_kind: 'song', sequence_name: 'Song A', source_playlist: 'Christmas 2026' }, fppKeys, 'Main Show'), 'Christmas 2026', 'the playlist the song was picked from');
  assert.strictEqual(playlistForNowPlaying({ request_kind: 'song', sequence_name: 'Song A', source_playlist: 'Christmas 2026' }, songNameKeys('Other.fseq'), 'Main Show'), 'Main Show', 'FPP is not playing that song (yet or any more)');
  assert.strictEqual(playlistForNowPlaying({ request_kind: 'song', sequence_name: 'Song A', source_playlist: null }, fppKeys, 'Main Show'), 'Main Show', 'a song picked without a playlist');
  assert.strictEqual(playlistForNowPlaying(undefined, fppKeys, 'Main Show'), 'Main Show', 'the schedule is playing');
  assert.strictEqual(playlistForNowPlaying(null, fppKeys, null), null);
  print('Test 4c OK');

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
  assert.strictEqual(byId('playlists').tab, 'songs', 'playlists are chosen on the Playlists & songs tab');
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
