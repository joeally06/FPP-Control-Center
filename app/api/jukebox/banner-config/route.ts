import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import { getSetting, updateSettings } from '@/lib/settings';
import {
  OFF_SEASON_BANNER_DEFAULTS,
  OFF_SEASON_BANNER_KEYS,
  parseOffSeasonBanner,
  readOffSeasonBanner,
} from '@/lib/jukebox-display';

/**
 * GET /api/jukebox/banner-config
 * The off-season message shown under the logo (Public - needed for jukebox page)
 */
export async function GET() {
  try {
    return NextResponse.json(readOffSeasonBanner(getSetting));
  } catch (error) {
    console.error('[Banner Config] Error fetching:', error);
    return NextResponse.json(OFF_SEASON_BANNER_DEFAULTS);
  }
}

/**
 * POST /api/jukebox/banner-config
 * Update the off-season message (Admin only)
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
  }

  let banner;
  try {
    banner = parseOffSeasonBanner(await request.json());
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Invalid banner settings') }, { status: 400 });
  }

  try {
    updateSettings({
      [OFF_SEASON_BANNER_KEYS.enabled]: banner.enabled ? '1' : '0',
      [OFF_SEASON_BANNER_KEYS.heading]: banner.heading,
      [OFF_SEASON_BANNER_KEYS.subtitle]: banner.subtitle,
    });
    return NextResponse.json({ success: true, ...banner });
  } catch (error) {
    console.error('[Banner Config] Error updating:', error);
    return NextResponse.json({ error: 'Failed to update banner config' }, { status: 500 });
  }
}
