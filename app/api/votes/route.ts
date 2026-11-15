import { NextRequest, NextResponse } from 'next/server';
import { getVoteCounts, getUserVote, type VoteCountRow } from '../../../lib/database';
import { authorizeLocation } from '@/lib/location-policy';
import { getClientIP } from '@/lib/rate-limit';
import db from '@/lib/database';

// The columns the request check reads from location_restrictions
interface LocationRestrictionRow {
  is_active: number;
  max_distance_miles: number;
  show_latitude: number | null;
  show_longitude: number | null;
}

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
    
    const ip = getClientIP(request);
    const permission = authorizeLocation(userLocation, () => db.prepare(
      'SELECT is_active, max_distance_miles, show_latitude, show_longitude FROM location_restrictions WHERE id = 1'
    ).get() as LocationRestrictionRow | undefined, 'to vote');
    if (!permission.allowed) return NextResponse.json(permission.body, { status: permission.status });
    const { distanceFromShow, locationDetails } = permission;

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
      const voteCounts = getVoteCounts.all() as VoteCountRow[];
      const countsMap = voteCounts.reduce<Record<string, { upvotes: number; downvotes: number }>>((acc, row) => {
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