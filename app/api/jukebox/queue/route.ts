import { NextRequest, NextResponse } from 'next/server';
import { addToQueue, getQueue, incrementSequenceRequests, getMediaNameForSequence } from '@/lib/database';
import { addToQueueTransactional } from '@/lib/jukebox-queue';
import { getClientIP, getSongRequestRateLimit } from '@/lib/rate-limit';
import { getUtcNow, getUtcOffset, getUtcSqlTimestampOffset } from '@/lib/time-utils';
import { debugLog } from '@/lib/logging';
import db from '@/lib/database';
import { getFppUrl } from '@/lib/fpp-config';
import { getDistanceInMiles } from '@/lib/location-utils';
import { toPublicQueueItem } from '@/lib/jukebox-display';

export async function GET() {
  try {
    // Public endpoint: never expose requester IPs or locations
    const queue = (getQueue.all() as Parameters<typeof toPublicQueueItem>[0][]).map(toPublicQueueItem);
    return NextResponse.json(queue);
  } catch (error) {
    console.error('Error fetching queue:', error);
    return NextResponse.json({ error: 'Failed to fetch queue' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sequence_name, requester_name, userLocation } = body;
    const requester_ip = getClientIP(request);

    // Get current rate limit from settings
    const rateLimit = getSongRequestRateLimit();

    // SECURITY: Validate sequence_name input
    if (!sequence_name) {
      return NextResponse.json({ error: 'Sequence name is required' }, { status: 400 });
    }

    if (typeof sequence_name !== 'string') {
      return NextResponse.json({ error: 'Invalid sequence name type' }, { status: 400 });
    }

    if (sequence_name.length < 1 || sequence_name.length > 200) {
      return NextResponse.json({ error: 'Sequence name must be 1-200 characters' }, { status: 400 });
    }

    // Allow alphanumeric, spaces, hyphens, underscores, dots, apostrophes
    // This prevents SQL injection and path traversal attacks
    if (!/^[a-zA-Z0-9_\-. ']+$/.test(sequence_name)) {
      return NextResponse.json({ 
        error: 'Invalid characters in sequence name' 
      }, { status: 400 });
    }

    // SECURITY: Validate requester_name input
    if (requester_name !== undefined && requester_name !== null) {
      if (typeof requester_name !== 'string') {
        return NextResponse.json({ error: 'Invalid requester name type' }, { status: 400 });
      }

      if (requester_name.length > 100) {
        return NextResponse.json({ error: 'Requester name must be under 100 characters' }, { status: 400 });
      }

      // Allow alphanumeric, spaces, and common name characters
      if (requester_name.length > 0 && !/^[a-zA-Z0-9_\-. ']+$/.test(requester_name)) {
        return NextResponse.json({ 
          error: 'Invalid characters in requester name' 
        }, { status: 400 });
      }
    }

    // Check location restrictions if user provided GPS location
    let distanceFromShow = null;
    let locationBlocked = false;
    let locationDetails = {
      latitude: null as number | null,
      longitude: null as number | null,
      accuracy: null as number | null,
      source: null as string | null
    };

    try {
      // Check if location restrictions are enabled
      const restrictions = db.prepare(`
        SELECT is_active, max_distance_miles, show_latitude, show_longitude
        FROM location_restrictions WHERE id = 1
      `).get() as any;
      
      if (restrictions?.is_active && restrictions.show_latitude && restrictions.show_longitude) {
        // Require GPS location from client
        if (!userLocation || !userLocation.lat || !userLocation.lng) {
          return NextResponse.json({
            error: 'Location access required. Please enable location permissions in your browser to request songs.',
            requiresLocation: true
          }, { status: 403 });
        }

        // Store user's GPS location
        locationDetails = {
          latitude: userLocation.lat,
          longitude: userLocation.lng,
          accuracy: userLocation.accuracy || null,
          source: userLocation.source || 'gps'
        };

        // Calculate distance using accurate GPS coordinates
        distanceFromShow = getDistanceInMiles(
          userLocation.lat,
          userLocation.lng,
          restrictions.show_latitude,
          restrictions.show_longitude
        );
        
        if (distanceFromShow > restrictions.max_distance_miles) {
          locationBlocked = true;
          console.log(`[Security] Request blocked - User is ${distanceFromShow.toFixed(2)} miles away (limit: ${restrictions.max_distance_miles})`);
          
          return NextResponse.json({
            error: `You must be within ${restrictions.max_distance_miles} mile(s) of the light show to request songs. You are ${distanceFromShow.toFixed(1)} miles away.`,
            distanceMiles: distanceFromShow,
            maxDistance: restrictions.max_distance_miles,
            accuracy: userLocation.accuracy ? `±${Math.round(userLocation.accuracy)}m` : undefined
          }, { status: 403 });
        }
      }
    } catch (geoError) {
      console.warn('[Geo] Location check failed:', geoError);
      // Allow request if geolocation check fails (don't punish users for technical issues)
    }

    

    // Add .fseq extension back to get the full sequence name
    const fullSequenceName = sequence_name + '.fseq';

    // Look up the media name from FPP playlists
    let media_name = null;
    try {
      // Get scheduled playlists
      const scheduleResponse = await fetch(`${getFppUrl()}/api/schedule`);
      if (scheduleResponse.ok) {
        const schedule = await scheduleResponse.json();
        const playlistNames = new Set<string>();
        schedule.forEach((entry: any) => {
          if (entry.playlist) {
            playlistNames.add(entry.playlist);
          }
        });

        // Check each playlist for the sequence
        for (const playlistName of playlistNames) {
          try {
            const playlistResponse = await fetch(`${getFppUrl()}/api/playlist/${encodeURIComponent(playlistName)}`);
            if (playlistResponse.ok) {
              const playlist = await playlistResponse.json();
              
              // Check leadIn
              if (playlist.leadIn) {
                const item = playlist.leadIn.find((item: any) => item.sequenceName === fullSequenceName);
                if (item && item.mediaName) {
                  media_name = item.mediaName;
                  break;
                }
              }
              
              // Check mainPlaylist
              if (playlist.mainPlaylist) {
                const item = playlist.mainPlaylist.find((item: any) => item.sequenceName === fullSequenceName);
                if (item && item.mediaName) {
                  media_name = item.mediaName;
                  break;
                }
              }
            }
          } catch (err) {
            // Continue checking other playlists
          }
        }
      }
    } catch (error) {
      console.warn('Could not lookup media name from FPP:', error);
    }

    // Track sequence requests
    
    // Now add to jukebox queue with a transactional check for rate limit and duplicates
    let transactionResult;
    try {
      transactionResult = addToQueueTransactional(db, {
        sequence_name,
        media_name,
        requester_name: requester_name || 'Anonymous',
        requester_ip,
        rateLimit,
        latitude: locationDetails.latitude,
        longitude: locationDetails.longitude,
        city: null,
        region: null,
        countryCode: null,
        distanceFromShow: distanceFromShow
      });
    } catch (txError: any) {
      if (txError.code === 'RATE_LIMIT_EXCEEDED') {
        const used = txError.requestsUsed || rateLimit;
        console.warn(`[SECURITY] Rate limit exceeded for ${requester_ip} (${used}/${rateLimit} used)`);
        return NextResponse.json({ 
          error: `Rate limit exceeded. You can request ${rateLimit} songs per hour.`,
          rateLimit,
          requestsUsed: used,
          requestsRemaining: 0
        }, { status: 429 });
      }
      if (txError.code === 'DUPLICATE_REQUEST') {
        console.warn(`[SECURITY] Duplicate request detected from ${requester_ip} for ${sequence_name}`);
        return NextResponse.json({ 
          error: 'You already requested this song recently. Please wait a few minutes.' 
        }, { status: 429 });
      }
      throw txError; // let outer catch handle other errors
    }

    incrementSequenceRequests.run(sequence_name);
    const result = { lastInsertRowid: transactionResult.id } as any;

    // Calculate how many requests the user has used in the last hour
    const now = getUtcNow();
    const oneHourAgo = getUtcOffset(1, 'hours');
    
    debugLog(`[Queue DEBUG] Request just added - ID: ${result.lastInsertRowid}`);
    debugLog(`[Queue DEBUG] Current time (UTC): ${now}`);
    debugLog(`[Queue DEBUG] One hour ago (UTC): ${oneHourAgo}`);
    
    // Get all recent entries to see what's being counted
    const recentEntries = db.prepare(`
      SELECT id, sequence_name, created_at, status
      FROM jukebox_queue 
      WHERE requester_ip = ? 
        AND created_at >= datetime('now', '-1 hour')
      ORDER BY created_at DESC
    `).all(requester_ip);
    
    debugLog(`[Queue DEBUG] Entries in last hour for IP ${requester_ip}:`);
    recentEntries.forEach((entry: any) => {
      debugLog(`  ID ${entry.id}: ${entry.sequence_name} | ${entry.created_at} | ${entry.status}`);
    });
    
    const oneHourAgoForSql = getUtcSqlTimestampOffset(1, 'hours');
    const usedRequests = db.prepare(`
      SELECT COUNT(*) as count 
      FROM jukebox_queue 
      WHERE requester_ip = ? 
        AND created_at >= ?
    `).get(requester_ip, oneHourAgoForSql) as { count: number };

    const requestsUsed = usedRequests.count;
    const requestsRemaining = Math.max(0, rateLimit - requestsUsed);

    debugLog(`[Queue POST - AFTER INSERT] IP: ${requester_ip} | Rate Limit: ${rateLimit} | Used: ${requestsUsed} | Remaining: ${requestsRemaining}`);

    return NextResponse.json({ 
      success: true, 
      id: result.lastInsertRowid,
      message: requestsRemaining > 0 
        ? `Song requested! You have ${requestsRemaining} request${requestsRemaining !== 1 ? 's' : ''} remaining this hour.`
        : `Song requested! You've used all ${rateLimit} requests this hour.`,
      rateLimit,
      requestsUsed,
      requestsRemaining
    });
  } catch (error: any) {
    console.error('Error adding to queue:', error);
    
    // Handle duplicate entries or other constraints
    if (error.code === 'SQLITE_CONSTRAINT') {
      return NextResponse.json({ error: 'Unable to add sequence to queue' }, { status: 400 });
    }
    
    return NextResponse.json({ error: 'Failed to add to queue' }, { status: 500 });
  }
}
