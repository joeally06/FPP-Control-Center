/**
 * Secure Backend API: Now Playing
 * 
 * Returns current FPP status from database cache (populated by fpp-poller).
 * 
 * SECURITY FEATURES:
 * - No direct FPP access from browser (eliminates network exposure)
 * - Read-only database access
 * - Cache age validation
 * - Public endpoint (no auth) - read-only display data
 * - Rate limiting applied by middleware
 * 
 * CACHE STRATEGY:
 * - fpp-poller updates cache every 10 seconds
 * - Frontend reads from cache (never hits FPP directly)
 * - Warns if cache is stale (>60 seconds)
 * 
 * @route GET /api/jukebox/now-playing
 */

import { NextResponse } from 'next/server';
import { getReadOnlyDb } from '@/lib/database';

// Read-only connection, shared with the other public read-only routes
type Db = ReturnType<typeof getReadOnlyDb>;

function getDatabase(): Db {
  return getReadOnlyDb();
}

// Prepared statement for fetching latest FPP status
const getLatestStatusStmt = (db: Db) => db.prepare(`
  SELECT 
    status_name,
    current_playlist,
    current_sequence,
    seconds_played,
    seconds_remaining,
    time_elapsed,
    time_remaining,
    volume,
    mode_name,
    scheduler_status,
    next_playlist,
    updated_at,
    created_at
  FROM fpp_status_cache
  ORDER BY updated_at DESC
  LIMIT 1
`);

/**
 * GET /api/jukebox/now-playing
 * Returns current FPP status from cache
 */
export async function GET() {
  try {
    const database = getDatabase();
    const stmt = getLatestStatusStmt(database);
    const status = stmt.get() as any;

    // No cached status available
    if (!status) {
      return NextResponse.json({
        success: false,
        error: 'No FPP status available',
        message: 'FPP poller may not be running or has not completed first poll',
        status: null,
        cacheAge: null,
        isStale: true
      }, { status: 503 });
    }

    // Calculate cache age
    const updatedAt = new Date(status.updated_at);
    const now = new Date();
    const cacheAgeMs = now.getTime() - updatedAt.getTime();
    const cacheAgeSec = Math.floor(cacheAgeMs / 1000);

    // Warn if cache is stale (>60 seconds = 6+ missed polls)
    const isStale = cacheAgeSec > 60;
    const staleSeverity = cacheAgeSec > 300 ? 'critical' : cacheAgeSec > 120 ? 'warning' : 'normal';

    // Prepare response
    const response = {
      success: true,
      status: {
        statusName: status.status_name,
        currentPlaylist: status.current_playlist,
        currentSequence: status.current_sequence,
        currentSong: status.current_sequence, // Alias for clarity
        secondsPlayed: status.seconds_played,
        secondsRemaining: status.seconds_remaining,
        timeElapsed: status.time_elapsed,
        timeRemaining: status.time_remaining,
        volume: status.volume,
        mode: status.mode_name,
        schedulerStatus: status.scheduler_status,
        nextPlaylist: status.next_playlist,
      },
      cache: {
        age: cacheAgeSec,
        ageHuman: formatCacheAge(cacheAgeSec),
        updatedAt: status.updated_at,
        isStale,
        staleSeverity,
        pollInterval: 10 // seconds
      }
    };

    // Add warning header if stale
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate' // Don't cache API response
    };

    if (isStale) {
      headers['X-Cache-Warning'] = `Cache is ${cacheAgeSec}s old`;
    }

    return NextResponse.json(response, { 
      status: 200,
      headers 
    });

  } catch (error: any) {
    console.error('[API] /api/jukebox/now-playing error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch FPP status from cache',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}

/**
 * Format cache age into human-readable string
 */
function formatCacheAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/**
 * HEAD /api/jukebox/now-playing
 * Quick health check (doesn't return body)
 */
export async function HEAD() {
  try {
    const database = getDatabase();
    const stmt = getLatestStatusStmt(database);
    const status = stmt.get() as any;

    if (!status) {
      return new NextResponse(null, { status: 503 });
    }

    const updatedAt = new Date(status.updated_at);
    const cacheAgeSec = Math.floor((Date.now() - updatedAt.getTime()) / 1000);
    const isStale = cacheAgeSec > 60;

    return new NextResponse(null, {
      status: 200,
      headers: {
        'X-Cache-Age': String(cacheAgeSec),
        'X-Cache-Stale': String(isStale)
      }
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
