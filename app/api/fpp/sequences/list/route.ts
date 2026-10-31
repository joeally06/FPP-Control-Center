import { NextResponse } from 'next/server';

const FPP_URL = process.env.FPP_URL || 'http://fpp.local';

/**
 * GET /api/fpp/sequences/list
 * Get list of available sequences from FPP (direct query)
 * Public endpoint for dashboard controls
 */
export async function GET() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${FPP_URL}/api/sequence`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error('Failed to fetch sequences from FPP');
    }

    const sequences = await response.json();

    // Convert to array of objects with name property
    const sequenceList = Array.isArray(sequences)
      ? sequences.map(name => ({ name }))
      : [];

    return NextResponse.json(sequenceList);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'FPP request timeout' },
        { status: 504 }
      );
    }

    console.error('[FPP Sequences List] Error:', error);
    return NextResponse.json([], { status: 200 }); // Return empty array on error
  }
}
