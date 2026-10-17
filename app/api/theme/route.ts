import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import db, { getActiveTheme, setActiveTheme } from '@/lib/database';
import { isThemeId, normalizeThemeId } from '@/lib/themes/theme-config';
import { listThemeAssets } from '@/lib/theme-assets';

// GET /api/theme - Active theme plus what has been uploaded for each theme (public)
export async function GET() {
  try {
    const result = getActiveTheme.get() as { active_theme_id: string } | undefined;
    return NextResponse.json({ themeId: normalizeThemeId(result?.active_theme_id), assets: listThemeAssets(db) });
  } catch (error) {
    console.error('Error fetching theme:', error);
    return NextResponse.json({ themeId: normalizeThemeId(null), assets: null });
  }
}

// POST /api/theme - Set the active theme (admin only)
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
  }

  try {
    const { themeId } = await request.json();
    if (!isThemeId(themeId)) {
      return NextResponse.json({ error: 'Unknown theme' }, { status: 400 });
    }

    setActiveTheme.run(themeId);
    return NextResponse.json({ success: true, themeId });
  } catch (error) {
    console.error('Error setting theme:', error);
    return NextResponse.json({ error: 'Failed to set theme' }, { status: 500 });
  }
}
