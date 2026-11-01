import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import db from '@/lib/database';
import { deleteUnusedSongArt } from '@/lib/jukebox-playlists';
import { processSongArt, saveSongArt, SongArtError } from '@/lib/song-art';
import { songArtUrl } from '@/lib/song-art-url';

const MAX_NAME_LENGTH = 255;

/** Thrown inside the upload transaction (rolling it back) when the song left the playlist meanwhile */
class SongGoneError extends Error {}

function name(value: FormDataEntryValue | null): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_NAME_LENGTH ? value : null;
}

/**
 * POST /api/jukebox/song-art
 * Upload a picture for one song in one playlist: multipart form with playlist, sequence and file
 * (JPEG, PNG or WebP up to 5 MB). Becomes that playlist's artwork for the song. ADMIN ONLY.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const playlist = name(form.get('playlist'));
    const sequence = name(form.get('sequence'));
    const file = form.get('file');
    if (!playlist || !sequence) return NextResponse.json({ error: 'Choose a playlist and a song.' }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image to upload.' }, { status: 400 });

    const holds = db.prepare('SELECT 1 FROM jukebox_playlist_songs WHERE playlist_name = ? AND sequence_name = ?').get(playlist, sequence);
    if (!holds) return NextResponse.json({ error: 'That playlist does not hold that song. Sync from FPP and try again.' }, { status: 404 });

    const asset = await processSongArt(Buffer.from(await file.arrayBuffer()));
    const artUrl = db.transaction(() => {
      const id = saveSongArt(db, asset);
      const url = songArtUrl(id);
      const updated = db.prepare('UPDATE jukebox_playlist_songs SET art_url = ?, art_id = ? WHERE playlist_name = ? AND sequence_name = ?')
        .run(url, id, playlist, sequence);
      // A Sync from FPP can remove the song while the image is being processed: undo the new picture
      if (updated.changes === 0) throw new SongGoneError();
      // The picture this one replaced (and any other that is no longer used) goes
      deleteUnusedSongArt(db);
      return url;
    })();

    return NextResponse.json({ success: true, artUrl });
  } catch (error) {
    if (error instanceof SongGoneError) {
      return NextResponse.json({ error: 'That playlist no longer holds that song. Sync from FPP and try again.' }, { status: 404 });
    }
    if (error instanceof SongArtError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error uploading song picture:', error);
    return NextResponse.json({ error: 'Failed to save the picture' }, { status: 500 });
  }
}
