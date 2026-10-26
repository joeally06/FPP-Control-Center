import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { getDb } from '@/lib/database';
import { APP_TIMEZONE } from '@/lib/time-utils';
import { startOfShowDayUtc } from '@/lib/show-summary';
import { TRIVIA_GAME_ERRORS, answerQuestion, isGameTokenShape } from '@/lib/trivia-game';

/**
 * POST /api/trivia/play/answer
 * Answer the current question of a solo game (choiceIndex null = the timer ran out).
 * The server times and scores it, and tells the phone straight away whether it was right.
 * The last answer also returns the player's rank and tonight's leaderboard.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, questionId, choiceIndex } = body ?? {};

    if (!isGameTokenShape(token)) {
      return NextResponse.json({ error: 'Invalid game token' }, { status: 400 });
    }
    if (!Number.isInteger(questionId) || (choiceIndex !== null && !Number.isInteger(choiceIndex))) {
      return NextResponse.json({ error: 'Invalid answer payload' }, { status: 400 });
    }

    const result = answerQuestion(
      getDb(),
      token,
      questionId,
      choiceIndex,
      new Date(),
      startOfShowDayUtc(DateTime.utc(), APP_TIMEZONE)
    );
    if ('error' in result) {
      const { error, status } = TRIVIA_GAME_ERRORS[result.error];
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Trivia Answer] Error:', error);
    return NextResponse.json({ error: 'Failed to submit answer' }, { status: 500 });
  }
}
