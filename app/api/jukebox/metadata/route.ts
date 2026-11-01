import { NextRequest, NextResponse } from 'next/server';
import SpotifyWebApi from 'spotify-web-api-node';
import db, { getSequenceMetadata, upsertSequenceMetadata, getMediaLibraryMetadata, type MediaLibraryMetadataRow, type SequenceMetadataRow } from '@/lib/database';
import { playlistSongDetails, songNameKeys } from '@/lib/jukebox-songs';

// Initialize Spotify API
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

// Get access token
async function getSpotifyAccessToken() {
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body['access_token']);
    return true;
  } catch (error) {
    console.error('Failed to get Spotify access token:', error);
    return false;
  }
}

// Clean sequence name for search (remove file extensions, clean up formatting)
function cleanSequenceName(sequenceName: string): string {
  return sequenceName
    .replace(/\.(fseq|mp3|wav)$/i, '') // Remove file extensions
    .replace(/[-_]/g, ' ') // Replace dashes/underscores with spaces
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
}

// Extract potential song info from sequence name
function parseSequenceName(sequenceName: string) {
  const cleaned = cleanSequenceName(sequenceName);

  // Try to extract artist and song title
  // Common patterns: "Artist - Song Title", "Song Title by Artist", etc.
  const patterns = [
    /^(.+?)\s*-\s*(.+)$/i, // Artist - Song
    /^(.+?)\s+by\s+(.+)$/i, // Song by Artist
    /^(.+?)\s*\|\s*(.+)$/i, // Song | Artist
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      return {
        artist: match[1].trim(),
        song: match[2].trim()
      };
    }
  }

  // If no pattern matches, treat whole thing as song title
  return {
    artist: '',
    song: cleaned
  };
}

