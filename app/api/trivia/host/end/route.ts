import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import { endSession } from '@/lib/trivia-state';

/** POST /api/trivia/host/end - force-end the active session from any phase (admin only) */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
    const session = endSession();
    return NextResponse.json(session);
  } catch (error) {
    const msg = toErrorMessage(error, 'Failed to end session');
    const status = msg.includes('required') || msg.includes('Admin') ? 401 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
