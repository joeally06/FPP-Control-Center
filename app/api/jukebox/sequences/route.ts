import { NextResponse } from 'next/server';
import db, { getActiveTheme, getCachedSongDetails, getCacheAge } from '@/lib/database';
import type { CatalogSong } from '@/lib/jukebox-display';
import { activePlaylistNames, listPlaylistSongOverrides, listThemeSongs, type ThemeSongs } from '@/lib/jukebox-playlists';
import { normalizeThemeId } from '@/lib/themes/theme-config';

interface CachedSongRow {
  sequence_name: string;
  track_name: string | null;
  artist_name: string | null;
  duration_seconds: number | null;
  category: string | null;
}

// The offered playlists holding a song, and where it sits in each
function songPlaylistFields(themeSongs: ThemeSongs, sequenceName: string): Pick<CatalogSong, 'playlists' | 'playlistPositions'> {
  const playlists = themeSongs.songs.get(sequenceName) ?? [];
  return {
    playlists,
    playlistPositions: playlists.map((name) => themeSongs.order.get(name)?.indexOf(sequenceName) ?? 0),
  };
}

export async function GET() {
  try {
    const themeId = normalizeThemeId((getActiveTheme.get() as { active_theme_id?: string } | undefined)?.active_theme_id);
    const themeSongs = listThemeSongs(db, themeId, activePlaylistNames(db));

    // While the theme has tagged playlists, only their songs; otherwise every synced song
    const songs: CatalogSong[] = (getCachedSongDetails.all() as CachedSongRow[])
      .filter((row) => !themeSongs.restricted || themeSongs.songs.has(row.sequence_name))
      .map((row) => ({
        name: row.sequence_name,
        title: row.track_name || null,
        artist: row.artist_name || null,
        durationSeconds: row.duration_seconds ?? null,
        category: row.category || null,
        ...(themeSongs.restricted ? songPlaylistFields(themeSongs, row.sequence_name) : {}),
      }));
    // Titles and artists the admin set for a song in one playlist
    const overrides = listPlaylistSongOverrides(db, themeSongs.playlists);
    for (const song of songs) {
      const byPlaylist = Object.fromEntries((song.playlists ?? []).flatMap((playlist) => {
        const own = overrides.get(playlist)?.get(song.name);
        return own ? [[playlist, own] as const] : [];
      }));
      if (Object.keys(byPlaylist).length > 0) song.byPlaylist = byPlaylist;
    }
    const sequences = songs.map((song) => song.name);
    // A playlist just added to FPP's Scheduler has no synced songs until the admin syncs: no chip for it yet
    const playlists = themeSongs.playlists.filter((name) => songs.some((song) => song.playlists?.includes(name)));
    const cacheInfo = getCacheAge.get() as { last_updated?: string } | undefined;

    return NextResponse.json({
      sequences,
      songs,
      // Offered playlists (names), empty when every song is offered
      playlists,
      // Tagged playlists exist but none is scheduled right now
      closed: themeSongs.restricted && themeSongs.playlists.length === 0,
      lastUpdated: cacheInfo?.last_updated || null,
      count: sequences.length
    });
  } catch (error) {
    console.error('Error fetching cached sequences:', error);
    return NextResponse.json({ error: 'Failed to fetch cached sequences' }, { status: 500 });
  }
}
