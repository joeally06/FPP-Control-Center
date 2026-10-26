import assert from 'assert';
import { parseTriviaSetting } from '../lib/trivia-logic';

function print(msg: string) {
  console.log('[test-trivia-logic] ' + msg);
}

// Test 1: Values at the edges of each setting's range are accepted
(() => {
  print('Test 1: In-range settings parse');
  assert.strictEqual(parseTriviaSetting('trivia_questions_per_game', '3'), 3);
  assert.strictEqual(parseTriviaSetting('trivia_questions_per_game', '25'), 25);
  assert.strictEqual(parseTriviaSetting('trivia_seconds_per_question', '5'), 5);
  assert.strictEqual(parseTriviaSetting('trivia_seconds_per_question', ' 60 '), 60);
  print('Test 1 OK');
})();

// Test 2: Out-of-range, fractional, non-numeric and missing values are rejected
(() => {
  print('Test 2: Invalid settings are rejected');
  assert.strictEqual(parseTriviaSetting('trivia_questions_per_game', '2'), null);
  assert.strictEqual(parseTriviaSetting('trivia_questions_per_game', '26'), null);
  assert.strictEqual(parseTriviaSetting('trivia_seconds_per_question', '61'), null);
  assert.strictEqual(parseTriviaSetting('trivia_seconds_per_question', '1.5'), null);
  assert.strictEqual(parseTriviaSetting('trivia_seconds_per_question', 'abc'), null);
  assert.strictEqual(parseTriviaSetting('trivia_seconds_per_question', null), null);
  print('Test 2 OK');
})();

print('All tests passed.');
