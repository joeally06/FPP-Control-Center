import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/settings';
import { getClientIP } from '@/lib/rate-limit';
import { recordAudienceVisit } from '@/lib/jukebox-audience';

/**
 * GET /api/jukebox/audience
 * Public. Counts the caller as "online now" and returns how many visitors have the jukebox page open.
 * In-memory only (salted IP hashes, last 60 s) - no database writes. Off unless the admin enables it.
 */
export async function GET(request: NextRequest) {
  try {
    if (getSetting('jukebox_audience_enabled') !== 'true') {
      return NextResponse.json({ enabled: false, count: null });
    }

    return NextResponse.json({ enabled: true, count: recordAudienceVisit(getClientIP(request)) });
  } catch (error) {
    console.error('Error in GET /api/jukebox/audience:', error);
    return NextResponse.json({ enabled: false, count: null });
  }
}
