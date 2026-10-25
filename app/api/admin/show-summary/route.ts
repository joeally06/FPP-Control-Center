import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { requireAdmin } from '@/lib/auth-helpers';
import db from '@/lib/database';
import { getShowSummary, startOfShowDayUtc } from '@/lib/show-summary';
import { APP_TIMEZONE } from '@/lib/time-utils';

/**
 * GET /api/admin/show-summary
 * Today's requests and votes, pending Santa letters and device health for the Show page
 * ADMIN ONLY - Contains device names and visitor activity
 */
export async function GET() {
  try {
    await requireAdmin();

    return NextResponse.json(getShowSummary(db, startOfShowDayUtc(DateTime.utc(), APP_TIMEZONE)));
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (message.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('Show summary error:', error);
    return NextResponse.json({ error: 'Failed to get show summary' }, { status: 500 });
  }
}
