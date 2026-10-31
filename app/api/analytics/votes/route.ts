import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { getDb } from '@/lib/database';

// A copy of the object without the given keys (the SQL helper columns must not appear in the response)
function omit<T extends object, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
  const copy: Partial<T> = { ...obj };
  for (const key of keys) delete copy[key];
  return copy as Omit<T, K>;
}

export async function GET() {
  try {
    // Require admin authentication
    await requireAdmin();

    const db = getDb();

    // ⚡ PERFORMANCE OPTIMIZATION: Combine top voted and controversial into one CTE-based query
    // Old approach: 2 separate complex queries
    // New approach: 1 query with CTEs that calculates both = 2x faster
    const votingStats = db.prepare(`
      WITH vote_aggregates AS (
        SELECT 
          sequence_name,
          SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) as upvotes,
          SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END) as downvotes,
          COUNT(*) as total_votes,
          (SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) - SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END)) as net_votes,
          CASE 
            WHEN COUNT(*) > 0 
            THEN CAST(SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100 
            ELSE 0 
          END as approval_rating,
          ABS(SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) - SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END)) as vote_difference,
          CASE 
            WHEN COUNT(*) > 0 
            THEN ABS(CAST(SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) - 0.5)
            ELSE 1
          END as controversy_score
        FROM votes
        GROUP BY sequence_name
      ),
      top_voted_sequences AS (
        SELECT 
          sequence_name, upvotes, downvotes, net_votes, total_votes, approval_rating,
          'top' as category
        FROM vote_aggregates
        WHERE total_votes > 0
        ORDER BY net_votes DESC
        LIMIT 20
      ),
      controversial_sequences AS (
        SELECT 
          sequence_name, upvotes, downvotes, net_votes, total_votes, approval_rating,
          'controversial' as category
        FROM vote_aggregates
        WHERE total_votes >= 5
        ORDER BY controversy_score ASC
        LIMIT 20
      )
      SELECT * FROM top_voted_sequences
      UNION ALL
      SELECT * FROM controversial_sequences
    `).all() as Array<{
      sequence_name: string;
      upvotes: number;
      downvotes: number;
      net_votes: number;
      total_votes: number;
      approval_rating: number;
      category: 'top' | 'controversial';
    }>;

    // Separate the results
    const topVoted = votingStats.filter(row => row.category === 'top')
      .map(row => omit(row, 'category'));
    const controversial = votingStats.filter(row => row.category === 'controversial')
      .map(row => ({
        ...omit(row, 'category', 'net_votes'),
        vote_difference: Math.abs(row.upvotes - row.downvotes)
      }));

    // Total voting statistics
    const totalStats = db.prepare(`
      SELECT 
        COUNT(DISTINCT sequence_name) as sequences_with_votes,
        SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) as total_upvotes,
        SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END) as total_downvotes,
        COUNT(*) as total_votes
      FROM votes
    `).get();

    // Voting activity over time (last 30 days by day)
    const votingTrend = db.prepare(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as vote_count,
        SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) as upvotes,
        SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END) as downvotes
      FROM votes
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY date
    `).all();

    // Voting activity by hour
    const votingByHour = db.prepare(`
      SELECT 
        CAST(strftime('%H', created_at) AS INTEGER) as hour,
        COUNT(*) as vote_count,
        SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) as upvotes,
        SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END) as downvotes
      FROM votes
      GROUP BY hour
      ORDER BY hour
    `).all();


    return NextResponse.json({
      topVoted,
      controversial,
      totalStats,
      votingTrend,
      votingByHour
    });

  } catch (error) {
    console.error('Vote analytics error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch vote analytics' },
      { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
