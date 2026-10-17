import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';
import { getActiveSession } from '@/lib/trivia-state';
import type { TriviaPersonalResult } from '@/types/trivia';

/**
 * GET /api/trivia/me?clientToken=...
 * A player's personal result for the active session - their locked-in answer's
 * correctness, points earned, running total, and rank. Polled by the phone page
 * once the broadcast phase turns to 'reveal' or 'ended'.
 */
export async function GET(request: NextRequest) {
  try {
    const clientToken = request.nextUrl.searchParams.get('clientToken');
    if (!clientToken) {
      return NextResponse.json({ error: 'Missing clientToken' }, { status: 400 });
    }

    const db = getDb();
    const session = getActiveSession(db);
    if (!session) {
      return NextResponse.json({ error: 'No trivia session is active right now' }, { status: 404 });
    }

    const player = db.prepare(
      'SELECT display_name FROM trivia_players WHERE session_id = ? AND client_token = ?'
    ).get(session.id, clientToken) as { display_name: string } | undefined;

    if (!player) {
      const result: TriviaPersonalResult = {
        joined: false,
        displayName: null,
        totalScore: 0,
        rank: null,
        lastAnswer: null,
      };
      return NextResponse.json(result);
    }

    const totalRow = db.prepare(
      'SELECT COALESCE(SUM(points_awarded), 0) as score FROM trivia_answers WHERE session_id = ? AND client_token = ?'
    ).get(session.id, clientToken) as { score: number };

    const scoreboard = db.prepare(`
      SELECT p.client_token as clientToken, COALESCE(SUM(a.points_awarded), 0) as score
      FROM trivia_players p
      LEFT JOIN trivia_answers a ON a.session_id = p.session_id AND a.client_token = p.client_token
      WHERE p.session_id = ?
      GROUP BY p.id
      ORDER BY score DESC, p.joined_at ASC
    `).all(session.id) as Array<{ clientToken: string; score: number }>;
    const rank = scoreboard.findIndex((row) => row.clientToken === clientToken) + 1;

    const lastAnswerRow = db.prepare(`
      SELECT question_id as questionId, choice_index as choiceIndex, is_correct as isCorrect, points_awarded as pointsAwarded
      FROM trivia_answers
      WHERE session_id = ? AND client_token = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(session.id, clientToken) as
      | { questionId: number; choiceIndex: number; isCorrect: number; pointsAwarded: number }
      | undefined;

    const result: TriviaPersonalResult = {
      joined: true,
      displayName: player.display_name,
      totalScore: totalRow.score,
      rank: rank > 0 ? rank : null,
      lastAnswer: lastAnswerRow
        ? {
            questionId: lastAnswerRow.questionId,
            choiceIndex: lastAnswerRow.choiceIndex,
            isCorrect: !!lastAnswerRow.isCorrect,
            pointsAwarded: lastAnswerRow.pointsAwarded,
          }
        : null,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Trivia Me] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch personal result' }, { status: 500 });
  }
}
