import { NextResponse } from 'next/server';
import { getCachedSongDetails, getCacheAge } from '@/lib/database';
import type { CatalogSong } from '@/lib/jukebox-display';

interface CachedSongRow {
  sequence_name: string;
  track_name: string | null;
  artist_name: string | null;
  duration_seconds: number | null;
  category: string | null;
}

export async function GET() {
  try {
    const songs: CatalogSong[] = (getCachedSongDetails.all() as CachedSongRow[]).map((row) => ({
      name: row.sequence_name,
      title: row.track_name || null,
      artist: row.artist_name || null,
      durationSeconds: row.duration_seconds ?? null,
      category: row.category || null,
    }));
    const sequences = songs.map((song) => song.name);
    const cacheInfo = getCacheAge.get() as { last_updated?: string } | undefined;

    return NextResponse.json({
      sequences,
      songs,
      lastUpdated: cacheInfo?.last_updated || null,
      count: sequences.length
    });
  } catch (error) {
    console.error('Error fetching cached sequences:', error);
    return NextResponse.json({ error: 'Failed to fetch cached sequences' }, { status: 500 });
  }
}
