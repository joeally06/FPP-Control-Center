import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import { startSession } from '@/lib/trivia-state';

/** POST /api/trivia/host/start - lobby -> first question (admin only) */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
    const session = startSession();
    return NextResponse.json(session);
  } catch (error) {
    const msg = toErrorMessage(error, 'Failed to start session');
    const status = msg.includes('required') || msg.includes('Admin') ? 401 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
