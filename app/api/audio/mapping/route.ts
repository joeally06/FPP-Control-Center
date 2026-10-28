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
  [sequence: string]: string; // sequence name → audio filename
}

/**
 * GET /api/audio/mapping
 * Get sequence to audio file mappings
 * PUBLIC - Used by audio sync server
 */
export async function GET(request: NextRequest) {
  try {
    // Check if mapping file exists
    if (!existsSync(MAPPING_FILE)) {
      return NextResponse.json({
        mappings: {},
        count: 0
      });
    }

    const content = await readFile(MAPPING_FILE, 'utf-8');
    const mappings: AudioMapping = JSON.parse(content);

    return NextResponse.json({
      mappings,
      count: Object.keys(mappings).length
    });

  } catch (error: any) {
    console.error('[Audio Mapping] Error reading mappings:', error.message);
    
    // Return empty mappings on error rather than failing
    return NextResponse.json({
      mappings: {},
      count: 0
    });
  }
}

/**
 * POST /api/audio/mapping
 * Create or update sequence to audio mapping
 * ADMIN ONLY - Security: Requires admin authentication, validates inputs
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
    const { sequence, audioFile } = body;

    // SECURITY: Validate inputs
    if (!sequence || typeof sequence !== 'string') {
      return NextResponse.json(
        { error: 'Sequence name is required and must be a string' },
        { status: 400 }
      );
    }

    if (!audioFile || typeof audioFile !== 'string') {
      return NextResponse.json(
        { error: 'Audio file name is required and must be a string' },
        { status: 400 }
      );
    }

    // SECURITY: Validate sequence name (should be .fseq file)
    if (!sequence.endsWith('.fseq')) {
      return NextResponse.json(
        { error: 'Sequence must be a .fseq file' },
        { status: 400 }
      );
    }

    // SECURITY: Prevent path traversal
    if (sequence.includes('..') || sequence.includes('/') || sequence.includes('\\')) {
      return NextResponse.json(
        { error: 'Invalid sequence name: path traversal detected' },
        { status: 400 }
      );
    }

    if (audioFile.includes('..') || audioFile.includes('/') || audioFile.includes('\\')) {
      return NextResponse.json(
        { error: 'Invalid audio file name: path traversal detected' },
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

    // SECURITY: Sanitize inputs
    // Allow alphanumeric, dot, underscore, dash, space, single quote, parentheses
    const sanitizedSequence = sequence.replace(/[^a-zA-Z0-9._\-\s'()]/g, '_').substring(0, 255);
    const sanitizedAudio = audioFile.replace(/[^a-zA-Z0-9._\-\s'()]/g, '_').substring(0, 255);

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
        console.warn('[Audio Mapping] Failed to read existing file, creating new');
      }
    }

    // Update mapping
    mappings[sanitizedSequence] = sanitizedAudio;

    // Write back to file with pretty formatting
    await writeFile(
      MAPPING_FILE,
      JSON.stringify(mappings, null, 2),
      { mode: 0o644 }
    );

    console.log(`[Audio Mapping] Created/Updated: ${sanitizedSequence} → ${sanitizedAudio}`);

    return NextResponse.json({
      success: true,
      sequence: sanitizedSequence,
      audioFile: sanitizedAudio,
      totalMappings: Object.keys(mappings).length
    });

  } catch (error: any) {
    console.error('[Audio Mapping] Error creating mapping:', error.message);
    
    return NextResponse.json(
      { error: 'Failed to create mapping' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/audio/mapping?sequence=example.fseq
 * Delete sequence to audio mapping
 * ADMIN ONLY - Security: Requires admin authentication, validates input
 */
