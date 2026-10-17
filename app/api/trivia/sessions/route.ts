import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import { mapSessionRow, type TriviaSessionRawRow } from '@/lib/trivia-state';

/** GET /api/trivia/sessions - list all sessions, newest first (admin only) */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
    const db = getDb();
    const rows = db.prepare('SELECT * FROM trivia_sessions ORDER BY id DESC').all() as TriviaSessionRawRow[];
    return NextResponse.json(rows.map(mapSessionRow));
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
  }
}

/** POST /api/trivia/sessions - build a new draft session from the question bank (admin only) */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);

    const body = await request.json();
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
    if (!name) {
      return NextResponse.json({ error: 'Session name is required' }, { status: 400 });
    }

    const questionIds: number[] = Array.isArray(body?.questionIds)
      ? body.questionIds.map((n: unknown) => Number(n))
      : [];
    if (questionIds.length === 0 || questionIds.some((n) => !Number.isInteger(n))) {
      return NextResponse.json({ error: 'Select at least one question' }, { status: 400 });
    }

    const secondsPerQuestion = Number.isFinite(Number(body?.secondsPerQuestion)) ? Math.round(Number(body.secondsPerQuestion)) : 20;
    if (secondsPerQuestion < 5 || secondsPerQuestion > 120) {
      return NextResponse.json({ error: 'Seconds per question must be between 5 and 120' }, { status: 400 });
    }

    const db = getDb();

    // Validate every question id actually exists in the bank
    const placeholders = questionIds.map(() => '?').join(',');
    const found = db.prepare(`SELECT COUNT(*) as c FROM trivia_questions WHERE id IN (${placeholders})`).get(...questionIds) as { c: number };
    if (found.c !== questionIds.length) {
      return NextResponse.json({ error: 'One or more selected questions no longer exist' }, { status: 400 });
    }

    const result = db.prepare(`
      INSERT INTO trivia_sessions (name, status, question_ids, current_index, phase, seconds_per_question, created_at, updated_at)
      VALUES (?, 'draft', ?, -1, 'lobby', ?, datetime('now'), datetime('now'))
    `).run(name, JSON.stringify(questionIds), secondsPerQuestion);

    const row = db.prepare('SELECT * FROM trivia_sessions WHERE id = ?').get(result.lastInsertRowid) as TriviaSessionRawRow;
    return NextResponse.json(mapSessionRow(row));
  } catch (error) {
    const msg = toErrorMessage(error, 'Failed to create session');
    const status = msg.includes('required') || msg.includes('Admin') ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
