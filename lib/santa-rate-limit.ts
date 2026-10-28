import { getDb } from './database';

export interface RateLimitResult {
  allowed: boolean;
  emailCount: number;
  ipCount: number;
  limit: number;
  reason?: 'email_limit' | 'ip_limit';
}

/**
 * Check Santa letter rate limits for both email and IP address
 * This prevents abuse by tracking both identifiers independently
 * @param email - Parent's email address from session
 * @param ipAddress - Client IP address from request headers
 * @returns Rate limit result with counts and permission status
 */
export function checkSantaRateLimit(email: string, ipAddress: string): RateLimitResult {
  const db = getDb();

  // Get daily limit from settings
  const setting = db.prepare('SELECT value FROM settings WHERE key = ?')
    .get('santa_daily_limit') as { value: string } | undefined;
  
  const limit = setting ? parseInt(setting.value, 10) : 1;

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  // Count letters by email today (prevents multiple account abuse)
  const emailResult = db.prepare(`
    SELECT COUNT(*) as count 
    FROM santa_letters 
    WHERE parent_email = ? 
    AND DATE(created_at) = DATE(?)
  `).get(email, today) as { count: number };

  // Count letters by IP today (prevents VPN hopping abuse)
  const ipResult = db.prepare(`
    SELECT COUNT(*) as count 
    FROM santa_letters 
    WHERE ip_address = ? 
    AND DATE(created_at) = DATE(?)
  `).get(ipAddress, today) as { count: number };

  const emailCount = emailResult.count;
  const ipCount = ipResult.count;

  // Check if either limit is exceeded (whichever hits first blocks)
  if (emailCount >= limit) {
    return {
      allowed: false,
      emailCount,
      ipCount,
      limit,
      reason: 'email_limit'
    };
  }

  if (ipCount >= limit) {
    return {
      allowed: false,
      emailCount,
      ipCount,
      limit,
      reason: 'ip_limit'
    };
  }

  return {
    allowed: true,
    emailCount,
    ipCount,
    limit
  };

}

// One shared implementation (see lib/rate-limit.ts and server.js)
export { getClientIP } from './rate-limit';
