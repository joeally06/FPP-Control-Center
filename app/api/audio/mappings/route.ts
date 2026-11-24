import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { isAdminSession } from '@/lib/auth-helpers';
import { MAPPING_FILE, updateAudioMappings, type AudioMapping } from '@/lib/audio-mapping';

/**
 * GET /api/audio/mappings
 * Get all audio mappings
 * ADMIN ONLY
 */
export async function GET() {
  try {
    // SECURITY: Verify admin authentication
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (!isAdminSession(session)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Check if mapping file exists
    if (!existsSync(MAPPING_FILE)) {
      return NextResponse.json({
        mappings: [],
        count: 0
      });
    }

    const content = await readFile(MAPPING_FILE, 'utf-8');
    const mappingsObj: AudioMapping = JSON.parse(content);

    // Convert to array format for easier frontend consumption
    const mappings = Object.entries(mappingsObj).map(([sequenceName, audioFile]) => ({
      sequenceName,
      audioFile
    }));

    return NextResponse.json({
      mappings,
      count: mappings.length
    });

  } catch (error) {
    console.error('[Audio Mappings] Error reading mappings:', error instanceof Error ? error.message : String(error));
    
    return NextResponse.json({
      mappings: [],
      count: 0
    });
  }
}

/**
 * POST /api/audio/mappings
 * Create or update a sequence to audio mapping
 * ADMIN ONLY
 */
export async function POST(request: NextRequest) {
  try {
    // SECURITY: Verify admin authentication
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (!isAdminSession(session)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { sequenceName, audioFile } = body;

    // SECURITY: Validate inputs
    if (!sequenceName || typeof sequenceName !== 'string') {
      return NextResponse.json(
        { error: 'Sequence name is required' },
        { status: 400 }
      );
    }

    if (!audioFile || typeof audioFile !== 'string') {
      return NextResponse.json(
        { error: 'Audio file name is required' },
        { status: 400 }
      );
    }

    // SECURITY: Prevent path traversal
    if (sequenceName.includes('..') || sequenceName.includes('/') || sequenceName.includes('\\')) {
      return NextResponse.json(
        { error: 'Invalid sequence name' },
        { status: 400 }
      );
    }

    if (audioFile.includes('..') || audioFile.includes('/') || audioFile.includes('\\')) {
      return NextResponse.json(
        { error: 'Invalid audio file name' },
        { status: 400 }
      );
    }

    // SECURITY: Validate audio file extension
    const allowedExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
    const ext = audioFile.toLowerCase().split('.').pop();
    
    if (!ext || !allowedExtensions.includes(ext)) {
      return NextResponse.json(
        { error: 'Invalid audio file type' },
        { status: 400 }
      );
    }

    // Add .fseq extension if not present (for consistency)
    const normalizedSeqName = sequenceName.endsWith('.fseq')
      ? sequenceName
      : `${sequenceName}.fseq`;

    // Updates run one at a time and the file is replaced whole, so another request can't undo this one
    const saved = await updateAudioMappings((current) => ({ ...current, [normalizedSeqName]: audioFile }));

    console.log(`[Audio Mappings] Created/Updated: ${normalizedSeqName} → ${audioFile}`);

    return NextResponse.json({
      success: true,
      sequenceName: normalizedSeqName,
      audioFile,
      totalMappings: Object.keys(saved ?? {}).length
    });

  } catch (error) {
    console.error('[Audio Mappings] Error creating mapping:', error instanceof Error ? error.message : String(error));
    
    return NextResponse.json(
      { error: 'Failed to create mapping' },
      { status: 500 }
    );
  }
}
