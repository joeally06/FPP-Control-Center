import assert from 'assert';
import {
  toPublicQueueItem,
  stripFseq,
  formatClock,
  formatShowTime,
  requestButtonState,
  parseCourtesyLines,
  normalizeCategory,
  toSongDuration,
  songCategories,
  songDetailsLine,
  filterSongs,
  estimateWaits,
  buildShowSpecs,
  type CatalogSong,
} from '../lib/jukebox-display';

function print(msg: string) {
  console.log('[test-jukebox-display] ' + msg);
}

// Test 1: public queue items never carry IPs or locations
(() => {
  print('Test 1: toPublicQueueItem strips private fields');
  const row = {
    id: 7, sequence_name: 'Wizards in Winter', media_name: 'Wizards in Winter.mp3', requester_name: 'Ava',
    requester_ip: '203.0.113.9', status: 'pending', priority: 0, created_at: '2026-12-01 01:02:03', played_at: null,
    latitude: 30.1, longitude: -97.7, city: 'Austin', region: 'TX', country_code: 'US', distance_from_show: 0.1,
    original_playlist: 'Main', original_item_index: 3, was_resumed: 0, started_at: null, duration_ms: 1000, sequence_id: 4,
  };
  const pub = toPublicQueueItem(row);
  assert.deepStrictEqual(Object.keys(pub).sort(), ['created_at', 'id', 'media_name', 'played_at', 'priority', 'requester_name', 'sequence_name', 'status']);
  assert.strictEqual(pub.requester_name, 'Ava');
  const json = JSON.stringify(pub);
  for (const secret of ['203.0.113.9', '30.1', '-97.7', 'Austin', 'distance']) {
    assert.ok(!json.includes(secret), `public item must not contain ${secret}`);
  }
  print('Test 1 OK');
})();

// Test 2: stripFseq normalises names for comparison
(() => {
  print('Test 2: stripFseq');
  assert.strictEqual(stripFseq('Song.fseq'), 'Song');
  assert.strictEqual(stripFseq('Song.FSEQ'), 'Song');
  assert.strictEqual(stripFseq('Song'), 'Song');
  assert.strictEqual(stripFseq('My.fseq.Song'), 'My.fseq.Song', 'only a trailing extension is removed');
  assert.strictEqual(stripFseq(null), '');
  print('Test 2 OK');
})();

// Test 3: formatClock
(() => {
  print('Test 3: formatClock');
  assert.strictEqual(formatClock(0), '0:00');
  assert.strictEqual(formatClock(5), '0:05');
  assert.strictEqual(formatClock(65), '1:05');
  assert.strictEqual(formatClock(3725), '62:05');
  assert.strictEqual(formatClock(12.9), '0:12', 'fractions are floored');
  assert.strictEqual(formatClock(-3), '0:00', 'negatives clamp to zero');
  print('Test 3 OK');
})();

// Test 4: requestButtonState precedence: playing > queued > limit > available
(() => {
  print('Test 4: requestButtonState');
  const base = { currentSequence: 'Carol.fseq', queuedNames: ['Thriller'], requestsRemaining: 2 };
  assert.strictEqual(requestButtonState({ ...base, name: 'Carol' }), 'playing', 'matches current sequence despite .fseq');
  assert.strictEqual(requestButtonState({ ...base, name: 'Thriller' }), 'queued');
  assert.strictEqual(requestButtonState({ ...base, name: 'Other' }), 'available');
  assert.strictEqual(requestButtonState({ ...base, name: 'Other', requestsRemaining: 0 }), 'limit');
  assert.strictEqual(requestButtonState({ ...base, name: 'Carol', requestsRemaining: 0 }), 'playing', 'playing wins over limit');
  assert.strictEqual(requestButtonState({ ...base, name: 'Other', requestsRemaining: null }), 'available', 'unknown remaining does not block');
  assert.strictEqual(requestButtonState({ name: 'Other', currentSequence: null, queuedNames: [], requestsRemaining: 1 }), 'available');
  print('Test 4 OK');
})();

// Test 5: parseCourtesyLines
(() => {
  print('Test 5: parseCourtesyLines');
  assert.deepStrictEqual(parseCourtesyLines('  Lights off \n\n Keep clear\r\nQuiet please  '), ['Lights off', 'Keep clear', 'Quiet please']);
  assert.deepStrictEqual(parseCourtesyLines(''), []);
  assert.deepStrictEqual(parseCourtesyLines(null), []);
  assert.strictEqual(parseCourtesyLines('a\nb\nc\nd\ne\nf\ng').length, 5, 'max 5 lines');
  assert.strictEqual(parseCourtesyLines('x'.repeat(300))[0].length, 120, 'each line capped at 120 chars');
  print('Test 5 OK');
})();

// Test 6: formatShowTime
(() => {
  print('Test 6: formatShowTime');
  assert.strictEqual(formatShowTime('18:00:00'), '6:00 PM');
  assert.strictEqual(formatShowTime('00:30'), '12:30 AM');
  assert.strictEqual(formatShowTime('12:05:00'), '12:05 PM');
  assert.strictEqual(formatShowTime('9:15'), '9:15 AM');
  assert.strictEqual(formatShowTime('25:00'), '');
  assert.strictEqual(formatShowTime(null), '');
  assert.strictEqual(formatShowTime('soon'), '');
  print('Test 6 OK');
})();