/**
 * GET /api/jukebox/metadata?sequence=…[&media=…][&playlist=…&song=…]
 * Title, artist, album and cover for a song. With `playlist`, what that playlist set for the song replaces the
 * song's default details, field by field; `song` is the FPP sequence name the playlist knows the song by
 * (only used to find the playlist's entry, `sequence` stays the default lookup). PUBLIC - read-only.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const response = await lookupMetadata(searchParams.get('sequence'), searchParams.get('media'));

  const playlist = searchParams.get('playlist');
  if (!playlist || playlist.length > 255 || !response.ok) return response;

  try {
    // A playlist keys its songs by sequence name, which can differ from the audio file name `sequence` may carry
    const own = playlistSongDetails(db, playlist, songNameKeys(searchParams.get('song'), searchParams.get('sequence'), searchParams.get('media')));
    if (!own) return response;
    const metadata = await response.json();
    return NextResponse.json({
      ...metadata,
      song_title: own.title ?? metadata.song_title,
      artist: own.artist ?? metadata.artist,
      album: own.album ?? metadata.album,
      album_cover_url: own.albumArt ?? metadata.album_cover_url,
    });
  } catch (error) {
    console.error('Error applying playlist song details:', error);
    return response;
  }
}

async function lookupMetadata(sequenceName: string | null, mediaName: string | null): Promise<NextResponse> {
  // Use media name if provided, otherwise fall back to sequence name
  const lookupName = mediaName || sequenceName;
  const storageKey = sequenceName || mediaName; // Use sequence name as storage key for backward compatibility

  if (!lookupName) {
    return NextResponse.json({ error: 'Sequence name or media name is required' }, { status: 400 });
  }

  try {
    // PRIORITY 1: Check Media Library for user-customized metadata
    // Try exact match first, then try without file extension
    if (storageKey) {
      let mediaLibraryData = getMediaLibraryMetadata.get(storageKey) as MediaLibraryMetadataRow | undefined;
      
      // If not found and storageKey has extension, try without extension
      if (!mediaLibraryData) {
        const nameWithoutExt = storageKey.replace(/\.(fseq|mp3|wav)$/i, '');
        if (nameWithoutExt !== storageKey) {
          mediaLibraryData = getMediaLibraryMetadata.get(nameWithoutExt) as MediaLibraryMetadataRow | undefined;
        }
      }
      
      if (mediaLibraryData && mediaLibraryData.track_name) {
        // Return Media Library metadata (respects user customizations)
        return NextResponse.json({
          sequence_name: storageKey,
          song_title: mediaLibraryData.track_name,
          artist: mediaLibraryData.artist_name || 'Unknown',
          album: mediaLibraryData.album_name || 'Unknown',
          release_year: null, // Media Library doesn't store this
          album_cover_url: mediaLibraryData.album_art_url,
          spotify_id: mediaLibraryData.spotify_track_id,
          spotify_url: mediaLibraryData.spotify_url || null, // Add Spotify external URL
          cached: true,
          source: 'media_library'
        });
      }
    }

    // PRIORITY 2: Check if we already have metadata cached in sequence_metadata
    const cached = getSequenceMetadata.get(storageKey) as SequenceMetadataRow | undefined;
    if (cached && cached.song_title) {
      return NextResponse.json({
        sequence_name: storageKey,
        ...cached
      });
    }

    // Get Spotify access token
    const hasToken = await getSpotifyAccessToken();
    if (!hasToken) {
      return NextResponse.json({
        sequence_name: storageKey,
        song_title: cleanSequenceName(lookupName),
        artist: 'Unknown',
        album: 'Unknown',
        release_year: null,
        album_cover_url: null,
        spotify_id: null,
        spotify_url: null, // No Spotify URL without token
        cached: false
      });
    }

    // Parse sequence name to extract artist and song
    const { artist, song } = parseSequenceName(lookupName);

    // Search Spotify
    let searchQuery = song;
    if (artist) {
      searchQuery = `${artist} ${song}`;
    }

    const searchResults = await spotifyApi.searchTracks(searchQuery, { limit: 1 });

    if (searchResults.body.tracks?.items && searchResults.body.tracks.items.length > 0) {
      const track = searchResults.body.tracks.items[0];
      const album = track.album;
      const releaseYear = album.release_date ? new Date(album.release_date).getFullYear() : null;
      const albumCover = album.images.length > 0 ? album.images[0].url : null;
      const spotifyUrl = track.external_urls?.spotify || null; // Get Spotify web URL

      const metadata = {
        sequence_name: storageKey,
        song_title: track.name,
        artist: track.artists.map((a) => a.name).join(', '),
        album: album.name,
        release_year: releaseYear,
        album_cover_url: albumCover,
        spotify_id: track.id,
        spotify_url: spotifyUrl, // Include Spotify URL in response
        cached: true
      };

      // Cache the metadata with Spotify URL
      upsertSequenceMetadata.run(
        storageKey,
        track.name,
        track.artists.map(a => a.name).join(', '),
        album.name,
        releaseYear,
        albumCover,
        track.id,
        spotifyUrl // Store Spotify URL in database
      );

      return NextResponse.json(metadata);
    } else {
      // No results found, cache empty result to avoid repeated searches
      const fallbackMetadata = {
        sequence_name: storageKey,
        song_title: cleanSequenceName(lookupName),
        artist: artist || 'Unknown',
        album: 'Unknown',
        release_year: null,
        album_cover_url: null,
        spotify_id: null,
        spotify_url: null, // No Spotify URL available
        cached: false
      };

      upsertSequenceMetadata.run(
        storageKey,
        fallbackMetadata.song_title,
        fallbackMetadata.artist,
        fallbackMetadata.album,
        fallbackMetadata.release_year,
        fallbackMetadata.album_cover_url,
        fallbackMetadata.spotify_id,
        fallbackMetadata.spotify_url // Store null for Spotify URL
      );

      return NextResponse.json(fallbackMetadata);
    }
  } catch (error) {
    console.error('Error fetching metadata:', error);

    // Return fallback metadata
    const fallbackMetadata = {
      sequence_name: storageKey,
      song_title: cleanSequenceName(lookupName),
      artist: 'Unknown',
      album: 'Unknown',
      release_year: null,
      album_cover_url: null,
      spotify_id: null,
      spotify_url: null, // No Spotify URL on error
      cached: false,
      error: 'Failed to fetch metadata'
    };

    return NextResponse.json(fallbackMetadata);
  }
}
