import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/database';
import { getSongArt } from '@/lib/song-art';

/**
 * GET /api/jukebox/song-art/[id]
 * A picture the admin uploaded for a song in a playlist. PUBLIC - read-only; the bytes were re-encoded to WebP on upload.
 * A replaced picture gets a new id, so one address never changes content and can be cached for good.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,9}$/.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const art = getSongArt(db, Number(id));
  if (!art) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return new NextResponse(new Uint8Array(art.data), {
    headers: {
      'Content-Type': art.mimeType,
      'Content-Length': String(art.data.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
