import type { TriviaQuestionRow } from '@/types/trivia';

export interface TriviaQuestionRawRow {
  id: number;
  category: string;
  question_text: string;
  choices: string;
  correct_index: number;
  points: number;
  created_at: string;
  updated_at: string;
}

export function mapQuestionRow(row: TriviaQuestionRawRow): TriviaQuestionRow {
  return {
    id: row.id,
    category: row.category,
    questionText: row.question_text,
    choices: JSON.parse(row.choices || '[]'),
    correctIndex: row.correct_index,
    points: row.points,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ValidatedQuestion {
  category: string;
  questionText: string;
  choices: string[];
  correctIndex: number;
  points: number;
}

export function validateQuestionBody(body: unknown): { error: string } | ValidatedQuestion {
  const b = (body ?? {}) as Record<string, unknown>;

  const category = typeof b.category === 'string' && b.category.trim() ? b.category.trim().slice(0, 40) : 'General';

  const questionText = typeof b.questionText === 'string' ? b.questionText.trim() : '';
  if (!questionText || questionText.length > 300) {
    return { error: 'Question text is required (max 300 characters)' };
  }

  const choices = Array.isArray(b.choices) ? b.choices.map((c) => String(c).trim()) : [];
  if (choices.length < 2 || choices.length > 6 || choices.some((c: string) => !c || c.length > 200)) {
    return { error: 'Provide 2-6 non-empty choices (max 200 characters each)' };
  }

  const correctIndex = Number(b.correctIndex);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) {
    return { error: 'correctIndex must point at one of the provided choices' };
  }

  const points = Number.isFinite(Number(b.points)) ? Math.round(Number(b.points)) : 1000;
  if (points < 100 || points > 5000) {
    return { error: 'Points must be between 100 and 5000' };
  }

  return { category, questionText, choices, correctIndex, points };
}
