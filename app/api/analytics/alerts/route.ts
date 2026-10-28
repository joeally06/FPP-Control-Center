import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { getDb } from '@/lib/database';

export async function GET() {
  try {
    // Require admin authentication
    await requireAdmin();

    const db = getDb();

    // Get current queue stats
    const queueStats = db.prepare(`
      SELECT 
        COUNT(*) as total_pending,
        SUM(CASE WHEN status = 'playing' THEN 1 ELSE 0 END) as currently_playing
      FROM jukebox_queue
      WHERE status IN ('pending', 'playing')
    `).get() as { total_pending: number; currently_playing: number };

    // Get average wait time for recent requests
    const avgWait = db.prepare(`
      SELECT 
        AVG(
          (julianday(played_at) - julianday(created_at)) * 24 * 60
        ) as avg_wait_minutes
      FROM jukebox_queue
      WHERE played_at IS NOT NULL
        AND created_at >= datetime('now', '-1 hour')
    `).get() as { avg_wait_minutes: number | null };

    // Get recent request rate (requests per minute in last 10 minutes)
    const requestRate = db.prepare(`
      SELECT 
        COUNT(*) * 1.0 / 10 as requests_per_minute
      FROM jukebox_queue
      WHERE created_at >= datetime('now', '-10 minutes')
    `).get() as { requests_per_minute: number };


    // Define alert thresholds
    const QUEUE_LENGTH_WARNING = 10;
    const QUEUE_LENGTH_CRITICAL = 20;
    const WAIT_TIME_WARNING = 15; // minutes
    const REQUEST_RATE_HIGH = 2; // requests per minute

    const alerts = [];

    // Check queue length
    if (queueStats.total_pending >= QUEUE_LENGTH_CRITICAL) {
      alerts.push({
        type: 'critical',
        category: 'queue_length',
        message: `Queue is critically long with ${queueStats.total_pending} pending requests!`,
        value: queueStats.total_pending,
        threshold: QUEUE_LENGTH_CRITICAL
      });
    } else if (queueStats.total_pending >= QUEUE_LENGTH_WARNING) {
      alerts.push({
        type: 'warning',
        category: 'queue_length',
        message: `Queue is getting long with ${queueStats.total_pending} pending requests.`,
        value: queueStats.total_pending,
        threshold: QUEUE_LENGTH_WARNING
      });
    }

    // Check wait time
    if (avgWait.avg_wait_minutes && avgWait.avg_wait_minutes >= WAIT_TIME_WARNING) {
      alerts.push({
        type: 'warning',
        category: 'wait_time',
        message: `Average wait time is ${Math.round(avgWait.avg_wait_minutes)} minutes.`,
        value: Math.round(avgWait.avg_wait_minutes),
        threshold: WAIT_TIME_WARNING
      });
    }

    // Check request rate
    if (requestRate.requests_per_minute >= REQUEST_RATE_HIGH) {
      alerts.push({
        type: 'info',
        category: 'request_rate',
        message: `High request rate: ${requestRate.requests_per_minute.toFixed(1)} requests/minute.`,
        value: requestRate.requests_per_minute,
        threshold: REQUEST_RATE_HIGH
      });
    }

    return NextResponse.json({
      stats: {
        total_pending: queueStats.total_pending,
        currently_playing: queueStats.currently_playing,
        avg_wait_minutes: avgWait.avg_wait_minutes ? Math.round(avgWait.avg_wait_minutes) : null,
        requests_per_minute: requestRate.requests_per_minute.toFixed(1)
      },
      alerts,
      hasAlerts: alerts.length > 0
    });

  } catch (error) {
    console.error('Alerts error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch alerts' },
      { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
