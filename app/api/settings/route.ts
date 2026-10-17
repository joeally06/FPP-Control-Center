import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import { getSettings, getSettingsDetailed, updateSettings } from '@/lib/settings';
import { VISITOR_BOOLEAN_SETTINGS, VISITOR_SETTING_LIMITS } from '@/lib/jukebox-display';
import { parseSantaDailyCap, SANTA_DAILY_CAP_MAX } from '@/lib/santa-confirmation';

/**
 * GET /api/settings
 * Get all settings or filter by category
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const detailed = searchParams.get('detailed') === 'true';

    if (detailed) {
      const settings = getSettingsDetailed(category || undefined);
      return NextResponse.json({ settings });
    } else {
      const settings = getSettings(category || undefined);
      return NextResponse.json({ settings });
    }
  } catch (error) {
    console.error('Error in GET /api/settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings
 * Update multiple settings at once
 */
export async function PUT(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { settings } = body;

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json(
        { error: 'Invalid settings format' },
        { status: 400 }
      );
    }

    // Validate settings - all values must be strings
    for (const [key, value] of Object.entries(settings)) {
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        return NextResponse.json(
          { error: `Invalid value type for ${key}` },
          { status: 400 }
        );
      }
    }

    // Validate jukebox-specific settings
    if ('jukebox_rate_limit' in settings) {
      const rateLimit = parseInt(String(settings.jukebox_rate_limit), 10);
      if (isNaN(rateLimit) || rateLimit < 1 || rateLimit > 10) {
        return NextResponse.json(
          { error: 'jukebox_rate_limit must be between 1 and 10' },
          { status: 400 }
        );
      }
    }

    if ('jukebox_insert_mode' in settings) {
      const validModes = ['interrupt', 'after_current', 'end_of_playlist'];
      const mode = String(settings.jukebox_insert_mode);
      if (!validModes.includes(mode)) {
        return NextResponse.json(
          { error: `jukebox_insert_mode must be one of: ${validModes.join(', ')}` },
          { status: 400 }
        );
      }
    }

    if ('santa_daily_cap' in settings && parseSantaDailyCap(String(settings.santa_daily_cap)) === null) {
      return NextResponse.json(
        { error: `santa_daily_cap must be a whole number from 1 to ${SANTA_DAILY_CAP_MAX}` },
        { status: 400 }
      );
    }

    // Validate visitor-page display settings
    for (const [key, max] of Object.entries(VISITOR_SETTING_LIMITS)) {
      if (key in settings && String(settings[key]).length > max) {
        return NextResponse.json(
          { error: `${key} must be at most ${max} characters` },
          { status: 400 }
        );
      }
    }

    for (const key of VISITOR_BOOLEAN_SETTINGS) {
      if (key in settings && !['true', 'false'].includes(String(settings[key]))) {
        return NextResponse.json(
          { error: `${key} must be true or false` },
          { status: 400 }
        );
      }
    }

    // Convert all values to strings
    const stringSettings: Record<string, string> = {};
    for (const [key, value] of Object.entries(settings)) {
      stringSettings[key] = String(value);
    }

    // Update settings
    updateSettings(stringSettings);

    return NextResponse.json({ 
      success: true,
      message: 'Settings updated successfully'
    });
  } catch (error) {
    console.error('Error in PUT /api/settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
