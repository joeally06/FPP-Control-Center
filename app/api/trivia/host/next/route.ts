import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import { advanceToNext } from '@/lib/trivia-state';

/** POST /api/trivia/host/next - reveal -> next question, or -> ended if that was the last one (admin only) */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
    const session = advanceToNext();
    return NextResponse.json(session);
  } catch (error) {
    const msg = toErrorMessage(error, 'Failed to advance to next question');
    const status = msg.includes('required') || msg.includes('Admin') ? 401 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
