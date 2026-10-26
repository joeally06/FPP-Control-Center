// Pure trivia logic (the admin setting limits), isolated so it can be unit-tested
// and imported by client components (mirrors lib/game-logic.ts).

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
