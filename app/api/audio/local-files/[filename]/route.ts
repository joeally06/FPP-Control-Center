import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { isAdminSession } from '@/lib/auth-helpers';

const AUDIO_DIR = join(process.cwd(), 'public', 'audio');

/**
 * DELETE /api/audio/local-files/[filename]
 * Delete a local audio file
 * ADMIN ONLY
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
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

    const { filename } = await params;

    if (!filename) {
      return NextResponse.json(
        { error: 'Filename is required' },
        { status: 400 }
      );
    }

    // SECURITY: Decode the filename
    const decodedFilename = decodeURIComponent(filename);

    // SECURITY: Prevent path traversal
    if (decodedFilename.includes('..') || decodedFilename.includes('/') || decodedFilename.includes('\\')) {
      return NextResponse.json(
        { error: 'Invalid filename' },
        { status: 400 }
      );
    }

    // SECURITY: Validate file extension
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];
    const ext = decodedFilename.toLowerCase().substring(decodedFilename.lastIndexOf('.'));
    
    if (!audioExtensions.includes(ext)) {
      return NextResponse.json(
        { error: 'Invalid file type' },
        { status: 400 }
      );
    }

    const filePath = join(AUDIO_DIR, decodedFilename);

    // Check if file exists
    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Delete the file
    await unlink(filePath);

    console.log(`[Local Files] Deleted: ${decodedFilename}`);

    return NextResponse.json({
      success: true,
      filename: decodedFilename
    });

  } catch (error) {
    console.error('[Local Files] Error deleting file:', error instanceof Error ? error.message : String(error));
    
    return NextResponse.json(
      { error: 'Failed to delete file' },
      { status: 500 }
    );
  }
}
