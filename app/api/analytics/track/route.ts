import { NextRequest, NextResponse } from 'next/server';
import { anonymizeIP, getClientIP, getGeolocation, isLocalAddress } from '@/lib/visitor-tracking';
import { getDb } from '@/lib/database';
import { createFixedWindowLimiter } from '@/lib/fixed-window-limiter';
import { recordTrackEvent, type TrackBody } from '@/lib/analytics-tracking';

// A visitor sends a handful of events per page; these only stop a script flooding the tables
const requestLimiter = createFixedWindowLimiter({ windowMs: 60_000, max: 60 });
const visitLimiter = createFixedWindowLimiter({ windowMs: 60_000, max: 10 });
// ip-api.com's free tier allows 45 a minute; stay under it however many addresses are sending
const geolocationLimiter = createFixedWindowLimiter({ windowMs: 60_000, max: 30 });

/**
 * POST /api/analytics/track
 * Body: { action: 'visit' | 'pageview' | 'end', page?, sessionId? }
 * PUBLIC, rate limited per IP. A session can only be changed by the visitor it was created for.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    if (!requestLimiter.allow(ip)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    if ((body as TrackBody).action === 'visit' && !visitLimiter.allow(ip)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const result = await recordTrackEvent(getDb(), body as TrackBody, {
      visitorHash: anonymizeIP(ip),
      userAgent: request.headers.get('user-agent') || 'Unknown',
      // A local address is answered without a network call, so it doesn't use up the budget
      lookupGeo: () => isLocalAddress(ip) || geolocationLimiter.allow('all')
        ? getGeolocation(ip)
        : Promise.resolve({ city: null, region: null, country: null }),
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Visitor tracking error:', error);
    return NextResponse.json(
      { error: 'Failed to track visitor' },
      { status: 500 }
    );
  }
}
