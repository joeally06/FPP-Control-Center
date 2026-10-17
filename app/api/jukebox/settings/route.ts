import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/settings';
import { DEFAULT_COURTESY_TEXT, parseCourtesyLines } from '@/lib/jukebox-display';

/**
 * GET /api/jukebox/settings
 * Public endpoint for jukebox configuration (no authentication required)
 * Returns only jukebox-related settings that visitors need to see
 */
export async function GET() {
  try {
    const rateLimit = getSetting('jukebox_rate_limit') || '3';
    const insertMode = getSetting('jukebox_insert_mode') || 'after_current';
    const courtesyEnabled = getSetting('jukebox_courtesy_enabled') === 'true';

    return NextResponse.json({
      rateLimit: parseInt(rateLimit, 10),
      insertMode: insertMode,
      siteName: getSetting('site_name') || '',
      fmFrequency: getSetting('jukebox_fm_frequency') || '',
      courtesy: {
        enabled: courtesyEnabled,
        lines: courtesyEnabled ? parseCourtesyLines(getSetting('jukebox_courtesy_text') || DEFAULT_COURTESY_TEXT) : [],
      },
    });
  } catch (error) {
    console.error('Error fetching jukebox settings:', error);

    // Return defaults on error
    return NextResponse.json({
      rateLimit: 3,
      insertMode: 'after_current',
      siteName: '',
      fmFrequency: '',
      courtesy: { enabled: false, lines: [] },
    });
  }
}
