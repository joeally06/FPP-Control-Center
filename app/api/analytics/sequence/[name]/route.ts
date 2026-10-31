import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { getDb } from '@/lib/database';

/**
 * GET /api/analytics/sequence/[name]
 * 
 * Fetches analytics data for a specific sequence:
 * - Vote count (total votes)
 * - Average rating
 * - Play count (completed requests)
 * - Recent activity
 * ADMIN ONLY - Detailed sequence analytics
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    // Require admin authentication
    await requireAdmin();

    const { name } = await params;
    const sequenceName = decodeURIComponent(name);

    console.log(`[Analytics] Request for sequence: "${sequenceName}"`);

    const db = getDb();

    // Get vote statistics
    const voteStats = db.prepare(`
      SELECT 
        COUNT(*) as totalVotes,
        SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) as upvotes,
        SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END) as downvotes
      FROM votes 
      WHERE sequence_name = ?
    `).get(sequenceName) as any;

    // Get average rating from jukebox queue (note: rating column doesn't exist in jukebox_queue)
    // This query will return zeros since jukebox_queue doesn't have rating column
    const ratingStats = {
      ratedCount: 0,
      avgRating: null,
      minRating: null,
      maxRating: null
    };

    // Get play count (completed requests from jukebox_queue)
    const playStats = db.prepare(`
      SELECT 
        COUNT(*) as totalRequests,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedPlays,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingRequests
      FROM jukebox_queue 
      WHERE sequence_name = ?
    `).get(sequenceName) as any;

    // Get recent activity (last 10 requests)
    const recentActivity = db.prepare(`
      SELECT 
        id,
        status,
        created_at,
        requester_name as requested_by
      FROM jukebox_queue 
      WHERE sequence_name = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(sequenceName);

    // Get first and last played dates
    const playDates = db.prepare(`
      SELECT 
        MIN(created_at) as firstPlayed,
        MAX(created_at) as lastPlayed
      FROM jukebox_queue 
      WHERE sequence_name = ? AND status = 'completed'
    `).get(sequenceName) as any;


    // Calculate derived metrics
    const totalVotes = voteStats.totalVotes || 0;
    const upvotes = voteStats.upvotes || 0;
    const downvotes = voteStats.downvotes || 0;
    const voteRatio = totalVotes > 0 ? (upvotes / totalVotes) * 100 : 0;

    const avgRating = 0; // Rating feature not implemented in jukebox_queue
    const ratedCount = 0;

    const totalRequests = playStats.totalRequests || 0;
    const completedPlays = playStats.completedPlays || 0;
    const pendingRequests = playStats.pendingRequests || 0;
    const completionRate = totalRequests > 0 ? (completedPlays / totalRequests) * 100 : 0;

    console.log(`[Analytics] ${sequenceName}: ${totalVotes} votes, ${avgRating} rating, ${completedPlays} plays`);

    return NextResponse.json({
      sequenceName,
      votes: {
        total: totalVotes,
        upvotes: upvotes,
        downvotes: downvotes,
        ratio: parseFloat(voteRatio.toFixed(1))
      },
      rating: {
        average: avgRating,
        count: ratedCount,
        min: ratingStats.minRating || 0,
        max: ratingStats.maxRating || 0
      },
      plays: {
        total: totalRequests,
        completed: completedPlays,
        pending: pendingRequests,
        completionRate: parseFloat(completionRate.toFixed(1))
      },
      activity: {
        firstPlayed: playDates.firstPlayed || null,
        lastPlayed: playDates.lastPlayed || null,
        recent: recentActivity
      },
      summary: {
        isPopular: totalVotes > 10 || completedPlays > 20,
        isHighRated: avgRating >= 4.0,
        hasActivity: totalRequests > 0 || totalVotes > 0
      }
    });

  } catch (error) {
    if (error instanceof Error && error.message.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[Analytics] Unexpected error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch sequence analytics',
        details: error instanceof Error ? error.message : undefined 
      },
      { status: 500 }
    );
  }
}

/**
 * HEAD /api/analytics/sequence/[name]
 * 
 * Lightweight version returning only basic stats
 * (for use in lists where full analytics aren't needed)
 * ADMIN ONLY - Quick stats endpoint
 */
export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    // Require admin authentication
    await requireAdmin();

    const { name } = await params;
    const sequenceName = decodeURIComponent(name);

    const db = getDb();

    // Quick stats query (note: jukebox_queue doesn't have rating column)
    const stats = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM votes WHERE sequence_name = ?) as votes,
        0 as rating,
        (SELECT COUNT(*) FROM jukebox_queue WHERE sequence_name = ? AND status = 'completed') as plays
    `).get(sequenceName, sequenceName) as any;


    return NextResponse.json({
      votes: stats.votes || 0,
      rating: stats.rating ? parseFloat(stats.rating.toFixed(1)) : 0,
      playCount: stats.plays || 0
    });

  } catch (error: any) {
    if (error.message?.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error.message?.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[Analytics] Simple stats error:', error);
    console.error('[Analytics] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return NextResponse.json(
      { 
        error: 'Failed to fetch stats',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
