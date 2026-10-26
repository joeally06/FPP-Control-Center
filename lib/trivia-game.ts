// Solo, self-paced trivia: each visitor plays their own game on their phone.
// The server holds the answers and the clock; the phone only ever sees one question at a time
// and learns whether it was right after answering. Every function takes `db` so it can be tested.

import crypto from 'crypto';
import type BetterSqlite3 from 'better-sqlite3';
import { getQuestionById } from './trivia-questions';
import type { TriviaAnswerResult, TriviaPlayerSummary, TriviaScoreRow, TriviaServedQuestion } from '@/types/trivia';

type Db = BetterSqlite3.Database;

const ANSWER_GRACE_MS = 750; // network-latency grace period past the deadline
const LEADERBOARD_SIZE = 10;
export const GAMES_PER_HOUR_PER_IP = 30;

export type TriviaGameError = 'not_found' | 'finished' | 'stale' | 'invalid_choice' | 'question_missing';

/** How the play routes answer each game error */
export const TRIVIA_GAME_ERRORS: Record<TriviaGameError, { error: string; status: number }> = {
  not_found: { error: 'Game not found. Start a new game.', status: 404 },
  finished: { error: 'This game is over', status: 409 },
  stale: { error: 'That question was already answered', status: 409 },
  invalid_choice: { error: 'Invalid choice', status: 400 },
  question_missing: { error: 'This game can no longer continue. Start a new game.', status: 409 },
};

interface GameRow {
  id: number;
  question_ids: string;
  seconds_per_question: number;
  current_index: number;
  question_started_at: string | null;
  score: number;
  correct_count: number;
  finished_at: string | null;
}

export function sanitizeDisplayName(raw: string): string {
  return raw
    .trim()
    .slice(0, 30)
    .replace(/[<>]/g, '')
    .replace(/[^\w\s\-_.]/g, '')
    || 'Anonymous';
}

