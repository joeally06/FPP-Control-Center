import assert from 'assert';
import {
  toPublicQueueItem,
  stripFseq,
  formatClock,
  formatShowTime,
  requestButtonState,
  parseCourtesyLines,
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

print('All tests passed.');
