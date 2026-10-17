// Santa letter email confirmation (double opt-in) and the all-visitors daily cap.
// A letter's reply is only generated and emailed after the parent clicks the link sent to
// their address, so the public form cannot be used to send email to strangers.

import crypto from 'crypto';
import type BetterSqlite3 from 'better-sqlite3';

type Db = BetterSqlite3.Database;

export const CONFIRM_TTL_HOURS = 72;
export const DEFAULT_SANTA_DAILY_CAP = 50;
export const SANTA_DAILY_CAP_MAX = 1000;

const CONFIRM_ATTEMPTS = { max: 10, windowMs: 10 * 60 * 1000 };

/**
 * Oldest queued letter the processor may answer: letters waiting for their parent's
 * confirmation and letters an admin rejected are skipped; letters without a confirmation
 * row (sent before confirmation existed) are answered as before.
 */
export const NEXT_QUEUED_LETTER_SQL = `
  SELECT * FROM santa_letters
  WHERE queue_status = 'queued'
    AND status IS NOT 'rejected'
    AND NOT EXISTS (
      SELECT 1 FROM santa_letter_confirmations c
      WHERE c.letter_id = santa_letters.id AND c.confirmed_at IS NULL
    )
  ORDER BY created_at ASC
  LIMIT 1
`;

export type ConfirmResult = 'confirmed' | 'already_confirmed' | 'expired' | 'invalid';

/** SQLite CURRENT_TIMESTAMP format (UTC), so JS and SQL comparisons agree */
function toDbTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** The admin setting as a whole number from 1 to 1000, or null if it is anything else */
export function parseSantaDailyCap(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const cap = parseInt(value, 10);
  return cap >= 1 && cap <= SANTA_DAILY_CAP_MAX ? cap : null;
}

/** 32 random bytes in base64url */
export function isConfirmTokenShape(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** Store a confirmation for a new letter; returns the token for the email link (only its hash is kept) */
export function createLetterConfirmation(db: Db, letterId: number, now = new Date()): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + CONFIRM_TTL_HOURS * 60 * 60 * 1000);
  db.prepare(`
    INSERT INTO santa_letter_confirmations (letter_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(letterId, hashToken(token), toDbTimestamp(expiresAt), toDbTimestamp(now));
  return token;
}

/** Mark the letter behind a token as confirmed; a token works once and only before it expires */
export function confirmLetter(db: Db, token: string, now = new Date()): ConfirmResult {
  if (!isConfirmTokenShape(token)) return 'invalid';
  const tokenHash = hashToken(token);
  const row = db.prepare(`
    SELECT expires_at, confirmed_at FROM santa_letter_confirmations WHERE token_hash = ?
  `).get(tokenHash) as { expires_at: string; confirmed_at: string | null } | undefined;

  if (!row) return 'invalid';
  if (row.confirmed_at) return 'already_confirmed';
  const nowDb = toDbTimestamp(now);
  if (row.expires_at <= nowDb) return 'expired';

  const result = db.prepare(`
    UPDATE santa_letter_confirmations SET confirmed_at = ? WHERE token_hash = ? AND confirmed_at IS NULL
  `).run(nowDb, tokenHash);
  return result.changes === 1 ? 'confirmed' : 'already_confirmed';
}

/** Remove a letter whose confirmation email could not be sent, so it doesn't use up the parent's allowance */
export function deleteUnconfirmedLetter(db: Db, letterId: number): void {
  db.transaction(() => {
    db.prepare('DELETE FROM santa_letter_confirmations WHERE letter_id = ?').run(letterId);
    db.prepare('DELETE FROM santa_letters WHERE id = ?').run(letterId);
  })();
}

/** Letters received today from all visitors (UTC day, like the per-visitor limit) */
export function lettersToday(db: Db): number {
  const row = db.prepare(`
    SELECT COUNT(*) AS count FROM santa_letters WHERE created_at >= DATE('now')
  `).get() as { count: number };
  return row.count;
}

export function confirmationUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/santa/confirm?token=${encodeURIComponent(token)}`;
}

const confirmAttempts = new Map<string, { count: number; windowStart: number }>();

/** Per-IP limit on confirm attempts: 10 per 10 minutes */
export function allowConfirmAttempt(ip: string, now = Date.now()): boolean {
  for (const [key, entry] of confirmAttempts) {
    if (now - entry.windowStart >= CONFIRM_ATTEMPTS.windowMs) confirmAttempts.delete(key);
  }
  const entry = confirmAttempts.get(ip) ?? { count: 0, windowStart: now };
  if (entry.count >= CONFIRM_ATTEMPTS.max) return false;
  entry.count += 1;
  confirmAttempts.set(ip, entry);
  return true;
}
