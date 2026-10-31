import { NextRequest, NextResponse } from 'next/server';
import { getVoteCounts, getUserVote } from '../../../lib/database';
import { getDistanceInMiles } from '@/lib/location-utils';
import { roundMiles } from '@/lib/location-check';
import { getClientIP } from '@/lib/rate-limit';
import db from '@/lib/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sequenceName, voteType, userLocation } = body;

    // SECURITY: Comprehensive input validation
    
    // 1. Validate sequenceName
    if (!sequenceName || typeof sequenceName !== 'string') {
      return NextResponse.json({ error: 'Sequence name is required' }, { status: 400 });
    }
    
    // Length validation (1-200 characters)
    if (sequenceName.length < 1 || sequenceName.length > 200) {
      return NextResponse.json({ 
        error: 'Sequence name must be between 1 and 200 characters' 
      }, { status: 400 });
    }
    
    // Format validation (alphanumeric, spaces, hyphens, underscores, dots, apostrophes)
    if (!/^[a-zA-Z0-9_\-. ']+$/.test(sequenceName)) {
      return NextResponse.json({ 
        error: 'Sequence name contains invalid characters (only alphanumeric, spaces, hyphens, underscores, dots, and apostrophes allowed)' 
      }, { status: 400 });
    }
    
    // 2. Validate voteType (enum validation)
    if (!voteType || !['up', 'down'].includes(voteType)) {
      return NextResponse.json({ 
        error: 'Invalid vote type (must be "up" or "down")' 
      }, { status: 400 });
    }
    
    // 3. Validate userLocation if provided
    if (userLocation) {
      if (typeof userLocation !== 'object') {
        return NextResponse.json({ error: 'Invalid location format' }, { status: 400 });
      }
      
      // Validate latitude (-90 to 90)
      if (userLocation.lat !== undefined && userLocation.lat !== null) {
        if (typeof userLocation.lat !== 'number' || 
            userLocation.lat < -90 || userLocation.lat > 90) {
          return NextResponse.json({ 
            error: 'Invalid latitude (must be between -90 and 90)' 
          }, { status: 400 });
        }
      }
      
      // Validate longitude (-180 to 180)
      if (userLocation.lng !== undefined && userLocation.lng !== null) {
        if (typeof userLocation.lng !== 'number' || 
            userLocation.lng < -180 || userLocation.lng > 180) {
          return NextResponse.json({ 
            error: 'Invalid longitude (must be between -180 and 180)' 
          }, { status: 400 });
        }
      }
      
      // Validate accuracy if provided (positive number, max 100000 meters)
      if (userLocation.accuracy !== undefined && userLocation.accuracy !== null) {
        if (typeof userLocation.accuracy !== 'number' || 
            userLocation.accuracy < 0 || userLocation.accuracy > 100000) {
          return NextResponse.json({ 
            error: 'Invalid location accuracy' 
          }, { status: 400 });
        }
      }
      
      // Validate source if provided (string, max 50 chars)
      if (userLocation.source !== undefined && userLocation.source !== null) {
        if (typeof userLocation.source !== 'string' || 
            userLocation.source.length > 50) {
          return NextResponse.json({ 
            error: 'Invalid location source' 
          }, { status: 400 });
        }
      }
    }

    // Get user IP (shared helper; see server.js)
    const ip = getClientIP(request);

    // Check location restrictions if user provided GPS location
    let distanceFromShow = null;
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
            error: 'Location access required. Please enable location permissions in your browser to vote.',
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
          console.log(`[Security] Vote blocked - User is ${distanceFromShow.toFixed(2)} miles away (limit: ${restrictions.max_distance_miles})`);
          
          return NextResponse.json({
            error: `You must be within ${restrictions.max_distance_miles} mile(s) of the light show to vote. You are ${distanceFromShow.toFixed(1)} miles away.`,
            distanceMiles: roundMiles(distanceFromShow),
            maxDistance: restrictions.max_distance_miles,
            accuracy: userLocation.accuracy ? `±${Math.round(userLocation.accuracy)}m` : undefined
          }, { status: 403 });
        }
      }
    } catch (geoError) {
      console.warn('[Geo] Location check failed for vote:', geoError);
      // Allow vote if geolocation check fails
    }

    // Insert or update vote with location data
    db.prepare(`
      INSERT INTO votes (sequence_name, vote_type, user_ip, latitude, longitude, city, region, country_code, distance_from_show)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sequence_name, user_ip) 
      DO UPDATE SET 
        vote_type = excluded.vote_type,
        created_at = CURRENT_TIMESTAMP,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        city = excluded.city,
        region = excluded.region,
        country_code = excluded.country_code,
        distance_from_show = excluded.distance_from_show
    `).run(
      sequenceName,
      voteType,
      ip,
      locationDetails.latitude,
      locationDetails.longitude,
      null, // city
      null, // region
      null, // country_code
      distanceFromShow
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Vote error:', error);
    return NextResponse.json({ error: 'Failed to save vote' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sequenceName = searchParams.get('sequence');
    const userIp = getClientIP(request);

    if (sequenceName) {
      // SECURITY: Validate sequence name parameter
      if (typeof sequenceName !== 'string' || 
          sequenceName.length < 1 || 
          sequenceName.length > 200 ||
          !/^[a-zA-Z0-9_\-. ']+$/.test(sequenceName)) {
        return NextResponse.json({ 
          error: 'Invalid sequence name' 
        }, { status: 400 });
      }
      
      // Get user's vote for specific sequence
      const userVote = getUserVote.get(sequenceName, userIp) as { vote_type: string } | undefined;
      return NextResponse.json({ userVote: userVote?.vote_type || null });
    } else {
      // Get all vote counts
      const voteCounts = getVoteCounts.all();
      const countsMap = voteCounts.reduce((acc: any, row: any) => {
        acc[row.sequence_name] = {
          upvotes: row.upvotes,
          downvotes: row.downvotes
        };
        return acc;
      }, {});
      return NextResponse.json(countsMap);
    }
  } catch (error) {
    console.error('Get votes error:', error);
    return NextResponse.json({ error: 'Failed to get votes' }, { status: 500 });
  }
}