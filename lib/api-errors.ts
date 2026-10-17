/** Extract a safe message from a caught value of unknown type (catch clauses are untyped in strict TS). */
export function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
