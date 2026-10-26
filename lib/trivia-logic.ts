// Pure trivia logic (scoring and the admin setting limits), isolated so it can be unit-tested
// and imported by client components (mirrors lib/game-logic.ts).

const MIN_POINTS_RATIO = 0.3; // slowest correct answer still keeps 30% of base points

/**
 * Score a single answer.
 * - Wrong answers always score 0.
 * - Correct answers score from basePoints (instant) down to basePoints * MIN_POINTS_RATIO
 *   (answered right at the deadline), decaying linearly with elapsed time.
 */
export function computePoints(
  correct: boolean,
  answerMs: number,
  windowMs: number,
  basePoints: number
): number {
  if (!correct || basePoints <= 0) return 0;
  if (windowMs <= 0) return basePoints;

  const clampedMs = Math.max(0, Math.min(answerMs, windowMs));
  const speedRatio = 1 - clampedMs / windowMs; // 1 = instant, 0 = right at deadline
  const ratio = MIN_POINTS_RATIO + (1 - MIN_POINTS_RATIO) * speedRatio;

  return Math.round(basePoints * ratio);
}

export const TRIVIA_SETTING_LIMITS = {
  trivia_questions_per_game: { min: 3, max: 25, default: 10 },
  trivia_seconds_per_question: { min: 5, max: 60, default: 20 },
} as const;

export type TriviaSettingKey = keyof typeof TRIVIA_SETTING_LIMITS;

/** The admin setting as a whole number within its limits, or null if it is anything else */
export function parseTriviaSetting(key: TriviaSettingKey, value: string | null | undefined): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const n = parseInt(value, 10);
  const { min, max } = TRIVIA_SETTING_LIMITS[key];
  return n >= min && n <= max ? n : null;
}

const triviaLogic = { computePoints };
export default triviaLogic;
