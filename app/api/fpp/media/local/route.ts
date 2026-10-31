import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { readdir, unlink, stat } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { isAdminSession } from '@/lib/auth-helpers';

const AUDIO_DIR = join(process.cwd(), 'public', 'audio');

/**
 * GET /api/fpp/media/local
 * List locally stored audio files
 * ADMIN ONLY - Security: Requires admin authentication
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

    // Create directory if it doesn't exist
    if (!existsSync(AUDIO_DIR)) {
      return NextResponse.json({
        files: [],
        totalSize: 0,
        count: 0
      });
    }

    // Read directory contents
    const files = await readdir(AUDIO_DIR);
    
    // SECURITY: Filter to audio files only
    const allowedExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
    const audioFiles = files.filter(file => {
      const ext = file.toLowerCase().split('.').pop();
      return ext && allowedExtensions.includes(ext);
    });

    // Get file stats for each audio file
    const fileDetails = await Promise.all(
      audioFiles.map(async (filename) => {
        try {
          const filePath = join(AUDIO_DIR, filename);
          const stats = await stat(filePath);
          
          return {
            name: filename,
            size: stats.size,
            modified: stats.mtime.toISOString(),
            path: `/audio/${filename}`,
            extension: filename.toLowerCase().split('.').pop()
          };
        } catch (error) {
          console.error(`[Local Media] Error reading ${filename}:`, error);
          return null;
        }
      })
    );

    // Filter out any failed reads
    const validFiles = fileDetails.filter(file => file !== null);

    // Calculate total size
    const totalSize = validFiles.reduce((sum, file) => sum + file.size, 0);

    console.log(`[Local Media] Listed ${validFiles.length} files (${totalSize} bytes)`);

    return NextResponse.json({
      files: validFiles,
      totalSize,
      count: validFiles.length
    });

  } catch (error) {
    console.error('[Local Media] Error listing files:', error instanceof Error ? error.message : String(error));
    
    return NextResponse.json(
      { error: 'Failed to list local files' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/fpp/media/local?filename=example.mp3
 * Delete locally stored audio file
 * ADMIN ONLY - Security: Requires admin authentication, validates filename
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

    // Get filename from query parameter
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('filename');

    // SECURITY: Validate filename input
    if (!filename || typeof filename !== 'string') {
      return NextResponse.json(
        { error: 'Filename is required' },
        { status: 400 }
      );
    }

    // SECURITY: Prevent path traversal attacks
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json(
        { error: 'Invalid filename: path traversal detected' },
        { status: 400 }
      );
    }

    // SECURITY: Validate file extension
    const allowedExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
    const ext = filename.toLowerCase().split('.').pop();
    
    if (!ext || !allowedExtensions.includes(ext)) {
      return NextResponse.json(
        { error: 'Invalid file type' },
        { status: 400 }
      );
    }

    // SECURITY: Sanitize filename to match download route
    // Allow alphanumeric, spaces, dots, dashes, underscores, parentheses
    const sanitized = filename.replace(/[^a-zA-Z0-9.\s_()-]/g, '_').substring(0, 255);
    const filePath = join(AUDIO_DIR, sanitized);

    console.log('[Local Media] Attempting to delete:', filename);
    console.log('[Local Media] Sanitized to:', sanitized);
    console.log('[Local Media] Full path:', filePath);

    // Check if file exists
    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // SECURITY: Verify file is within audio directory (double check)
    const resolvedPath = join(AUDIO_DIR, sanitized);
    if (!resolvedPath.startsWith(AUDIO_DIR)) {
      console.error('[Local Media] Path traversal attempt:', filename);
      return NextResponse.json(
        { error: 'Invalid file path' },
        { status: 400 }
      );
    }

    // Get file size before deletion (for logging)
    const stats = await stat(filePath);
    const fileSize = stats.size;

    // Delete the file
    await unlink(filePath);

    console.log(`[Local Media] Deleted: ${sanitized} (${fileSize} bytes)`);

    return NextResponse.json({
      success: true,
      filename: sanitized,
      size: fileSize
    });

  } catch (error) {
    console.error('[Local Media] Error deleting file:', error instanceof Error ? error.message : String(error));
    
    // SECURITY: Don't expose internal error details
    return NextResponse.json(
      { error: 'Failed to delete file' },
      { status: 500 }
    );
  }
}