export async function DELETE(request: NextRequest) {
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

    // Get sequence from query parameter
    const { searchParams } = new URL(request.url);
    const sequence = searchParams.get('sequence');

    // SECURITY: Validate input
    if (!sequence || typeof sequence !== 'string') {
      return NextResponse.json(
        { error: 'Sequence name is required' },
        { status: 400 }
      );
    }

    // SECURITY: Prevent path traversal
    if (sequence.includes('..') || sequence.includes('/') || sequence.includes('\\')) {
      return NextResponse.json(
        { error: 'Invalid sequence name: path traversal detected' },
        { status: 400 }
      );
    }

    // Check if mapping file exists
    if (!existsSync(MAPPING_FILE)) {
      return NextResponse.json(
        { error: 'No mappings exist' },
        { status: 404 }
      );
    }

    // Read existing mappings
    const content = await readFile(MAPPING_FILE, 'utf-8');
    const mappings: AudioMapping = JSON.parse(content);

    // SECURITY: Sanitize sequence name
    const sanitizedSequence = sequence.replace(/[^a-zA-Z0-9._\-\s'()]/g, '_').substring(0, 255);

    // Check if mapping exists
    if (!mappings[sanitizedSequence]) {
      return NextResponse.json(
        { error: 'Mapping not found' },
        { status: 404 }
      );
    }

    const deletedAudio = mappings[sanitizedSequence];

    // Delete mapping
    delete mappings[sanitizedSequence];

    // Write back to file
    await writeFile(
      MAPPING_FILE,
      JSON.stringify(mappings, null, 2),
      { mode: 0o644 }
    );

    console.log(`[Audio Mapping] Deleted: ${sanitizedSequence} → ${deletedAudio}`);

    return NextResponse.json({
      success: true,
      sequence: sanitizedSequence,
      audioFile: deletedAudio,
      remainingMappings: Object.keys(mappings).length
    });

  } catch (error: any) {
    console.error('[Audio Mapping] Error deleting mapping:', error.message);
    
    return NextResponse.json(
      { error: 'Failed to delete mapping' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/audio/mapping
 * Bulk update mappings (replaces all mappings)
 * ADMIN ONLY - Security: Requires admin authentication, validates all entries
 */
export async function PUT(request: NextRequest) {
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
    const { mappings } = body;

    // SECURITY: Validate input is an object
    if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) {
      return NextResponse.json(
        { error: 'Mappings must be an object' },
        { status: 400 }
      );
    }

    // SECURITY: Validate and sanitize all entries
    const sanitizedMappings: AudioMapping = {};
    const allowedExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];

    for (const [sequence, audioFile] of Object.entries(mappings)) {
      // Validate types
      if (typeof sequence !== 'string' || typeof audioFile !== 'string') {
        return NextResponse.json(
          { error: 'All mappings must be string → string' },
          { status: 400 }
        );
      }

      // Validate sequence ends with .fseq
      if (!sequence.endsWith('.fseq')) {
        return NextResponse.json(
          { error: `Invalid sequence: ${sequence} (must be .fseq)` },
          { status: 400 }
        );
      }

      // Validate audio file extension
      const ext = audioFile.toLowerCase().split('.').pop();
      if (!ext || !allowedExtensions.includes(ext)) {
        return NextResponse.json(
          { error: `Invalid audio file: ${audioFile}` },
          { status: 400 }
        );
      }

      // Check for path traversal
      if (sequence.includes('..') || sequence.includes('/') || sequence.includes('\\')) {
        return NextResponse.json(
          { error: `Path traversal detected in sequence: ${sequence}` },
          { status: 400 }
        );
      }

      if (audioFile.includes('..') || audioFile.includes('/') || audioFile.includes('\\')) {
        return NextResponse.json(
          { error: `Path traversal detected in audio file: ${audioFile}` },
          { status: 400 }
        );
      }

      // Sanitize and add to new mappings
      const sanitizedSequence = sequence.replace(/[^a-zA-Z0-9._\-\s'()]/g, '_').substring(0, 255);
      const sanitizedAudio = audioFile.replace(/[^a-zA-Z0-9._\-\s'()]/g, '_').substring(0, 255);
      
      sanitizedMappings[sanitizedSequence] = sanitizedAudio;
    }

    // Ensure data directory exists
    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true, mode: 0o755 });
    }

    // Write new mappings
    await writeFile(
      MAPPING_FILE,
      JSON.stringify(sanitizedMappings, null, 2),
      { mode: 0o644 }
    );

    console.log(`[Audio Mapping] Bulk update: ${Object.keys(sanitizedMappings).length} mappings`);

    return NextResponse.json({
      success: true,
      count: Object.keys(sanitizedMappings).length,
      mappings: sanitizedMappings
    });

  } catch (error: any) {
    console.error('[Audio Mapping] Error bulk updating mappings:', error.message);
    
    return NextResponse.json(
      { error: 'Failed to update mappings' },
      { status: 500 }
    );
  }
}
