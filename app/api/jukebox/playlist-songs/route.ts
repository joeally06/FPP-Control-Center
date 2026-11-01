import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import db from '@/lib/database';
import { normalizePlaylistSongDetails, setPlaylistSongDetails } from '@/lib/jukebox-playlists';
import { listPlaylistSongs, readAudioState } from '@/lib/jukebox-songs';

const MAX_NAME_LENGTH = 255;

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_NAME_LENGTH;
}

/**
 * GET /api/jukebox/playlist-songs?playlist=NAME
 * The songs of one playlist in play order, with the playlist's own details laid over the defaults. ADMIN ONLY.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
  }

  try {
    const playlist = new URL(request.url).searchParams.get('playlist');
    if (!isName(playlist)) return NextResponse.json({ error: 'Choose a playlist' }, { status: 400 });
    return NextResponse.json({ playlist, songs: listPlaylistSongs(db, playlist, readAudioState()) });
  } catch (error) {
    console.error('Error in GET /api/jukebox/playlist-songs:', error);
    return NextResponse.json({ error: 'Failed to load the playlist' }, { status: 500 });
  }
}

/**
 * PUT /api/jukebox/playlist-songs
 * Set the details one playlist shows for one song: { playlist, sequence, details: { title, artist, album, albumArt } },
 * or details null to go back to the song's default details. Empty fields fall back to the default. ADMIN ONLY.
 */
export async function PUT(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const { playlist, sequence, details } = body ?? {};
    if (!isName(playlist) || !isName(sequence)) {
      return NextResponse.json({ error: 'playlist and sequence are required' }, { status: 400 });
    }

    let normalized = null;
    if (details !== null) {
      try {
        normalized = normalizePlaylistSongDetails(details);
      } catch (error) {
        return NextResponse.json({ error: toErrorMessage(error, 'Invalid details') }, { status: 400 });
      }
    }

    let saved: boolean;
    try {
      saved = setPlaylistSongDetails(db, playlist, sequence, normalized);
    } catch (error) {
      return NextResponse.json({ error: toErrorMessage(error, 'Could not save the details') }, { status: 400 });
    }
    if (!saved) {
      return NextResponse.json({ error: 'That playlist does not hold that song. Sync from FPP and try again.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in PUT /api/jukebox/playlist-songs:', error);
    return NextResponse.json({ error: 'Failed to save the details' }, { status: 500 });
  }
}
