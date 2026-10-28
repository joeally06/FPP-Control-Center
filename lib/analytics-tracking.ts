import type Database from 'better-sqlite3';

export interface TrackBody {
  action?: unknown;
  page?: unknown;
  sessionId?: unknown;
}

export interface GeoLocation {
  city: string | null;
  region: string | null;
  country: string | null;
}

export interface TrackContext {
  visitorHash: string;
  userAgent: string;
  /** Only called for a visitor seen for the first time */
  lookupGeo: () => Promise<GeoLocation>;
}

export interface TrackResult {
  status: number;
  body: Record<string, unknown>;
}

const MAX_PAGE_PATH_LENGTH = 200;
const MAX_USER_AGENT_LENGTH = 300;

/** A page path the browser sent, or the fallback if it doesn't look like one */
export function sanitizePagePath(page: unknown, fallback: string): string {
  if (typeof page !== 'string' || page.length === 0 || page.length > MAX_PAGE_PATH_LENGTH) return fallback;
  if (!page.startsWith('/') || /[\u0000-\u001f\u007f]/.test(page)) return fallback;
  return page;
}

/** A session ID is the number the server handed out; anything else is not one */
export function parseSessionId(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function trimUserAgent(userAgent: string): string {
  return userAgent.substring(0, MAX_USER_AGENT_LENGTH);
}

/**
 * Records one visitor-tracking event. A session can only be changed by the visitor it was created for
 * (the keyed IP hash), so a made-up or someone else's session ID changes nothing.
 */
export async function recordTrackEvent(
  db: Database.Database,
  body: TrackBody,
  ctx: TrackContext
): Promise<TrackResult> {
  const { action } = body;

  if (action === 'visit') {
    const visitor = db.prepare('SELECT 1 FROM visitors WHERE visitor_hash = ?').get(ctx.visitorHash);

    if (visitor) {
      db.prepare(`
        UPDATE visitors
        SET last_visit = CURRENT_TIMESTAMP,
            total_visits = total_visits + 1
        WHERE visitor_hash = ?
      `).run(ctx.visitorHash);
    } else {
      const geo = await ctx.lookupGeo();
      // OR IGNORE: a second tab from the same new address may have added the visitor while we waited
      db.prepare(`
        INSERT OR IGNORE INTO visitors (visitor_hash, city, region, country)
        VALUES (?, ?, ?, ?)
      `).run(ctx.visitorHash, geo.city, geo.region, geo.country);
    }

    const session = db.prepare(`
      INSERT INTO sessions (visitor_hash, user_agent)
      VALUES (?, ?)
    `).run(ctx.visitorHash, trimUserAgent(ctx.userAgent));

    db.prepare(`
      INSERT INTO page_views (session_id, page_path)
      VALUES (?, ?)
    `).run(session.lastInsertRowid, sanitizePagePath(body.page, '/jukebox'));

    return { status: 200, body: { success: true, sessionId: Number(session.lastInsertRowid), isReturning: !!visitor } };
  }

  if (action === 'pageview' || action === 'end') {
    const sessionId = parseSessionId(body.sessionId);
    const owned = sessionId !== null && db.prepare(
      'SELECT 1 FROM sessions WHERE id = ? AND visitor_hash = ?'
    ).get(sessionId, ctx.visitorHash);
    if (!owned) {
      return { status: 404, body: { error: 'Unknown session' } };
    }

    if (action === 'pageview') {
      db.prepare(`
        INSERT INTO page_views (session_id, page_path)
        VALUES (?, ?)
      `).run(sessionId, sanitizePagePath(body.page, '/'));

      db.prepare('UPDATE sessions SET page_views = page_views + 1 WHERE id = ?').run(sessionId);
    } else {
      // session_start is stored in UTC by SQLite, so the duration is worked out there too.
      // Only the first "end" counts: a repeat can't stretch the duration.
      db.prepare(`
        UPDATE sessions
        SET session_end = CURRENT_TIMESTAMP,
            duration_seconds = CAST((julianday('now') - julianday(session_start)) * 86400 AS INTEGER)
        WHERE id = ? AND session_end IS NULL
      `).run(sessionId);
    }

    return { status: 200, body: { success: true } };
  }

  return { status: 400, body: { error: 'Invalid action' } };
}
