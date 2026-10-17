import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';
import { getClientIP } from '@/lib/rate-limit';
import { getActiveSession, broadcastTriviaState, triggerPlayIfNeeded } from '@/lib/trivia-state';

const JOINS_PER_HOUR_PER_IP = 30;

function sanitizeName(raw: string): string {
  return raw
    .trim()
    .slice(0, 30)
    .replace(/[<>]/g, '')
    .replace(/[^\w\s\-_.]/g, '')
    || 'Anonymous';
}

/**
 * POST /api/trivia/join
 * Join (or re-join) the currently active trivia session with a device-generated client token.
 * If the game is just sitting armed (or finished), this player's join is what kicks off the
 * round - there's no host action required. Joining while a round is already in progress just
 * drops them into the current question.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clientToken, displayName } = body ?? {};

    if (!clientToken || typeof clientToken !== 'string' || clientToken.length < 8 || clientToken.length > 100) {
      return NextResponse.json({ error: 'Invalid client token' }, { status: 400 });
    }
    if (!displayName || typeof displayName !== 'string' || displayName.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const db = getDb();
    const session = getActiveSession(db);
    if (!session) {
      return NextResponse.json({ error: 'No trivia session is active right now' }, { status: 404 });
    }

    const ip = getClientIP(request);
    const recent = db.prepare(
      `SELECT COUNT(*) as c FROM trivia_players WHERE ip_address = ? AND joined_at >= datetime('now', '-1 hour')`
    ).get(ip) as { c: number };
    if (recent.c >= JOINS_PER_HOUR_PER_IP) {
      return NextResponse.json({ error: 'Too many join attempts. Please try again later.' }, { status: 429 });
    }

    const name = sanitizeName(displayName);

    db.prepare(`
      INSERT INTO trivia_players (session_id, client_token, display_name, ip_address, joined_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(session_id, client_token) DO UPDATE SET display_name = excluded.display_name
    `).run(session.id, clientToken, name, ip);

    triggerPlayIfNeeded();
    const state = broadcastTriviaState();

    return NextResponse.json({ success: true, sessionId: session.id, displayName: name, state });
  } catch (error) {
    console.error('[Trivia Join] Error:', error);
    return NextResponse.json({ error: 'Failed to join trivia' }, { status: 500 });
  }
}
