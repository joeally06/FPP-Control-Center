import { NextResponse } from 'next/server';

const FPP_URL = process.env.FPP_URL || 'http://fpp.local';

/**
 * GET /api/fpp/playlists/list
 * Get list of available playlists from FPP (direct query)
 * Public endpoint for dashboard controls
 */
export async function GET() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${FPP_URL}/api/playlists`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error('Failed to fetch playlists from FPP');
    }

    const playlists = await response.json();

    // Convert to array of objects with name property if needed
    const playlistList = Array.isArray(playlists)
      ? playlists.map(item => typeof item === 'string' ? { name: item } : item)
      : [];

    return NextResponse.json(playlistList);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'FPP request timeout' },
        { status: 504 }
      );
    }

    console.error('[FPP Playlists List] Error:', error);
    return NextResponse.json([], { status: 200 }); // Return empty array on error
  }
}
