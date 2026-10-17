import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';
import { getClientIP } from '@/lib/rate-limit';
import { toErrorMessage } from '@/lib/api-errors';
import { computePoints } from '@/lib/trivia-logic';
import { getActiveSession, getQuestionById, broadcastTriviaState } from '@/lib/trivia-state';

const ANSWERS_PER_HOUR_PER_IP = 300; // generous - many phones can share one IP at a live show
const ANSWER_GRACE_MS = 750; // network-latency grace period past the deadline

/**
 * POST /api/trivia/answer
 * Lock in an answer for the currently live question. Does not reveal correctness -
 * that arrives for everyone at once via the SSE 'reveal' broadcast.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clientToken, questionId, choiceIndex } = body ?? {};

    if (!clientToken || typeof clientToken !== 'string') {
      return NextResponse.json({ error: 'Invalid client token' }, { status: 400 });
    }
    if (typeof questionId !== 'number' || typeof choiceIndex !== 'number') {
      return NextResponse.json({ error: 'Invalid answer payload' }, { status: 400 });
    }

    const db = getDb();
    const ip = getClientIP(request);

    const recent = db.prepare(
      `SELECT COUNT(*) as c FROM trivia_answers WHERE ip_address = ? AND created_at >= datetime('now', '-1 hour')`
    ).get(ip) as { c: number };
    if (recent.c >= ANSWERS_PER_HOUR_PER_IP) {
      return NextResponse.json({ error: 'Too many submissions. Please try again later.' }, { status: 429 });
    }

    const session = getActiveSession(db);
    if (!session) {
      return NextResponse.json({ error: 'No trivia session is active right now' }, { status: 404 });
    }
    if (session.phase !== 'question') {
      return NextResponse.json({ error: 'This question is no longer accepting answers' }, { status: 409 });
    }

    const currentQuestionId = session.questionIds[session.currentIndex];
    if (currentQuestionId !== questionId) {
      return NextResponse.json({ error: 'That is not the current question' }, { status: 409 });
    }

    const joined = db.prepare(
      'SELECT 1 FROM trivia_players WHERE session_id = ? AND client_token = ?'
    ).get(session.id, clientToken);
    if (!joined) {
      return NextResponse.json({ error: 'Join the session before answering' }, { status: 403 });
    }

    const now = Date.now();
    const endsAt = session.questionEndsAt ? new Date(session.questionEndsAt).getTime() : 0;
    if (now > endsAt + ANSWER_GRACE_MS) {
      return NextResponse.json({ error: "Time's up for this question" }, { status: 409 });
    }

    const question = getQuestionById(db, questionId);
    if (!question || choiceIndex < 0 || choiceIndex >= question.choices.length) {
      return NextResponse.json({ error: 'Invalid choice' }, { status: 400 });
    }

    const startedAt = session.questionStartedAt ? new Date(session.questionStartedAt).getTime() : now;
    const answerMs = Math.max(0, now - startedAt);
    const windowMs = session.secondsPerQuestion * 1000;
    const isCorrect = choiceIndex === question.correctIndex;
    const pointsAwarded = computePoints(isCorrect, answerMs, windowMs, question.points);

    try {
      db.prepare(`
        INSERT INTO trivia_answers (session_id, question_id, client_token, choice_index, is_correct, answer_ms, points_awarded, ip_address, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(session.id, questionId, clientToken, choiceIndex, isCorrect ? 1 : 0, answerMs, pointsAwarded, ip);
    } catch (err) {
      if (toErrorMessage(err, '').includes('UNIQUE')) {
        return NextResponse.json({ error: 'You already answered this question' }, { status: 409 });
      }
      throw err;
    }

    broadcastTriviaState();

    return NextResponse.json({ locked: true });
  } catch (error) {
    console.error('[Trivia Answer] Error:', error);
    return NextResponse.json({ error: 'Failed to submit answer' }, { status: 500 });
  }
}
