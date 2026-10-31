import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { getVoteCounts } from '../../../../lib/database';

/**
 * GET /api/admin/analytics
 * Get admin analytics data including vote counts and scores
 * ADMIN ONLY - Admin dashboard analytics
 */
export async function GET(request: NextRequest) {
  try {
    // Require admin authentication with rate limiting
    await requireAdminWithRateLimit(request);

    // Get vote data
    const voteCounts = getVoteCounts.all();

    // Transform data for analytics
    const analyticsData = voteCounts.map((row: any) => ({
      sequence_name: row.sequence_name,
      upvotes: row.upvotes,
      downvotes: row.downvotes,
      total_votes: row.upvotes + row.downvotes,
      score: row.upvotes - row.downvotes
    }));

    return NextResponse.json(analyticsData);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('Analytics error:', error);
    return NextResponse.json({ error: 'Failed to get analytics' }, { status: 500 });
  }
}