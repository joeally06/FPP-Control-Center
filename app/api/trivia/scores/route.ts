import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { getDb } from '@/lib/database';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import { APP_TIMEZONE } from '@/lib/time-utils';
import { startOfShowDayUtc } from '@/lib/show-summary';
import { clearScores, listFinishedGames } from '@/lib/trivia-game';

const MAX_ROWS = 500;

/** GET /api/trivia/scores?range=tonight|all - finished games, best first (admin only) */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
  }

  try {
    const range = request.nextUrl.searchParams.get('range') === 'all' ? 'all' : 'tonight';
    const since = range === 'all' ? null : startOfShowDayUtc(DateTime.utc(), APP_TIMEZONE);
    return NextResponse.json(listFinishedGames(getDb(), since, MAX_ROWS));
  } catch (error) {
    console.error('[Trivia Scores] Error:', error);
    return NextResponse.json({ error: 'Failed to load scores' }, { status: 500 });
  }
}

/** DELETE /api/trivia/scores - clear every score; games being played right now carry on (admin only) */
export async function DELETE(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
  }

  try {
    const deleted = clearScores(getDb(), new Date());
    return NextResponse.json({ deleted });
  } catch (error) {
    console.error('[Trivia Scores] Clear error:', error);
    return NextResponse.json({ error: 'Failed to clear scores' }, { status: 500 });
  }
}
