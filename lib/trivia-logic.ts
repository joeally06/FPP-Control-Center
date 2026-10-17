// Pure trivia scoring logic, isolated so it can be unit-tested (mirrors lib/game-logic.ts).

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

const triviaLogic = { computePoints };
export default triviaLogic;
