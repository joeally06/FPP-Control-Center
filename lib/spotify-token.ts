/**
 * Spotify API Token Management
 * 
 * Handles authentication and token refresh for Spotify API calls.
 * Uses Client Credentials flow for server-to-server authentication.
 */

import { TIMING } from './constants';

let spotifyAccessToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Get a valid Spotify access token
 * Returns cached token if still valid, otherwise requests a new one
 */
export async function getSpotifyToken(): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Spotify credentials not configured. Please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local');
  }

  // Return cached token if still valid (with 1 minute buffer)
  if (spotifyAccessToken && Date.now() < tokenExpiry) {
    return spotifyAccessToken;
  }

  console.log('[Spotify] Requesting new access token...');

  // Request new token using Client Credentials flow
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(TIMING.FETCH_TIMEOUT_LONG) // 10 second timeout to prevent hangs
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get Spotify access token: ${response.status} ${error}`);
  }

  const data = await response.json();
  spotifyAccessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Refresh 1 min early

  console.log('[Spotify] New access token obtained, expires in', data.expires_in, 'seconds');

  return spotifyAccessToken!;
}

/**
 * Clean up sequence name for better Spotify search results
 * Removes file extensions, special characters, and common patterns
 */
export function cleanSequenceName(sequenceName: string): string {
  return sequenceName
    .replace(/\.(fseq|mp3|m4a|wav|flac)$/i, '') // Remove audio/sequence file extensions
    .replace(/[-_]/g, ' ') // Replace hyphens/underscores with spaces
    .replace(/\s+\d{4}$/, '') // Remove year at end (e.g., " 2024")
    .replace(/\s*\(.*?\)\s*/g, ' ') // Remove content in parentheses
    .replace(/\s*\[.*?\]\s*/g, ' ') // Remove content in brackets
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Search Spotify for a track
 * Returns the top result or null if no match found
 */
export async function searchSpotifyTrack(query: string) {
  const token = await getSpotifyToken();

  const cleanQuery = cleanSequenceName(query);
  const encodedQuery = encodeURIComponent(cleanQuery);

  console.log(`[Spotify] Searching for: "${cleanQuery}"`);

  const response = await fetch(
    `https://api.spotify.com/v1/search?q=${encodedQuery}&type=track&limit=1`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      signal: AbortSignal.timeout(TIMING.FETCH_TIMEOUT_LONG) // 10 second timeout
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Spotify search failed: ${response.status} ${error}`);
  }

  const data = await response.json();
  
  if (data.tracks?.items?.length > 0) {
    console.log(`[Spotify] Found match: "${data.tracks.items[0].name}" by ${data.tracks.items[0].artists[0].name}`);
  } else {
    console.log(`[Spotify] No match found for: "${cleanQuery}"`);
  }

  return data;
}

/**
 * Calculate match confidence between sequence name and Spotify result
 * Returns 'high', 'medium', 'low', or 'none'
 */
export function calculateMatchConfidence(
  sequenceName: string,
  trackName: string,
  artistName?: string
): 'high' | 'medium' | 'low' | 'none' {
  if (!trackName) return 'none';

  const seqLower = cleanSequenceName(sequenceName).toLowerCase();
  const trackLower = trackName.toLowerCase();
  const artistLower = artistName?.toLowerCase() || '';

  // Exact match (ignoring case)
  if (seqLower === trackLower) {
    return 'high';
  }

  // Both track and artist appear in sequence name
  if (seqLower.includes(trackLower) && artistLower && seqLower.includes(artistLower)) {
    return 'high';
  }

  // Track name is contained in sequence name
  if (seqLower.includes(trackLower) || trackLower.includes(seqLower)) {
    return 'medium';
  }

  // Some words match
  const seqWords = seqLower.split(/\s+/);
  const trackWords = trackLower.split(/\s+/);
  const matchingWords = seqWords.filter(word => 
    word.length > 3 && trackWords.some(tw => tw.includes(word) || word.includes(tw))
  );

  if (matchingWords.length >= 2) {
    return 'medium';
  }

  if (matchingWords.length >= 1) {
    return 'low';
  }

  return 'none';
}

/**
 * Extract metadata from Spotify track object
 */
export interface SpotifyTrackMetadata {
  albumArt: string | null;
  artist: string | null;
  album: string | null;
  trackName: string | null;
  spotifyTrackId: string | null;
  spotifyUri: string | null;
  previewUrl: string | null;
}

// The parts of a Spotify search result track that extractTrackMetadata reads
export interface SpotifyTrack {
  id?: string;
  uri?: string;
  name?: string;
  preview_url?: string | null;
  artists?: { name?: string }[];
  album?: { name?: string; images?: { url?: string }[] };
}

export function extractTrackMetadata(track: SpotifyTrack | null | undefined): SpotifyTrackMetadata {
  if (!track) {
    return {
      albumArt: null,
      artist: null,
      album: null,
      trackName: null,
      spotifyTrackId: null,
      spotifyUri: null,
      previewUrl: null
    };
  }

  return {
    albumArt: track.album?.images?.[0]?.url || null,
    artist: track.artists?.[0]?.name || null,
    album: track.album?.name || null,
    trackName: track.name || null,
    spotifyTrackId: track.id || null,
    spotifyUri: track.uri || null,
    previewUrl: track.preview_url || null
  };
}

/**
 * Search Spotify for tracks with a custom query
 * Returns multiple results for manual selection
 */
export async function searchSpotify(query: string, limit: number = 10) {
  const token = await getSpotifyToken();
  
  const cleanQuery = cleanSequenceName(query);
  
  const response = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(cleanQuery)}&type=track&limit=${limit}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      signal: AbortSignal.timeout(TIMING.FETCH_TIMEOUT_LONG) // 10 second timeout
    }
  );

  if (!response.ok) {
    throw new Error(`Spotify search failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.tracks?.items || [];
}
