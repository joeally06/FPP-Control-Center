import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

/**
 * GET /api/fpp/media/list
 * List audio files from FPP server
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

    if (session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const FPP_URL = process.env.FPP_URL;
    
    if (!FPP_URL) {
      return NextResponse.json(
        { error: 'FPP_URL not configured' },
        { status: 500 }
      );
    }

    // SECURITY: Use AbortController for timeout protection
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(`${FPP_URL}/api/media`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'FPP-Control-Center/1.0'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`FPP returned ${response.status}`);
    }

    const data = await response.json();

    // SECURITY: Filter and validate only audio files
    const allowedExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
    
    // FPP returns an array of file objects or strings
    const fileList = Array.isArray(data) ? data : [];
    
    const audioFiles = fileList
      .filter((file: any) => {
        // Handle both string filenames and file objects
        const fileName = typeof file === 'string' ? file : file?.name;
        if (!fileName) return false;
        
        const ext = fileName.toLowerCase().split('.').pop();
        return allowedExtensions.includes(ext || '');
      })
      .map((file: any) => {
        // Handle both string filenames and file objects
        const fileName = typeof file === 'string' ? file : file?.name || '';
        const fileSize = typeof file === 'object' ? (file?.size || 0) : 0;
        const fileModified = typeof file === 'object' ? (file?.mtime || new Date().toISOString()) : new Date().toISOString();
        
        return {
          // SECURITY: Only return safe, validated fields
          name: String(fileName).substring(0, 255), // Limit length
          size: Number(fileSize) || 0,
          modified: fileModified,
          path: `/api/media/${fileName}` // Add path for future use
        };
      });

    console.log(`[FPP Media List] Found ${audioFiles.length} audio files`);
    if (audioFiles.length > 0) {
      console.log(`[FPP Media List] Sample file:`, audioFiles[0]);
    }

    return NextResponse.json({
      success: true,
      files: audioFiles,
      count: audioFiles.length
    });

  } catch (error: any) {
    console.error('[FPP Media List] Error:', error.message);
    
    // SECURITY: Don't expose internal error details
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'FPP request timeout' },
        { status: 504 }
      );
    }

    if (error.message?.includes('ECONNREFUSED')) {
      return NextResponse.json(
        { error: 'Cannot connect to FPP', offline: true },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch media files' },
      { status: 500 }
    );
  }
}
