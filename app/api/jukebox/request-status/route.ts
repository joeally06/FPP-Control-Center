import { NextRequest, NextResponse } from 'next/server';
import { getClientIP, getSongRequestRateLimit } from '@/lib/rate-limit';
import { getUtcNow, getUtcOffset } from '@/lib/time-utils';
import { debugLog } from '@/lib/logging';
import db from '@/lib/database';
import { countRecentRequests } from '@/lib/jukebox-queue';

/**
 * GET /api/jukebox/request-status
 * Get the current user's request status (how many used this hour)
 * Public endpoint - no authentication required
 */
export async function GET(request: NextRequest) {
  try {
    const requester_ip = getClientIP(request);
    const rateLimit = getSongRequestRateLimit();

    // Calculate how many requests the user has made in the last hour
    // Database stores in UTC
    const now = getUtcNow();
    const oneHourAgo = getUtcOffset(1, 'hours');
    
    debugLog(`[Request Status DEBUG] Current time (UTC): ${now}`);
    debugLog(`[Request Status DEBUG] One hour ago (UTC): ${oneHourAgo}`);
    
    // Get detailed entries for debugging
    const allEntries = db.prepare(`
      SELECT id, sequence_name, created_at, status
      FROM jukebox_queue 
      WHERE requester_ip = ? 
      ORDER BY created_at DESC
      LIMIT 10
    `).all(requester_ip);
    
    debugLog(`[Request Status DEBUG] Last 10 entries for IP ${requester_ip}:`);
    allEntries.forEach((entry: any) => {
      debugLog(`  ID ${entry.id}: ${entry.sequence_name} | ${entry.created_at} | ${entry.status}`);
    });
    
    // Same rule the rate-limit check uses (last hour, after any admin clear)
    const requestsUsed = countRecentRequests(db, requester_ip);
    const requestsRemaining = Math.max(0, rateLimit - requestsUsed);

    debugLog(`[Request Status POLL] IP: ${requester_ip} | Rate Limit: ${rateLimit} | Used: ${requestsUsed} | Remaining: ${requestsRemaining}`);

    return NextResponse.json({
      success: true,
      rateLimit,
      requestsUsed,
      requestsRemaining
    });
  } catch (error) {
    console.error('Error fetching request status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch request status' },
      { status: 500 }
    );
  }
}
