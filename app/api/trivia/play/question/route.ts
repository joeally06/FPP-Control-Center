import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';
import { TRIVIA_GAME_ERRORS, isGameTokenShape, serveQuestion } from '@/lib/trivia-game';

/**
 * POST /api/trivia/play/question
 * The current question of a solo game, without its answer. Its clock starts the first
 * time it is served; asking again returns the same question with less time left.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body ?? {};
    if (!isGameTokenShape(token)) {
      return NextResponse.json({ error: 'Invalid game token' }, { status: 400 });
    }

    const result = serveQuestion(getDb(), token, new Date());
    if ('error' in result) {
      const { error, status } = TRIVIA_GAME_ERRORS[result.error];
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Trivia Question] Error:', error);
    return NextResponse.json({ error: 'Failed to load question' }, { status: 500 });
  }
}
