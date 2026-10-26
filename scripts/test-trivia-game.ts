import assert from 'assert';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { computePoints, parseTriviaSetting } from '../lib/trivia-logic';
import { answerQuestion, getLeaderboard, isGameTokenShape, serveQuestion, startGame } from '../lib/trivia-game';
import type { TriviaAnswerResult, TriviaServedQuestion } from '../types/trivia';

function print(msg: string) {
  console.log('[test-trivia-game] ' + msg);
}

// Throwaway DB built from the real migrations (018 for the question bank, 024 for games + settings)
const tmpDir = path.join(process.cwd(), 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
const dbPath = path.join(tmpDir, 'test-trivia-game.db');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

const db = new Database(dbPath);
db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, description TEXT, category TEXT, updated_at TEXT)`);
for (const file of ['018_trivia.sql', '024_trivia_games.sql']) {
  const sql = fs.readFileSync(path.join(process.cwd(), 'migrations', file), 'utf8');
  db.exec(sql);
  db.exec(sql); // idempotent
}

const insertQuestion = db.prepare(
  `INSERT INTO trivia_questions (question_text, choices, correct_index, points) VALUES (?, ?, ?, 1000)`
);
for (let i = 0; i < 5; i++) insertQuestion.run(`Question ${i}`, JSON.stringify(['A', 'B', 'C', 'D']), i % 4);

const T0 = new Date('2026-12-12T02:00:00Z');
const SINCE = '2026-12-11 06:00:00';
const at = (ms: number) => new Date(T0.getTime() + ms);

function correctIndexOf(questionId: number): number {
  return (db.prepare('SELECT correct_index FROM trivia_questions WHERE id = ?').get(questionId) as { correct_index: number }).correct_index;
}

function served(token: string, now: Date): TriviaServedQuestion {
  const q = serveQuestion(db, token, now);
  assert.ok(!('error' in q), 'expected a question');
  return q as TriviaServedQuestion;
}

function answered(token: string, questionId: number, choice: number | null, now: Date): TriviaAnswerResult {
  const r = answerQuestion(db, token, questionId, choice, now, SINCE);
  assert.ok(!('error' in r), `expected an answer result, got ${JSON.stringify(r)}`);
  return r as TriviaAnswerResult;
}

try {
  (() => {
    print('Test 1: settings come from the migration and parse within limits');
    const rows = db.prepare(`SELECT key, value FROM settings WHERE category = 'trivia' ORDER BY key`).all();
    assert.deepStrictEqual(rows, [
      { key: 'trivia_questions_per_game', value: '10' },
      { key: 'trivia_seconds_per_question', value: '20' },
    ]);
    assert.strictEqual(parseTriviaSetting('trivia_questions_per_game', '3'), 3);
    assert.strictEqual(parseTriviaSetting('trivia_questions_per_game', '25'), 25);
    assert.strictEqual(parseTriviaSetting('trivia_questions_per_game', '2'), null);
    assert.strictEqual(parseTriviaSetting('trivia_seconds_per_question', '61'), null);
    assert.strictEqual(parseTriviaSetting('trivia_seconds_per_question', '1.5'), null);
    assert.strictEqual(parseTriviaSetting('trivia_seconds_per_question', null), null);
    print('Test 1 OK');
  })();

  (() => {
    print('Test 2: a game draws min(N, bank) distinct questions');
    const game = startGame(db, { displayName: 'Ann', ip: '192.0.2.1', questionsPerGame: 10, secondsPerQuestion: 20 });
    assert.ok(game && isGameTokenShape(game.token));
    assert.strictEqual(game.totalQuestions, 5);
    const ids: number[] = JSON.parse((db.prepare('SELECT question_ids FROM trivia_games WHERE token = ?').get(game.token) as { question_ids: string }).question_ids);
    assert.strictEqual(new Set(ids).size, 5);

    const short = startGame(db, { displayName: 'Bo', ip: '192.0.2.1', questionsPerGame: 3, secondsPerQuestion: 20 });
    assert.strictEqual(short?.totalQuestions, 3);
    print('Test 2 OK');
  })();

  (() => {
    print('Test 3: serving a question hides the answer and never restarts the clock');
    const game = startGame(db, { displayName: 'Cy', ip: '192.0.2.2', questionsPerGame: 3, secondsPerQuestion: 20 })!;
    const first = served(game.token, at(0));
    assert.strictEqual(first.msRemaining, 20000);
    assert.ok(!('correctIndex' in first.question), 'payload must not carry the answer');
    const again = served(game.token, at(5000));
    assert.strictEqual(again.question.id, first.question.id);
    assert.strictEqual(again.msRemaining, 15000);
    print('Test 3 OK');
  })();

  (() => {
    print('Test 4: right, wrong, timed-out, late and replayed answers');
    const game = startGame(db, { displayName: 'Di', ip: '192.0.2.3', questionsPerGame: 4, secondsPerQuestion: 20 })!;

    // Correct after 4 s
    let q = served(game.token, at(0));
    let r = answered(game.token, q.question.id, correctIndexOf(q.question.id), at(4000));
    assert.strictEqual(r.correct, true);
    assert.strictEqual(r.pointsAwarded, computePoints(true, 4000, 20000, 1000));
    const afterFirst = r.score;

    // Replaying the same answer is rejected and doesn't change the score
    const replay = answerQuestion(db, game.token, q.question.id, correctIndexOf(q.question.id), at(4100), SINCE);
    assert.deepStrictEqual(replay, { error: 'stale' });

    // Answering before the next question is served is rejected
    const ids: number[] = JSON.parse((db.prepare('SELECT question_ids FROM trivia_games WHERE token = ?').get(game.token) as { question_ids: string }).question_ids);
    assert.deepStrictEqual(answerQuestion(db, game.token, ids[1], 0, at(4200), SINCE), { error: 'stale' });

    // Wrong
    q = served(game.token, at(10000));
    r = answered(game.token, q.question.id, (correctIndexOf(q.question.id) + 1) % 4, at(11000));
    assert.strictEqual(r.correct, false);
    assert.strictEqual(r.timedOut, false);
    assert.strictEqual(r.pointsAwarded, 0);
    assert.strictEqual(r.correctIndex, correctIndexOf(q.question.id));

    // Out-of-range choice
    q = served(game.token, at(20000));
    assert.deepStrictEqual(answerQuestion(db, game.token, q.question.id, 9, at(21000), SINCE), { error: 'invalid_choice' });

    // Timer ran out on the phone
    r = answered(game.token, q.question.id, null, at(40000));
    assert.strictEqual(r.timedOut, true);
    assert.strictEqual(r.pointsAwarded, 0);

    // Correct choice but after window + grace counts as timed out
    q = served(game.token, at(50000));
    r = answered(game.token, q.question.id, correctIndexOf(q.question.id), at(50000 + 20000 + 751));
    assert.strictEqual(r.timedOut, true);
    assert.strictEqual(r.correct, false);
    assert.strictEqual(r.pointsAwarded, 0);

    assert.strictEqual(r.score, afterFirst);
    assert.strictEqual(r.correctCount, 1);
    assert.strictEqual(r.finished, true);
    assert.deepStrictEqual(serveQuestion(db, game.token, at(60000)), { error: 'finished' });
    print('Test 4 OK');
  })();

  (() => {
    print('Test 5: rank and leaderboard count only finished games since the start of the night');
    function playPerfect(name: string, answerAfterMs: number) {
      const game = startGame(db, { displayName: name, ip: '192.0.2.4', questionsPerGame: 3, secondsPerQuestion: 20 })!;
      let r: TriviaAnswerResult | null = null;
      for (let i = 0; i < 3; i++) {
        const q = served(game.token, at(100000 + i * 30000));
        r = answered(game.token, q.question.id, correctIndexOf(q.question.id), at(100000 + i * 30000 + answerAfterMs));
      }
      return r!;
    }

    // A finished game from the previous night must not count
    db.prepare(`INSERT INTO trivia_games (token, display_name, question_ids, seconds_per_question, score, finished_at)
                VALUES ('old', 'Yesterday', '[]', 20, 99999, '2026-12-10 23:00:00')`).run();

    const fast = playPerfect('Fast', 0);
    assert.strictEqual(fast.score, 3000);
    assert.strictEqual(fast.rank, 1);
    const slow = playPerfect('Slow', 10000);
    assert.strictEqual(slow.score, 3 * computePoints(true, 10000, 20000, 1000));
    assert.strictEqual(slow.rank, 2, 'only Fast scored more tonight; the 99999 from last night must not count');

    // Unfinished games (Ann, Bo, Cy) are left out; Di finished with one correct answer
    const board = getLeaderboard(db, SINCE);
    assert.deepStrictEqual(board.map((p) => p.displayName), ['Fast', 'Slow', 'Di']);
    assert.deepStrictEqual(slow.leaderboard, board);
    print('Test 5 OK');
  })();

  (() => {
    print('Test 6: an empty bank cannot start a game');
    db.exec('DELETE FROM trivia_questions');
    assert.strictEqual(startGame(db, { displayName: 'Ed', ip: '192.0.2.5', questionsPerGame: 10, secondsPerQuestion: 20 }), null);
    print('Test 6 OK');
  })();
} catch (err) {
  console.error('[test-trivia-game] FAILED:', err);
  db.close();
  process.exit(1);
}

db.close();
print('All tests passed.');
