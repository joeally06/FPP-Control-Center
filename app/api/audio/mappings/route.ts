import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { isAdminSession } from '@/lib/auth-helpers';

const DATA_DIR = join(process.cwd(), 'data');
const MAPPING_FILE = join(DATA_DIR, 'audio-mapping.json');

interface AudioMapping {
  [sequence: string]: string;
}

/**
 * GET /api/audio/mappings
 * Get all audio mappings
 * ADMIN ONLY
 */
export async function GET(request: NextRequest) {
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

  } catch (error: any) {
    console.error('[Audio Mappings] Error reading mappings:', error.message);
    
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

    // Ensure data directory exists
    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true, mode: 0o755 });
    }

    // Read existing mappings or create new
    let mappings: AudioMapping = {};
    
    if (existsSync(MAPPING_FILE)) {
      try {
        const content = await readFile(MAPPING_FILE, 'utf-8');
        mappings = JSON.parse(content);
      } catch (error) {
        console.warn('[Audio Mappings] Failed to read existing file, creating new');
      }
    }

    // Add .fseq extension if not present (for consistency)
    const normalizedSeqName = sequenceName.endsWith('.fseq') 
      ? sequenceName 
      : `${sequenceName}.fseq`;

    // Update mapping
    mappings[normalizedSeqName] = audioFile;

    // Write back to file
    await writeFile(
      MAPPING_FILE,
      JSON.stringify(mappings, null, 2),
      { mode: 0o644 }
    );

    console.log(`[Audio Mappings] Created/Updated: ${normalizedSeqName} → ${audioFile}`);

    return NextResponse.json({
      success: true,
      sequenceName: normalizedSeqName,
      audioFile,
      totalMappings: Object.keys(mappings).length
    });

  } catch (error: any) {
    console.error('[Audio Mappings] Error creating mapping:', error.message);
    
    return NextResponse.json(
      { error: 'Failed to create mapping' },
      { status: 500 }
    );
  }
}
