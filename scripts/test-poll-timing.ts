import assert from 'assert';
import { nextPollDelay } from '../lib/poll-timing';

function print(msg: string) {
  console.log('[test-poll-timing] ' + msg);
}

// Test 1: the normal interval unless the song ends sooner
(() => {
  print('Test 1: nextPollDelay');
  assert.strictEqual(nextPollDelay(10_000, 125), 10_000, 'song ends long after the next regular poll');
  assert.strictEqual(nextPollDelay(10_000, 4), 5_000, 'song ends in 4 s → poll 1 s after it ends');
  assert.strictEqual(nextPollDelay(10_000, 9), 10_000, '9 s + 1 s grace = the regular interval');
  assert.strictEqual(nextPollDelay(10_000, 0.2), 1_200, 'about to end → just after it ends');
  assert.ok(nextPollDelay(10_000, 0.001) >= 1_000, 'never faster than the 1 s grace');
  for (const idle of [0, -3, null, undefined, NaN, Infinity]) {
    assert.strictEqual(nextPollDelay(10_000, idle), 10_000, `${String(idle)} remaining → regular interval`);
  }
  assert.strictEqual(nextPollDelay(5_000, 30), 5_000, 'respects a shorter configured interval');
  print('Test 1 OK');
})();

// Test 2: how late the cache notices a new song, over a 3-minute song, for every possible start offset
(() => {
  print('Test 2: song change latency');
  const INTERVAL = 10_000;
  const SONG_MS = 180_000;
  let worstOld = 0;
  let worstNew = 0;
  let extraPolls = 0;
  for (let offset = 0; offset < INTERVAL; offset += 250) {
    // First poll lands `offset` ms into the song; FPP reports whole seconds remaining
    const songEnd = SONG_MS - offset;
    let tOld = 0;
    while (tOld < songEnd) tOld += INTERVAL;
    worstOld = Math.max(worstOld, tOld - songEnd);

    let tNew = 0;
    let polls = 0;
    while (tNew < songEnd) {
      const remaining = Math.max(0, Math.ceil((songEnd - tNew) / 1000));
      tNew += nextPollDelay(INTERVAL, remaining);
      polls++;
    }
    worstNew = Math.max(worstNew, tNew - songEnd);
    extraPolls = Math.max(extraPolls, polls - Math.ceil(songEnd / INTERVAL));
  }
  assert.ok(worstOld > 9_000, `old: up to a whole interval late (${worstOld} ms)`);
  assert.ok(worstNew <= 2_000, `new: within ~2 s of the song change (${worstNew} ms)`);
  assert.ok(extraPolls <= 1, `about one extra FPP request per song (${extraPolls})`);
  print(`Test 2 OK (worst case ${worstOld} ms → ${worstNew} ms)`);
})();

print('All tests passed.');
