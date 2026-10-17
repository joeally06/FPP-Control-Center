import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import { mapQuestionRow, validateQuestionBody, type TriviaQuestionRawRow } from '@/lib/trivia-questions';

/** PATCH /api/trivia/questions/[id] - edit a question (admin only) */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminWithRateLimit(request);

    const { id } = await params;
    const questionId = Number(id);
    if (!Number.isInteger(questionId)) {
      return NextResponse.json({ error: 'Invalid question id' }, { status: 400 });
    }

    const body = await request.json();
    const validated = validateQuestionBody(body);
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const db = getDb();
    const result = db.prepare(`
      UPDATE trivia_questions
      SET category = ?, question_text = ?, choices = ?, correct_index = ?, points = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(validated.category, validated.questionText, JSON.stringify(validated.choices), validated.correctIndex, validated.points, questionId);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    const row = db.prepare('SELECT * FROM trivia_questions WHERE id = ?').get(questionId) as TriviaQuestionRawRow;
    return NextResponse.json(mapQuestionRow(row));
  } catch (error) {
    const msg = toErrorMessage(error, 'Failed to update question');
    const status = msg.includes('required') || msg.includes('Admin') ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/** DELETE /api/trivia/questions/[id] - remove a question from the bank (admin only) */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminWithRateLimit(request);

    const { id } = await params;
    const questionId = Number(id);
    if (!Number.isInteger(questionId)) {
      return NextResponse.json({ error: 'Invalid question id' }, { status: 400 });
    }

    const db = getDb();
    const result = db.prepare('DELETE FROM trivia_questions WHERE id = ?').run(questionId);
    if (result.changes === 0) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = toErrorMessage(error, 'Failed to delete question');
    const status = msg.includes('required') || msg.includes('Admin') ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
