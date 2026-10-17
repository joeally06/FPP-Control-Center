import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import { activateSession } from '@/lib/trivia-state';

/**
 * POST /api/trivia/sessions/[id]/activate
 * Makes this session the active one (ending any other active session) and
 * resets it to the lobby phase, ready for the host to Start. (admin only)
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminWithRateLimit(request);

    const { id } = await params;
    const sessionId = Number(id);
    if (!Number.isInteger(sessionId)) {
      return NextResponse.json({ error: 'Invalid session id' }, { status: 400 });
    }

    const db = getDb();
    const exists = db.prepare('SELECT 1 FROM trivia_sessions WHERE id = ?').get(sessionId);
    if (!exists) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const session = activateSession(sessionId);
    return NextResponse.json(session);
  } catch (error) {
    const msg = toErrorMessage(error, 'Failed to activate session');
    const status = msg.includes('required') || msg.includes('Admin') ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
