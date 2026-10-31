import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { getDb } from '@/lib/database';

/**
 * POST /api/admin/media-library/refresh-urls
 * Bulk refresh Spotify URLs for all Media Library entries missing URLs
 * ADMIN ONLY
 */
export async function POST(request: NextRequest) {
  try {
    // Require admin authentication with rate limiting
    await requireAdminWithRateLimit(request);

    // Check if Spotify credentials exist
    if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
      return NextResponse.json(
        { error: 'Spotify credentials not configured' },
        { status: 400 }
      );
    }

    const db = getDb();

    // Get all entries missing Spotify URLs
    const entries = db.prepare(`
      SELECT sequence_name, track_name, artist_name, spotify_track_id
      FROM spotify_metadata
      WHERE (spotify_url IS NULL OR spotify_url = '')
      AND track_name IS NOT NULL
      AND artist_name IS NOT NULL
    `).all() as Array<{
      sequence_name: string;
      track_name: string;
      artist_name: string;
      spotify_track_id: string | null;
    }>;

    if (entries.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All entries already have Spotify URLs',
        updated: 0,
        total: 0,
      });
    }

    console.log(`[Media Library Refresh] Processing ${entries.length} entries...`);

    // Get Spotify access token
    const authResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!authResponse.ok) {
      throw new Error('Failed to authenticate with Spotify');
    }

    const authData = await authResponse.json();
    const accessToken = authData.access_token;

    let updated = 0;
    const updateStmt = db.prepare(`
      UPDATE spotify_metadata
      SET spotify_url = ?, last_updated = CURRENT_TIMESTAMP
      WHERE sequence_name = ?
    `);

    // Batch processing with concurrency limit
    const CONCURRENCY_LIMIT = 5;
    const results: Array<{ entry: typeof entries[0]; url: string | null; error?: string }> = [];

    /**
     * Process a single entry - search Spotify and return URL
     */
    async function processEntry(entry: typeof entries[0]): Promise<{ entry: typeof entry; url: string | null; error?: string }> {
      try {
        let spotifyUrl: string | null = null;

        // If we have a track ID, construct URL directly
        if (entry.spotify_track_id) {
          spotifyUrl = `https://open.spotify.com/track/${entry.spotify_track_id}`;
          console.log(`[Refresh] ✓ Constructed URL for ${entry.track_name}`);
          return { entry, url: spotifyUrl };
        }

        // Search Spotify for the track
        const searchQuery = `track:${entry.track_name} artist:${entry.artist_name}`;
        const searchResponse = await fetch(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=1`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            signal: AbortSignal.timeout(10000) // 10 second timeout
          }
        );

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();

          if (searchData.tracks.items.length > 0) {
            spotifyUrl = searchData.tracks.items[0].external_urls?.spotify || null;
            if (spotifyUrl) {
              console.log(`[Refresh] ✓ Found URL for ${entry.track_name} - ${entry.artist_name}`);
            }
          }
        }

        return { entry, url: spotifyUrl };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Refresh] ✗ Failed to process ${entry.sequence_name}:`, errorMsg);
        return { entry, url: null, error: errorMsg };
      }
    }

    /**
     * Process entries in batches with concurrency limit
     */
    async function processBatch(batch: typeof entries): Promise<void> {
      const promises = batch.map(entry => processEntry(entry));
      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }

    // Split entries into batches and process with concurrency limit
    for (let i = 0; i < entries.length; i += CONCURRENCY_LIMIT) {
      const batch = entries.slice(i, i + CONCURRENCY_LIMIT);
      await processBatch(batch);
      
      // Progress logging
      console.log(`[Refresh] Processed ${Math.min(i + CONCURRENCY_LIMIT, entries.length)}/${entries.length} entries`);
      
      // Small delay between batches to respect rate limits (5 requests per batch)
      if (i + CONCURRENCY_LIMIT < entries.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    // Update database with all successful results
    for (const result of results) {
      if (result.url && !result.error) {
        try {
          updateStmt.run(result.url, result.entry.sequence_name);
          updated++;
        } catch (error) {
          console.error(`[Refresh] ✗ Failed to update DB for ${result.entry.sequence_name}:`, error);
        }
      }
    }

    console.log(`[Media Library Refresh] Complete: ${updated}/${entries.length} updated`);

    return NextResponse.json({
      success: true,
      message: `Updated ${updated} of ${entries.length} entries`,
      updated,
      total: entries.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    console.error('[Media Library Refresh Error]:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to refresh URLs',
      },
      { status: 500 }
    );
  }
}
