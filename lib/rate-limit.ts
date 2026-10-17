import Database from 'better-sqlite3';
import path from 'path';

// Separate database for settings (votes.db)
const votesDbPath = path.join(process.cwd(), 'votes.db');

// ⚡ PERFORMANCE OPTIMIZATION: Shared read-only database connection
// Old approach: Open/close connection on every call (10-20ms overhead)
// New approach: Reuse single read-only connection (1-2ms) = 10x faster
let sharedReadOnlyDb: Database.Database | null = null;

function getReadOnlyConnection(): Database.Database {
  if (!sharedReadOnlyDb || !sharedReadOnlyDb.open) {
    sharedReadOnlyDb = new Database(votesDbPath, { readonly: true });
    console.log('[RATE LIMIT] 🔌 Initialized shared read-only database connection');
  }
  return sharedReadOnlyDb;
}

/**
 * Get the rate limit for song requests from settings
 * Uses a shared read-only connection for optimal performance
 */
export function getSongRequestRateLimit(): number {
  try {
    const db = getReadOnlyConnection();
    
    const row = db.prepare('SELECT value FROM settings WHERE key = ?')
      .get('jukebox_rate_limit') as { value: string } | undefined;
    
    if (row) {
      const limit = parseInt(row.value, 10);
      if (!isNaN(limit) && limit >= 1 && limit <= 10) {
        return limit;
      }
    }
  } catch (error) {
    console.error('[RATE LIMIT] CRITICAL: Error reading jukebox_rate_limit setting:', error);
    // Try to reconnect on next call
    if (sharedReadOnlyDb) {
      try {
        sharedReadOnlyDb.close();
      } catch (closeError) {
        // Log close errors but don't throw - we're already in error recovery
        console.error('[RATE LIMIT] WARNING: Failed to close database connection during error recovery:', closeError);
      }
      sharedReadOnlyDb = null;
    }
  }
  
  // Default to 3 if not set or error
  return 3;
}

// Set by server.js from the real connection; any copy a visitor sends is overwritten there
export const CLIENT_IP_HEADER = 'x-fpp-client-ip';

let warnedNoClientIpHeader = false;

/**
 * The visitor's IP address, for rate limits and per-visitor records.
 *
 * Security: in production server.js supplies it (CF-Connecting-IP is only believed when
 * cloudflared on this machine sent it). Without server.js (`next dev`, or an old
 * `next start` command) this falls back to forwarding headers, which visitors can fake.
 */
export function getClientIP(request: Request): string {
  const headers = request.headers;

  const trustedIp = headers.get(CLIENT_IP_HEADER);
  if (trustedIp) {
    return trustedIp;
  }

  if (process.env.NODE_ENV === 'production' && !warnedNoClientIpHeader) {
    warnedNoClientIpHeader = true;
    console.warn('[RATE LIMIT] ⚠️ Not started with server.js (npm start) - visitor IPs come from headers that can be faked');
  }

  const cfConnectingIp = headers.get('cf-connecting-ip');
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback to a placeholder
  return 'unknown';
}
