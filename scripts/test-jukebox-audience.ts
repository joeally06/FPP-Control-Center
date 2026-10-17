import assert from 'assert';
import { createPresenceTracker, recordAudienceVisit } from '../lib/jukebox-audience';

function print(msg: string) {
  console.log('[test-jukebox-audience] ' + msg);
}

// Test 1: distinct keys within the window are counted once each
(() => {
  print('Test 1: counts distinct visitors');
  const tracker = createPresenceTracker({ windowMs: 60_000, maxTracked: 100 });
  tracker.touch('a', 1_000);
  tracker.touch('b', 2_000);
  tracker.touch('a', 3_000);
  assert.strictEqual(tracker.count(3_000), 2, 'repeat visits by the same key count once');
  print('Test 1 OK');
})();

// Test 2: visitors drop off once they haven't been seen for the whole window
(() => {
  print('Test 2: window expiry');
  const tracker = createPresenceTracker({ windowMs: 60_000, maxTracked: 100 });
  tracker.touch('a', 0);
  tracker.touch('b', 30_000);
  assert.strictEqual(tracker.count(59_999), 2);
  assert.strictEqual(tracker.count(60_000), 1, 'a expires exactly one window after it was last seen');
  assert.strictEqual(tracker.count(90_000), 0);
  print('Test 2 OK');
})();

// Test 3: a revisit refreshes the visitor (and moves it behind newer keys)
(() => {
  print('Test 3: revisit keeps a visitor present');
  const tracker = createPresenceTracker({ windowMs: 60_000, maxTracked: 100 });
  tracker.touch('a', 0);
  tracker.touch('b', 10_000);
  tracker.touch('a', 50_000);
  assert.strictEqual(tracker.count(65_000), 2, 'a was refreshed at 50s; b still inside the window');
  assert.strictEqual(tracker.count(75_000), 1, 'b expired at 70s, a stays until 110s');
  assert.strictEqual(tracker.count(110_000), 0);
  print('Test 3 OK');
})();

// Test 4: memory is bounded - the oldest visitors are dropped beyond the cap
(() => {
  print('Test 4: hard cap');
  const tracker = createPresenceTracker({ windowMs: 60_000, maxTracked: 3 });
  for (let i = 0; i < 10; i++) tracker.touch(`k${i}`, 1_000 + i);
  assert.strictEqual(tracker.count(2_000), 3);
  tracker.touch('k7', 2_000);
  assert.strictEqual(tracker.count(2_000), 3, 'revisiting a tracked key does not evict anyone');
  print('Test 4 OK');
})();

// Test 5: process-wide counter de-duplicates visitors by IP
(() => {
  print('Test 5: recordAudienceVisit');
  const now = Date.now() + 10 * 60_000; // clear of anything another test recorded
  assert.strictEqual(recordAudienceVisit('203.0.113.1', now), 1);
  assert.strictEqual(recordAudienceVisit('203.0.113.2', now + 1), 2);
  assert.strictEqual(recordAudienceVisit('203.0.113.1', now + 2), 2, 'same IP counts once');
  assert.strictEqual(recordAudienceVisit('203.0.113.3', now + 61_000), 1, 'earlier visitors expired');
  print('Test 5 OK');
})();

print('All tests passed.');