/** 32 random bytes in base64url */
export function isGameTokenShape(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** 'YYYY-MM-DD HH:MM:SS' UTC, the same shape as datetime('now') */
function toSqlUtc(now: Date): string {
  return now.toISOString().replace('T', ' ').slice(0, 19);
}

export function countRecentGames(db: Db, ip: string): number {
  return (db.prepare(
    `SELECT COUNT(*) as c FROM trivia_games WHERE ip_address = ? AND created_at >= datetime('now', '-1 hour')`
  ).get(ip) as { c: number }).c;
}

/** Draws random questions from the bank for a new game; null when the bank is empty */
export function startGame(
  db: Db,
  opts: { displayName: string; ip: string; questionsPerGame: number; secondsPerQuestion: number }
): { token: string; totalQuestions: number } | null {
  const ids = (db.prepare('SELECT id FROM trivia_questions ORDER BY RANDOM() LIMIT ?').all(opts.questionsPerGame) as Array<{ id: number }>)
    .map((r) => r.id);
  if (ids.length === 0) return null;

  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare(`
    INSERT INTO trivia_games (token, display_name, question_ids, seconds_per_question, ip_address)
    VALUES (?, ?, ?, ?, ?)
  `).run(token, opts.displayName, JSON.stringify(ids), opts.secondsPerQuestion, opts.ip);

  return { token, totalQuestions: ids.length };
}

function getGame(db: Db, token: string): GameRow | undefined {
  return db.prepare('SELECT * FROM trivia_games WHERE token = ?').get(token) as GameRow | undefined;
}

/** The current question, without its answer. Its clock starts the first time it is served and never restarts. */
export function serveQuestion(db: Db, token: string, now: Date): TriviaServedQuestion | { error: TriviaGameError } {
  const game = getGame(db, token);
  if (!game) return { error: 'not_found' };
  if (game.finished_at) return { error: 'finished' };

  const questionIds: number[] = JSON.parse(game.question_ids);
  const question = getQuestionById(db, questionIds[game.current_index]);
  if (!question) return { error: 'question_missing' };

  let startedAt = game.question_started_at;
  if (!startedAt) {
    startedAt = now.toISOString();
    db.prepare('UPDATE trivia_games SET question_started_at = ? WHERE id = ?').run(startedAt, game.id);
  }

  const windowMs = game.seconds_per_question * 1000;
  return {
    questionNumber: game.current_index + 1,
    totalQuestions: questionIds.length,
    secondsPerQuestion: game.seconds_per_question,
    msRemaining: Math.max(0, new Date(startedAt).getTime() + windowMs - now.getTime()),
    score: game.score,
    question: {
      id: question.id,
      category: question.category,
      questionText: question.questionText,
      choices: question.choices,
    },
  };
}

/**
 * Scores the answer to the current question (choiceIndex null = the phone's timer ran out) and
 * moves the game on. The guarded UPDATE means a double tap or replay can never score twice.
 */
export function answerQuestion(
  db: Db,
  token: string,
  questionId: number,
  choiceIndex: number | null,
  now: Date,
  sinceUtc: string
): TriviaAnswerResult | { error: TriviaGameError } {
  const game = getGame(db, token);
  if (!game) return { error: 'not_found' };
  if (game.finished_at) return { error: 'finished' };

  const questionIds: number[] = JSON.parse(game.question_ids);
  if (!game.question_started_at || questionIds[game.current_index] !== questionId) return { error: 'stale' };

  const question = getQuestionById(db, questionId);
  if (!question) return { error: 'question_missing' };
  if (choiceIndex !== null && (choiceIndex < 0 || choiceIndex >= question.choices.length)) {
    return { error: 'invalid_choice' };
  }

  const windowMs = game.seconds_per_question * 1000;
  const answerMs = Math.max(0, now.getTime() - new Date(game.question_started_at).getTime());
  const timedOut = choiceIndex === null || answerMs > windowMs + ANSWER_GRACE_MS;
  const correct = !timedOut && choiceIndex === question.correctIndex;
  const pointsAwarded = correct ? question.points : 0;
  const finished = game.current_index + 1 >= questionIds.length;
  const finishedAt = finished ? toSqlUtc(now) : null;

  const result = db.prepare(`
    UPDATE trivia_games
    SET score = score + ?, correct_count = correct_count + ?, current_index = current_index + 1,
        question_started_at = NULL, finished_at = ?
    WHERE id = ? AND current_index = ?
  `).run(pointsAwarded, correct ? 1 : 0, finishedAt, game.id, game.current_index);
  if (result.changes === 0) return { error: 'stale' };

  const score = game.score + pointsAwarded;
  const answer: TriviaAnswerResult = {
    correct,
    timedOut,
    correctIndex: question.correctIndex,
    pointsAwarded,
    score,
    correctCount: game.correct_count + (correct ? 1 : 0),
    totalQuestions: questionIds.length,
    finished,
  };

  if (finished) {
    // Same order as the leaderboard: equal scores go to whoever finished first
    const ahead = db.prepare(`
      SELECT COUNT(*) as c FROM trivia_games
      WHERE finished_at >= ?
        AND (score > ? OR (score = ? AND (finished_at < ? OR (finished_at = ? AND id < ?))))
    `).get(sinceUtc, score, score, finishedAt, finishedAt, game.id) as { c: number };
    answer.rank = ahead.c + 1;
    answer.leaderboard = getLeaderboard(db, sinceUtc);
  }
  return answer;
}

const SCORE_ORDER = 'ORDER BY score DESC, finished_at ASC, id ASC';

/** Tonight's best finished games */
export function getLeaderboard(db: Db, sinceUtc: string): TriviaPlayerSummary[] {
  return db.prepare(`
    SELECT display_name as displayName, score
    FROM trivia_games
    WHERE finished_at >= ?
    ${SCORE_ORDER}
    LIMIT ?
  `).all(sinceUtc, LEADERBOARD_SIZE) as TriviaPlayerSummary[];
}

/** Finished games for the admin Scores tab, best first; sinceUtc null = all time */
export function listFinishedGames(db: Db, sinceUtc: string | null, limit: number): { games: TriviaScoreRow[]; total: number } {
  const since = sinceUtc ?? '';
  const games = db.prepare(`
    SELECT id, display_name as displayName, score, correct_count as correctCount,
           json_array_length(question_ids) as totalQuestions, finished_at as finishedAt
    FROM trivia_games
    WHERE finished_at >= ?
    ${SCORE_ORDER}
    LIMIT ?
  `).all(since, limit) as TriviaScoreRow[];
  const { c } = db.prepare('SELECT COUNT(*) as c FROM trivia_games WHERE finished_at >= ?').get(since) as { c: number };
  return { games, total: c };
}

/**
 * Clears the scores: every finished game, plus unfinished ones started over an hour ago (abandoned).
 * Games started within the last hour are kept so nobody playing right now gets cut off.
 */
export function clearScores(db: Db, now: Date): number {
  const hourAgo = toSqlUtc(new Date(now.getTime() - 60 * 60 * 1000));
  return db.prepare(
    'DELETE FROM trivia_games WHERE finished_at IS NOT NULL OR created_at < ?'
  ).run(hourAgo).changes;
}
