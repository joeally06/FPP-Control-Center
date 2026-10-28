import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';
import { getClientIP } from '@/lib/rate-limit';
import { createFixedWindowLimiter } from '@/lib/fixed-window-limiter';
import { checkAgainstShow, parseUserCoordinates, type ShowRestrictions } from '@/lib/location-check';

// A phone sends its position when it changes, so a minute allows plenty
const limiter = createFixedWindowLimiter({ windowMs: 60_000, max: 30 });

/**
 * POST /api/location-restrictions/check
 * Body: { lat, lng } - the visitor's position.
 * PUBLIC. Replies whether the visitor is in range of the show and about how far away they are
 * (to 0.1 mile). The show's own coordinates never leave the server.
 */
export async function POST(request: NextRequest) {
  try {
    if (!limiter.allow(getClientIP(request))) {
      return NextResponse.json({ error: 'Too many location checks. Please wait a moment.' }, { status: 429 });
    }

    const coords = parseUserCoordinates(await request.json().catch(() => null));
    if (!coords) {
      return NextResponse.json({ error: 'A valid latitude and longitude are required' }, { status: 400 });
    }

    const restrictions = getDb().prepare(`
      SELECT is_active, max_distance_miles, show_latitude, show_longitude
      FROM location_restrictions WHERE id = 1
    `).get() as ShowRestrictions | undefined;

    return NextResponse.json(checkAgainstShow(coords, restrictions));
  } catch (error) {
    console.error('[Location API] check error:', error);
    return NextResponse.json({ error: 'Failed to check location' }, { status: 500 });
  }
}
