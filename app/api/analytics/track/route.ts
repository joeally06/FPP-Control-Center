import { NextRequest, NextResponse } from 'next/server';
import { anonymizeIP, getClientIP, getGeolocation } from '@/lib/visitor-tracking';
import { getDb } from '@/lib/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, page, sessionId } = body;

    const ip = getClientIP(request);
    const visitorHash = anonymizeIP(ip);
    const userAgent = request.headers.get('user-agent') || 'Unknown';

    const db = getDb();

    if (action === 'visit') {
      // Check if visitor exists
      const visitor = db.prepare(`
        SELECT * FROM visitors WHERE visitor_hash = ?
      `).get(visitorHash) as any;

      if (visitor) {
        // Update existing visitor
        db.prepare(`
          UPDATE visitors 
          SET last_visit = CURRENT_TIMESTAMP, 
              total_visits = total_visits + 1
          WHERE visitor_hash = ?
        `).run(visitorHash);
      } else {
        // Get geolocation for new visitor
        const geo = await getGeolocation(ip);
        
        // Create new visitor
        db.prepare(`
          INSERT INTO visitors (visitor_hash, city, region, country)
          VALUES (?, ?, ?, ?)
        `).run(visitorHash, geo.city, geo.region, geo.country);
      }

      // Create new session
      const sessionResult = db.prepare(`
        INSERT INTO sessions (visitor_hash, user_agent)
        VALUES (?, ?)
      `).run(visitorHash, userAgent);

      const newSessionId = sessionResult.lastInsertRowid;

      // Record page view
      db.prepare(`
        INSERT INTO page_views (session_id, page_path)
        VALUES (?, ?)
      `).run(newSessionId, page || '/jukebox');


      return NextResponse.json({ 
        success: true, 
        sessionId: newSessionId,
        isReturning: !!visitor
      });

    } else if (action === 'pageview' && sessionId) {
      // Record additional page view
      db.prepare(`
        INSERT INTO page_views (session_id, page_path)
        VALUES (?, ?)
      `).run(sessionId, page || '/');

      // Update session page view count
      db.prepare(`
        UPDATE sessions 
        SET page_views = page_views + 1
        WHERE id = ?
      `).run(sessionId);


      return NextResponse.json({ success: true });

    } else if (action === 'end' && sessionId) {
      // End session and calculate duration
      const session = db.prepare(`
        SELECT session_start FROM sessions WHERE id = ?
      `).get(sessionId) as any;

      if (session) {
        const startTime = new Date(session.session_start).getTime();
        const endTime = Date.now();
        const durationSeconds = Math.floor((endTime - startTime) / 1000);

        db.prepare(`
          UPDATE sessions 
          SET session_end = CURRENT_TIMESTAMP,
              duration_seconds = ?
          WHERE id = ?
        `).run(durationSeconds, sessionId);
      }


      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Visitor tracking error:', error);
    return NextResponse.json(
      { error: 'Failed to track visitor' },
      { status: 500 }
    );
  }
}
