import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import db from '@/lib/database';
import { DateTime } from 'luxon';
import { APP_TIMEZONE } from '@/lib/time-utils';
import { pageViewStats, windowStartUtc, zoneAbbr } from '@/lib/analytics-time';

/**
 * GET /api/analytics
 * Get analytics dashboard data including page views, votes, ratings, and traffic patterns
 * ADMIN ONLY - Contains sensitive visitor and usage data
 */
export async function GET(request: NextRequest) {
  try {
    // Require admin authentication
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '7d';
    const days = range === '30d' ? 30 : 7;

    // Days, hours and the "today" cut-off are on the show's clock (NEXT_PUBLIC_TIMEZONE), not UTC
    const timezone = APP_TIMEZONE;
    const now = DateTime.now();
    const startDateStr = windowStartUtc(days, now, timezone);

    const views = pageViewStats(db, days, now, timezone);

    const voteStats = db.prepare(`
      SELECT
        SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) as upvotes,
        SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END) as downvotes
      FROM votes
      WHERE created_at >= ?
    `).get(startDateStr) as { upvotes: number | null; downvotes: number | null };

    // Format peak hour in 12-hour format with timezone
    let peakHour = 'N/A';
    if (views.peakHour !== null) {
      const hour24 = views.peakHour;
      const period = hour24 >= 12 ? 'PM' : 'AM';
      const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
      peakHour = `${hour12}:00 ${period} ${zoneAbbr(now, timezone)}`;
    }

    // Calculate rating (0-5 scale based on upvote ratio)
    const totalVotes = (voteStats.upvotes || 0) + (voteStats.downvotes || 0);
    const avgRating = totalVotes > 0
      ? ((voteStats.upvotes || 0) / totalVotes) * 5
      : 0;

    // Daily trends: one entry per local day, today last (days with no views show 0)
    const trends = views.trends;

    // Get top sequences
    const topSequences = (db.prepare(`
      SELECT 
        sequence_name as name,
        SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) as upvotes,
        SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END) as downvotes,
        COUNT(*) as votes
      FROM votes
      WHERE created_at >= ?
      GROUP BY sequence_name
      ORDER BY upvotes DESC
      LIMIT 10
    `).all(startDateStr) as { name: string; upvotes: number; votes: number }[]).map((row) => ({
      name: row.name,
      votes: row.votes,
      rating: row.votes > 0 ? (row.upvotes / row.votes) * 5 : 0
    }));

    // Get top playlists (from page views of playlist pages)
    const topPlaylists = (db.prepare(`
      SELECT 
        page_path as name,
        COUNT(*) as plays
      FROM page_views
      WHERE page_path LIKE '/playlists%' AND view_time >= ?
      GROUP BY page_path
      ORDER BY plays DESC
      LIMIT 10
    `).all(startDateStr) as { name: string; plays: number }[]).map((row) => ({
      name: row.name.replace('/playlists/', '').replace('/playlists', 'Main'),
      plays: row.plays,
    }));

    // Get top pages
    const topPages = db.prepare(`
      SELECT 
        page_path as name,
        COUNT(*) as views
      FROM page_views
      WHERE view_time >= ?
      GROUP BY page_path
      ORDER BY views DESC
      LIMIT 10
    `).all(startDateStr) as { name: string; views: number }[];

    // Get Santa letters stats
    // ⚡ PERFORMANCE: Combine 4 queries into 1
    const santaStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM santa_letters
    `).get() as { total: number; pending: number; sent: number; failed: number };

    const data = {
      overview: {
        totalViews: views.totalViews,
        todayViews: views.todayViews,
        peakHour: peakHour,
        avgRating: avgRating,
      },
      trends,
      topContent: {
        sequences: topSequences,
        playlists: topPlaylists.length > 0 ? topPlaylists : [{ name: 'No data yet', plays: 0 }],
        pages: topPages,
      },
      santaLetters: {
        total: santaStats.total,
        pending: santaStats.pending,
        sent: santaStats.sent,
        failed: santaStats.failed,
      },
      timezone, // Include for debugging
    };

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('Analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
