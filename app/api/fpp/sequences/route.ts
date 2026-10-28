import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { getDb } from '@/lib/database';

/**
 * GET /api/fpp/sequences
 * Returns cached sequences from database
 * ADMIN ONLY - Sequences are used for show management
 */
export async function GET() {
  try {
    await requireAdmin();

    // Try to read sequences from database cache first
    const db = getDb();
    
    const cachedSequences = db.prepare(`
      SELECT name, filename, length_ms, channel_count, raw_data, synced_at
      FROM fpp_sequences
      ORDER BY name ASC
    `).all();

    if (cachedSequences.length > 0) {
      console.log(`[FPP Sequences] Returning ${cachedSequences.length} sequences from cache`);
      
      // Parse raw_data JSON for each sequence
      const parsedSequences = cachedSequences.map((sequence: any) => {
        try {
          return JSON.parse(sequence.raw_data);
        } catch {
          // Fallback to basic structure if JSON parse fails
          return {
            name: sequence.name,
            filename: sequence.filename,
            length: sequence.length_ms,
            channelCount: sequence.channel_count
          };
        }
      });

      console.log('[FPP Sequences] Sample parsed sequence:', parsedSequences[0]);
      return NextResponse.json(parsedSequences);
    }

    // If cache is empty, suggest syncing
    console.log('[FPP Sequences] Cache empty - suggesting sync');
    
    return NextResponse.json({
      error: 'No cached sequences available',
      hint: 'Click "Sync Now" to load sequences from FPP device',
      sequences: []
    }, { status: 404 });

  } catch (error: any) {
    if (error.message?.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error.message?.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[FPP Sequences] Error:', error);
    
    return NextResponse.json({
      error: 'Failed to load sequences',
      details: error.message,
      sequences: []
    }, { status: 500 });
  }
}
