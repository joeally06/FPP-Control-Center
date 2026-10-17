import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import { mapQuestionRow, validateQuestionBody, type TriviaQuestionRawRow } from '@/lib/trivia-questions';

/** GET /api/trivia/questions - list the question bank (admin only) */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
    const db = getDb();
    const rows = db.prepare('SELECT * FROM trivia_questions ORDER BY category, id').all() as TriviaQuestionRawRow[];
    return NextResponse.json(rows.map(mapQuestionRow));
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
  }
}

/** POST /api/trivia/questions - add a question to the bank (admin only) */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);

    const body = await request.json();
    const validated = validateQuestionBody(body);
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO trivia_questions (category, question_text, choices, correct_index, points, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(validated.category, validated.questionText, JSON.stringify(validated.choices), validated.correctIndex, validated.points);

    const row = db.prepare('SELECT * FROM trivia_questions WHERE id = ?').get(result.lastInsertRowid) as TriviaQuestionRawRow;
    return NextResponse.json(mapQuestionRow(row));
  } catch (error) {
    const msg = toErrorMessage(error, 'Failed to create question');
    const status = msg.includes('required') || msg.includes('Admin') ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
