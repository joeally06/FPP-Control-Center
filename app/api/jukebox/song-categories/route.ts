import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import db, { upsertSongCategory } from '@/lib/database';
import { normalizeCategory } from '@/lib/jukebox-display';

const MAX_SONGS = 500;
const MAX_NAME_LENGTH = 255;

/**
 * PUT /api/jukebox/song-categories
 * Set the visitor-catalog category for songs: { categories: { [sequenceName]: category } }.
 * An empty category clears it. ADMIN ONLY.
 */
export async function PUT(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const categories = body?.categories;

    if (!categories || typeof categories !== 'object' || Array.isArray(categories)) {
      return NextResponse.json({ error: 'categories must be an object of song name → category' }, { status: 400 });
    }

    const entries = Object.entries(categories);
    if (entries.length > MAX_SONGS) {
      return NextResponse.json({ error: `At most ${MAX_SONGS} songs per request` }, { status: 400 });
    }

    const updates: [string, string | null][] = [];
    for (const [name, value] of entries) {
      if (!name || name.length > MAX_NAME_LENGTH) {
        return NextResponse.json({ error: 'Invalid song name' }, { status: 400 });
      }
      try {
        updates.push([name, normalizeCategory(value)]);
      } catch (error) {
        return NextResponse.json({ error: `${name}: ${toErrorMessage(error, 'Invalid category')}` }, { status: 400 });
      }
    }

    db.transaction(() => {
      for (const [name, category] of updates) {
        upsertSongCategory.run(name, category);
      }
    })();

    return NextResponse.json({ success: true, updated: updates.length });
  } catch (error) {
    console.error('Error in PUT /api/jukebox/song-categories:', error);
    return NextResponse.json({ error: 'Failed to save song categories' }, { status: 500 });
  }
}
