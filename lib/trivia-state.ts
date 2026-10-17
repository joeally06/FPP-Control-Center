import type Database from 'better-sqlite3';
import { getDb } from './database';
import type {
  TriviaBroadcastState,
  TriviaChoiceTally,
  TriviaPlayerSummary,
  TriviaPhase,
  TriviaQuestionRow,
  TriviaSessionRow,
} from '@/types/trivia';

// ─── Raw DB row shapes (snake_case, as returned by better-sqlite3) ─────────

export interface TriviaSessionRawRow {
  id: number;
  name: string;
  status: string;
  question_ids: string;
  current_index: number;
  phase: string;
  question_started_at: string | null;
  question_ends_at: string | null;
  seconds_per_question: number;
  created_at: string;
  updated_at: string;
}

interface TriviaQuestionRawRow {
  id: number;
  category: string;
  question_text: string;
  choices: string;
  correct_index: number;
  points: number;
  created_at: string;
  updated_at: string;
}

interface CountRow {
  c: number;
}

interface ChoiceCountRow {
  choice_index: number;
  c: number;
}

interface LeaderboardRawRow {
  displayName: string;
  score: number;
}

// ─── Tuning ─────────────────────────────────────────────────────────────────

const REVEAL_DURATION_MS = 6000; // how long the answer reveal stays up before auto-advancing
const RESET_DELAY_MS = 18000; // how long the final leaderboard stays up before auto-arming for the next round

// ─── Singleton SSE client registry ──────────────────────────────────────────

const JOIN_URL = `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/trivia`;

const clients = new Set<ReadableStreamDefaultController>();
let currentState: TriviaBroadcastState = buildEmptyState();
let pendingTimer: NodeJS.Timeout | null = null;

function buildEmptyState(): TriviaBroadcastState {
  return {
    phase: 'none',
    sessionId: null,
    sessionName: null,
    questionNumber: null,
    totalQuestions: null,
    question: null,
    correctIndex: null,
    questionEndsAt: null,
    secondsPerQuestion: null,
    playersJoined: 0,
    answeredCount: 0,
    tally: null,
    leaderboard: [],
    joinUrl: JOIN_URL,
  };
}

// ─── Row <-> domain mapping ──────────────────────────────────────────────────