// Test 7: normalizeCategory (admin input)
(() => {
  print('Test 7: normalizeCategory');
  assert.strictEqual(normalizeCategory('  High   Energy Rock '), 'High Energy Rock', 'trimmed and single-spaced');
  assert.strictEqual(normalizeCategory(''), null);
  assert.strictEqual(normalizeCategory('   '), null);
  assert.strictEqual(normalizeCategory(null), null);
  assert.strictEqual(normalizeCategory(undefined), null);
  assert.strictEqual(normalizeCategory('x'.repeat(30)), 'x'.repeat(30));
  assert.throws(() => normalizeCategory('x'.repeat(31)), /at most 30/);
  assert.throws(() => normalizeCategory('Rock\nRoll'), /invalid characters/);
  assert.throws(() => normalizeCategory(42), /must be text/);
  assert.throws(() => normalizeCategory({ toString: () => 'Rock' }), /must be text/);
  print('Test 7 OK');
})();

// Test 8: toSongDuration (FPP playlist item duration, seconds)
(() => {
  print('Test 8: toSongDuration');
  assert.strictEqual(toSongDuration(195.4), 195.4);
  assert.strictEqual(toSongDuration(0), null);
  assert.strictEqual(toSongDuration(-5), null);
  assert.strictEqual(toSongDuration(3600), null, 'an hour or more is not a song');
  assert.strictEqual(toSongDuration(NaN), null);
  assert.strictEqual(toSongDuration(Infinity), null);
  assert.strictEqual(toSongDuration('195'), null, 'strings are not trusted');
  assert.strictEqual(toSongDuration(undefined), null);
  print('Test 8 OK');
})();

const SONGS: CatalogSong[] = [
  { name: 'Wizards_In_Winter', title: 'Wizards in Winter', artist: 'Trans-Siberian Orchestra', durationSeconds: 195, category: 'Rock' },
  { name: 'Carol', title: 'Carol of the Bells', artist: 'Lindsey Stirling', durationSeconds: 210, category: 'Classics' },
  { name: 'Thriller', title: null, artist: null, durationSeconds: null, category: null },
  { name: 'Into_The_Unknown', title: 'Into the Unknown', artist: 'Idina Menzel', durationSeconds: 190.6, category: 'Kids' },
  { name: 'Jingle', title: 'Jingle Bell Rock', artist: 'Bobby Helms', durationSeconds: 130, category: 'Classics' },
];

// Test 9: songCategories + songDetailsLine
(() => {
  print('Test 9: songCategories, songDetailsLine');
  assert.deepStrictEqual(songCategories(SONGS), ['Classics', 'Kids', 'Rock'], 'distinct and sorted');
  assert.deepStrictEqual(songCategories([SONGS[2]]), []);
  assert.strictEqual(songDetailsLine(SONGS[0]), 'Trans-Siberian Orchestra · 3:15');
  assert.strictEqual(songDetailsLine(SONGS[2]), '');
  assert.strictEqual(songDetailsLine({ artist: null, durationSeconds: 190.6 }), '3:10');
  assert.strictEqual(songDetailsLine({ artist: 'Solo', durationSeconds: null }), 'Solo');
  print('Test 9 OK');
})();

// Test 10: filterSongs (search name/title/artist, category)
(() => {
  print('Test 10: filterSongs');
  const names = (songs: CatalogSong[]) => songs.map((s) => s.name);
  assert.deepStrictEqual(names(filterSongs(SONGS, '', null)), names(SONGS), 'no filter keeps order');
  assert.deepStrictEqual(names(filterSongs(SONGS, 'stirling', null)), ['Carol'], 'matches artist, case-insensitive');
  assert.deepStrictEqual(names(filterSongs(SONGS, 'thrill', null)), ['Thriller'], 'matches the sequence name when there is no title');
  assert.deepStrictEqual(names(filterSongs(SONGS, 'ROCK', null)), ['Jingle'], 'matches title, not category');
  assert.deepStrictEqual(names(filterSongs(SONGS, '', 'Classics')), ['Carol', 'Jingle']);
  assert.deepStrictEqual(names(filterSongs(SONGS, 'bell', 'Classics')), ['Carol', 'Jingle']);
  assert.deepStrictEqual(names(filterSongs(SONGS, 'wizards', 'Classics')), [], 'search and category combine');
  assert.deepStrictEqual(names(filterSongs(SONGS, '  carol  ', null)), ['Carol'], 'query is trimmed');
  print('Test 10 OK');
})();

// Test 11: estimateWaits
(() => {
  print('Test 11: estimateWaits');
  assert.deepStrictEqual(estimateWaits(60, [200, 100, 50]), [60, 260, 360]);
  assert.deepStrictEqual(estimateWaits(60, [200, null, 50]), [60, 260, null], 'unknown length breaks later estimates');
  assert.deepStrictEqual(estimateWaits(null, [200, 100]), [null, null], 'unknown current song → nothing known');
  assert.deepStrictEqual(estimateWaits(0, []), []);
  // New request at the end: one extra trailing entry, whose own length doesn't matter
  assert.strictEqual(estimateWaits(60, [200, 100, null]).at(-1), 360);
  assert.strictEqual(estimateWaits(45, [null]).at(-1), 45, 'empty queue → wait is the current song');
  print('Test 11 OK');
})();

// Test 12: buildShowSpecs
(() => {
  print('Test 12: buildShowSpecs');
  const values: Record<string, string> = { jukebox_spec_pixels: ' 14,250 ', jukebox_spec_universes: '', jukebox_spec_software: 'xLights + FPP' };
  const get = (key: string) => values[key] ?? null;
  assert.deepStrictEqual(buildShowSpecs(true, get), [
    { label: 'Smart RGB pixels', value: '14,250' },
    { label: 'Software', value: 'xLights + FPP' },
  ], 'only filled-in fields, trimmed, in field order');
  assert.deepStrictEqual(buildShowSpecs(false, get), [], 'switched off → none');
  assert.deepStrictEqual(buildShowSpecs(true, () => null), []);
  print('Test 12 OK');
})();

print('All tests passed.');
