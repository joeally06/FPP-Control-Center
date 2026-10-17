import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import { revealCurrentQuestion } from '@/lib/trivia-state';

/** POST /api/trivia/host/reveal - reveal the current question's answer early (admin only) */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
    const session = revealCurrentQuestion();
    return NextResponse.json(session);
  } catch (error) {
    const msg = toErrorMessage(error, 'Failed to reveal answer');
    const status = msg.includes('required') || msg.includes('Admin') ? 401 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