export function mapSessionRow(row: TriviaSessionRawRow): TriviaSessionRow {
  return {
    id: row.id,
    name: row.name,
    status: row.status as TriviaSessionRow['status'],
    questionIds: JSON.parse(row.question_ids || '[]'),
    currentIndex: row.current_index,
    phase: row.phase as TriviaPhase,
    questionStartedAt: row.question_started_at,
    questionEndsAt: row.question_ends_at,
    secondsPerQuestion: row.seconds_per_question,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapQuestionRow(row: TriviaQuestionRawRow): TriviaQuestionRow {
  return {
    id: row.id,
    category: row.category,
    questionText: row.question_text,
    choices: JSON.parse(row.choices || '[]'),
    correctIndex: row.correct_index,
    points: row.points,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getActiveSession(db: Database.Database): TriviaSessionRow | null {
  const row = db.prepare(`SELECT * FROM trivia_sessions WHERE status = 'active' LIMIT 1`).get() as
    | TriviaSessionRawRow
    | undefined;
  return row ? mapSessionRow(row) : null;
}

export function getQuestionById(db: Database.Database, id: number): TriviaQuestionRow | null {
  const row = db.prepare('SELECT * FROM trivia_questions WHERE id = ?').get(id) as TriviaQuestionRawRow | undefined;
  return row ? mapQuestionRow(row) : null;
}

// ─── Broadcast state builder ─────────────────────────────────────────────────

function buildBroadcastState(db: Database.Database, session: TriviaSessionRow | null): TriviaBroadcastState {
  if (!session) return buildEmptyState();

  const playersJoined = (
    db.prepare('SELECT COUNT(*) as c FROM trivia_players WHERE session_id = ?').get(session.id) as CountRow
  ).c;

  const currentQuestionId =
    session.currentIndex >= 0 && session.currentIndex < session.questionIds.length
      ? session.questionIds[session.currentIndex]
      : null;
  const currentQuestion = currentQuestionId ? getQuestionById(db, currentQuestionId) : null;

  let answeredCount = 0;
  let tally: TriviaChoiceTally[] | null = null;
  if (currentQuestion) {
    answeredCount = (
      db.prepare('SELECT COUNT(*) as c FROM trivia_answers WHERE session_id = ? AND question_id = ?')
        .get(session.id, currentQuestion.id) as CountRow
    ).c;

    if (session.phase === 'reveal' || session.phase === 'ended') {
      const rows = db.prepare(
        `SELECT choice_index, COUNT(*) as c FROM trivia_answers WHERE session_id = ? AND question_id = ? GROUP BY choice_index`
      ).all(session.id, currentQuestion.id) as ChoiceCountRow[];
      const counts = new Map<number, number>(rows.map((r) => [r.choice_index, r.c]));
      tally = currentQuestion.choices.map((_, idx) => ({ choiceIndex: idx, count: counts.get(idx) ?? 0 }));
    }
  }

  let leaderboard: TriviaPlayerSummary[] = [];
  if (session.phase === 'reveal' || session.phase === 'ended') {
    const rows = db.prepare(`
      SELECT p.display_name as displayName, COALESCE(SUM(a.points_awarded), 0) as score
      FROM trivia_players p
      LEFT JOIN trivia_answers a ON a.session_id = p.session_id AND a.client_token = p.client_token
      WHERE p.session_id = ?
      GROUP BY p.id
      ORDER BY score DESC, p.joined_at ASC
      LIMIT 10
    `).all(session.id) as LeaderboardRawRow[];
    leaderboard = rows.map((r) => ({ displayName: r.displayName, score: r.score }));
  }

  return {
    phase: session.phase,
    sessionId: session.id,
    sessionName: session.name,
    questionNumber: session.currentIndex >= 0 ? session.currentIndex + 1 : null,
    totalQuestions: session.questionIds.length,
    question: currentQuestion
      ? {
          id: currentQuestion.id,
          category: currentQuestion.category,
          questionText: currentQuestion.questionText,
          choices: currentQuestion.choices,
        }
      : null,
    correctIndex:
      currentQuestion && (session.phase === 'reveal' || session.phase === 'ended')
        ? currentQuestion.correctIndex
        : null,
    questionEndsAt: session.phase === 'question' ? session.questionEndsAt : null,
    secondsPerQuestion: session.secondsPerQuestion,
    playersJoined,
    answeredCount,
    tally,
    leaderboard,
    joinUrl: JOIN_URL,
  };
}

// ─── Broadcasting ─────────────────────────────────────────────────────────────

/** Rebuild the cached broadcast payload from the DB - the DB is the source of truth. */
function refreshState(): TriviaSessionRow | null {
  const db = getDb();
  const session = getActiveSession(db);
  currentState = buildBroadcastState(db, session);
  return session;
}

export function addClient(controller: ReadableStreamDefaultController) {
  clients.add(controller);

  // Always rebuild from the DB before serving a newly-connected client, so it gets
  // the true current state even when this process's cached copy is stale - e.g. after
  // a dev/prod server restart that reset the in-memory currentState back to 'none'.
  let session: TriviaSessionRow | null = null;
  try {
    session = refreshState();
  } catch (err) {
    console.error('[Trivia] Failed to refresh state on connect:', err);
  }

  try {
    controller.enqueue(`data: ${JSON.stringify(currentState)}\n\n`);
  } catch {
    // ignore
  }

  // If the process restarted mid-round the auto-advance timer was lost; re-arm it.
  if (session) rescheduleTimers(session);
}

export function removeClient(controller: ReadableStreamDefaultController) {
  clients.delete(controller);
}

export function broadcastTriviaState(): TriviaBroadcastState {
  const session = refreshState();

  const message = `data: ${JSON.stringify(currentState)}\n\n`;
  const dead: ReadableStreamDefaultController[] = [];
  clients.forEach((ctrl) => {
    try {
      ctrl.enqueue(message);
    } catch {
      dead.push(ctrl);
    }
  });
  dead.forEach((c) => clients.delete(c));

  rescheduleTimers(session);
  return currentState;
}

/**
 * Schedules the one pending automatic transition for the active session's current
 * phase - anchored to the phase's fixed start time (questionEndsAt, or the phase's
 * updatedAt for reveal/ended) rather than "now", so re-broadcasts triggered by other
 * activity (e.g. a new player joining mid-reveal) don't push the deadline back.
 */
function rescheduleTimers(session: TriviaSessionRow | null) {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (!session) return;

  const runSafely = (fn: () => void, label: string) => () => {
    try {
      fn();
    } catch (err) {
      console.error(`[Trivia] ${label} failed:`, err);
    }
  };

  if (session.phase === 'question' && session.questionEndsAt) {
    const delay = tsToMs(session.questionEndsAt) - Date.now();
    pendingTimer = setTimeout(runSafely(() => revealCurrentQuestion(), 'Auto-reveal'), Math.max(0, delay));
  } else if (session.phase === 'reveal') {
    const delay = tsToMs(session.updatedAt) + REVEAL_DURATION_MS - Date.now();
    pendingTimer = setTimeout(runSafely(() => advanceToNext(), 'Auto-advance'), Math.max(0, delay));
  } else if (session.phase === 'ended') {
    const delay = tsToMs(session.updatedAt) + RESET_DELAY_MS - Date.now();
    pendingTimer = setTimeout(runSafely(() => resetToLobby(session.id), 'Auto-reset'), Math.max(0, delay));
  }
}

/**
 * Parse a stored timestamp to epoch ms. question_started_at / question_ends_at are
 * written as ISO-8601 (toISOString, has 'T' + 'Z'). updated_at comes from SQLite's
 * datetime('now') as "YYYY-MM-DD HH:MM:SS" - UTC but with no zone marker, which
 * Node would otherwise misparse as local time. Normalize that form to UTC.
 */
function tsToMs(ts: string): number {
  if (ts.includes('T')) return new Date(ts).getTime();
  return new Date(ts.replace(' ', 'T') + 'Z').getTime();
}

// ─── Session lifecycle ──────────────────────────────────────────────────────

export function activateSession(sessionId: number): TriviaSessionRow {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE trivia_sessions SET status = 'ended', updated_at = datetime('now') WHERE status = 'active' AND id != ?`).run(sessionId);
    db.prepare(`UPDATE trivia_sessions SET status = 'active', phase = 'lobby', current_index = -1, question_started_at = NULL, question_ends_at = NULL, updated_at = datetime('now') WHERE id = ?`).run(sessionId);
  });
  tx();
  broadcastTriviaState();
  const session = getActiveSession(db);
  if (!session) throw new Error('Failed to activate session');
  return session;
}

/**
 * Called after a player joins. Starts the round themselves if it's just sitting
 * armed (lobby), or arms + immediately starts a fresh round if the previous one
 * already finished. Does nothing if a round is already in progress - the new
 * player just joins in.
 */
export function triggerPlayIfNeeded(): void {
  const db = getDb();
  const session = getActiveSession(db);
  if (!session) return;

  if (session.phase === 'lobby') {
    startSession();
  } else if (session.phase === 'ended') {
    resetToLobby(session.id);
    startSession();
  }
}

export function startSession(): TriviaSessionRow {
  const db = getDb();
  const session = getActiveSession(db);
  if (!session) throw new Error('No active session');
  if (session.phase !== 'lobby') throw new Error('Session already started');
  if (session.questionIds.length === 0) throw new Error('Session has no questions');

  beginQuestion(db, session.id, 0, session.secondsPerQuestion);
  broadcastTriviaState();
  const started = getActiveSession(db);
  if (!started) throw new Error('Failed to start session');
  return started;
}

function beginQuestion(db: Database.Database, sessionId: number, index: number, secondsPerQuestion: number) {
  const now = new Date();
  const endsAt = new Date(now.getTime() + secondsPerQuestion * 1000);
  db.prepare(`
    UPDATE trivia_sessions
    SET phase = 'question', current_index = ?, question_started_at = ?, question_ends_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(index, now.toISOString(), endsAt.toISOString(), sessionId);
}

export function revealCurrentQuestion(): TriviaSessionRow {
  const db = getDb();
  const session = getActiveSession(db);
  if (!session) throw new Error('No active session');
  if (session.phase !== 'question') throw new Error('No question is currently live');

  db.prepare(`UPDATE trivia_sessions SET phase = 'reveal', updated_at = datetime('now') WHERE id = ?`).run(session.id);
  broadcastTriviaState();
  const revealed = getActiveSession(db);
  if (!revealed) throw new Error('Failed to reveal answer');
  return revealed;
}

export function advanceToNext(): TriviaSessionRow {
  const db = getDb();
  const session = getActiveSession(db);
  if (!session) throw new Error('No active session');
  if (session.phase !== 'reveal') throw new Error('Current question has not been revealed yet');

  const nextIndex = session.currentIndex + 1;
  if (nextIndex >= session.questionIds.length) {
    // Natural end of the round - stays 'active' so it auto-arms for the next group.
    // Only the host's explicit End Session action fully deactivates it.
    db.prepare(`UPDATE trivia_sessions SET phase = 'ended', updated_at = datetime('now') WHERE id = ?`).run(session.id);
  } else {
    beginQuestion(db, session.id, nextIndex, session.secondsPerQuestion);
  }
  broadcastTriviaState();
  const row = db.prepare('SELECT * FROM trivia_sessions WHERE id = ?').get(session.id) as TriviaSessionRawRow;
  return mapSessionRow(row);
}

/** Clears players/answers and re-arms the session in the lobby, ready for the next round. */
export function resetToLobby(sessionId: number): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM trivia_answers WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM trivia_players WHERE session_id = ?').run(sessionId);
    db.prepare(`
      UPDATE trivia_sessions
      SET phase = 'lobby', current_index = -1, question_started_at = NULL, question_ends_at = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(sessionId);
  });
  tx();
  broadcastTriviaState();
}

/** Host override: force-end the round right now and fully deactivate it (no auto-reset). */
export function endSession(): TriviaSessionRow {
  const db = getDb();
  const session = getActiveSession(db);
  if (!session) throw new Error('No active session');

  db.prepare(`UPDATE trivia_sessions SET phase = 'ended', status = 'ended', updated_at = datetime('now') WHERE id = ?`).run(session.id);
  broadcastTriviaState();
  const row = db.prepare('SELECT * FROM trivia_sessions WHERE id = ?').get(session.id) as TriviaSessionRawRow;
  return mapSessionRow(row);
}
