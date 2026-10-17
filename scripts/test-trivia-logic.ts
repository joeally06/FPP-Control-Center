import assert from 'assert';
import { computePoints } from '../lib/trivia-logic';

function print(msg: string) {
  console.log('[test-trivia-logic] ' + msg);
}

// Test 1: Wrong answers always score 0, regardless of speed
(() => {
  print('Test 1: Wrong answer scores 0');
  assert.strictEqual(computePoints(false, 0, 20000, 1000), 0, 'Instant wrong answer should be 0');
  assert.strictEqual(computePoints(false, 19999, 20000, 1000), 0, 'Late wrong answer should be 0');
  print('Test 1 OK');
})();

// Test 2: Instant correct answer scores full base points
(() => {
  print('Test 2: Instant correct answer scores full points');
  assert.strictEqual(computePoints(true, 0, 20000, 1000), 1000, 'Instant correct answer should score full base points');
  print('Test 2 OK');
})();

// Test 3: Correct answer right at the deadline keeps the minimum floor (30%)
(() => {
  print('Test 3: Correct answer at deadline keeps 30% floor');
  assert.strictEqual(computePoints(true, 20000, 20000, 1000), 300, 'Correct answer at deadline should score 30% of base points');
  print('Test 3 OK');
})();

// Test 4: Correct answer scores monotonically decrease as answerMs increases
(() => {
  print('Test 4: Points decay monotonically with time');
  const early = computePoints(true, 2000, 20000, 1000);
  const mid = computePoints(true, 10000, 20000, 1000);
  const late = computePoints(true, 18000, 20000, 1000);
  assert.ok(early > mid && mid > late, 'Points should strictly decrease as answer time increases');
  print('Test 4 OK');
})();

// Test 5: Answer time beyond the window is clamped, not scored negative/out of range
(() => {
  print('Test 5: Overtime answers clamp to the deadline floor');
  const overtime = computePoints(true, 999999, 20000, 1000);
  const atDeadline = computePoints(true, 20000, 20000, 1000);
  assert.strictEqual(overtime, atDeadline, 'Answer time beyond the window should clamp to the deadline score');
  print('Test 5 OK');
})();

// Test 6: Zero base points (edge case) always scores 0
(() => {
  print('Test 6: Zero base points scores 0');
  assert.strictEqual(computePoints(true, 0, 20000, 0), 0, 'Zero base points should score 0 even if correct');
  print('Test 6 OK');
})();

print('All tests passed.');
