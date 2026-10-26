import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';
import { getClientIP } from '@/lib/rate-limit';
import { getSetting } from '@/lib/settings';
import { TRIVIA_SETTING_LIMITS, parseTriviaSetting } from '@/lib/trivia-logic';
import { GAMES_PER_HOUR_PER_IP, countRecentGames, sanitizeDisplayName, startGame } from '@/lib/trivia-game';

/**
 * POST /api/trivia/play
 * Start a solo trivia game: random questions from the bank, played at the visitor's own pace.
 * Returns the game token the phone uses for the question and answer calls.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { displayName } = body ?? {};

    if (!displayName || typeof displayName !== 'string' || displayName.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const db = getDb();
    const ip = getClientIP(request);
    if (countRecentGames(db, ip) >= GAMES_PER_HOUR_PER_IP) {
      return NextResponse.json({ error: 'Too many games. Please try again later.' }, { status: 429 });
    }

    const game = startGame(db, {
      displayName: sanitizeDisplayName(displayName),
      ip,
      questionsPerGame:
        parseTriviaSetting('trivia_questions_per_game', getSetting('trivia_questions_per_game'))
        ?? TRIVIA_SETTING_LIMITS.trivia_questions_per_game.default,
      secondsPerQuestion:
        parseTriviaSetting('trivia_seconds_per_question', getSetting('trivia_seconds_per_question'))
        ?? TRIVIA_SETTING_LIMITS.trivia_seconds_per_question.default,
    });
    if (!game) {
      return NextResponse.json({ error: "Trivia isn't available right now" }, { status: 404 });
    }

    return NextResponse.json(game);
  } catch (error) {
    console.error('[Trivia Play] Error:', error);
    return NextResponse.json({ error: 'Failed to start trivia' }, { status: 500 });
  }
}
