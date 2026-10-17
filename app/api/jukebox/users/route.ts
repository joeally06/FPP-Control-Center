import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import db from '@/lib/database';
import { resetRequestLimit } from '@/lib/jukebox-queue';
import { anonymizeIP } from '@/lib/privacy-utils';

/**
 * GET /api/jukebox/users
 * Get list of users with their request counts
 * ADMIN ONLY
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ 
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    // Get all users with requests in last hour (only requests that still count: not before any clear)
    const users = db.prepare(`
      SELECT
        requester_ip,
        requester_name,
        COUNT(*) as request_count,
        MAX(created_at) as last_request,
        MIN(created_at) as first_request
      FROM jukebox_queue q
      WHERE created_at >= datetime('now', '-1 hour')
        AND created_at >= COALESCE((SELECT reset_at FROM jukebox_rate_limit_resets r WHERE r.requester_ip = q.requester_ip), '')
      GROUP BY requester_ip
      ORDER BY request_count DESC, last_request DESC
    `).all() as Array<{
      requester_ip: string;
      requester_name: string;
      request_count: number;
      last_request: string;
      first_request: string;
    }>;

    console.log(`[Jukebox Users] Found ${users.length} active users in last hour`);

    return NextResponse.json({
      success: true,
      users: users.map(user => ({
        ip: user.requester_ip,
        name: user.requester_name,
        requestCount: user.request_count,
        lastRequest: user.last_request,
        firstRequest: user.first_request
      }))
    });

  } catch (error) {
    console.error('[Jukebox Users] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch users' 
    }, { status: 500 });
  }
}

/**
 * DELETE /api/jukebox/users
 * Clear rate limit for a specific user (by IP)
 * ADMIN ONLY
 */
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ 
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userIp = searchParams.get('ip');

    if (!userIp) {
      return NextResponse.json({ 
        error: 'Missing user IP' 
      }, { status: 400 });
    }

    // Delete all pending/completed requests for this user in last hour
    // Keep 'playing' status to avoid interrupting current songs; the reset stops it counting
    const result = db.transaction(() => {
      const deleted = db.prepare(`
        DELETE FROM jukebox_queue
        WHERE requester_ip = ?
        AND status IN ('pending', 'completed', 'skipped')
        AND created_at >= datetime('now', '-1 hour')
      `).run(userIp);
      resetRequestLimit(db, userIp);
      return deleted;
    })();

    console.log(`[Jukebox Users] Cleared ${result.changes} requests for IP: ${anonymizeIP(userIp)}`);

    return NextResponse.json({
      success: true,
      message: `Cleared ${result.changes} request${result.changes !== 1 ? 's' : ''} for this user`,
      cleared: result.changes
    });

  } catch (error) {
    console.error('[Jukebox Users] Error clearing rate limit:', error);
    return NextResponse.json({ 
      error: 'Failed to clear rate limit' 
    }, { status: 500 });
  }
}
