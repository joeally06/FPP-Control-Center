import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { getDb } from '@/lib/database';

export async function GET() {
  try {
    // Require admin authentication
    await requireAdmin();

    const db = getDb();

    // Most requested songs
    const mostRequested = db.prepare(`
      SELECT 
        sequence_name,
        COUNT(*) as request_count,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped_count,
        MIN(created_at) as first_requested,
        MAX(created_at) as last_requested
      FROM jukebox_queue
      GROUP BY sequence_name
      ORDER BY request_count DESC
      LIMIT 20
    `).all();

    // Requests by hour of day
    const requestsByHour = db.prepare(`
      SELECT 
        CAST(strftime('%H', created_at) AS INTEGER) as hour,
        COUNT(*) as request_count
      FROM jukebox_queue
      GROUP BY hour
      ORDER BY hour
    `).all();

    // Requests by day of week (0=Sunday, 6=Saturday)
    const requestsByDay = db.prepare(`
      SELECT 
        CAST(strftime('%w', created_at) AS INTEGER) as day,
        COUNT(*) as request_count
      FROM jukebox_queue
      GROUP BY day
      ORDER BY day
    `).all();

    // Request success rate
    const successRate = db.prepare(`
      SELECT 
        status,
        COUNT(*) as count
      FROM jukebox_queue
      GROUP BY status
    `).all();

    // Recent activity (last 50 requests)
    const recentActivity = db.prepare(`
      SELECT 
        id,
        sequence_name,
        requester_name,
        status,
        created_at,
        played_at
      FROM jukebox_queue
      ORDER BY created_at DESC
      LIMIT 50
    `).all();

    // Average wait time for completed songs (in seconds)
    const avgWaitTime = db.prepare(`
      SELECT 
        AVG(
          (julianday(played_at) - julianday(created_at)) * 24 * 60 * 60
        ) as avg_wait_seconds
      FROM jukebox_queue
      WHERE played_at IS NOT NULL
    `).get() as { avg_wait_seconds: number | null };


    return NextResponse.json({
      mostRequested,
      requestsByHour,
      requestsByDay,
      successRate,
      recentActivity,
      avgWaitTime
    });

  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch analytics' },
      { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
