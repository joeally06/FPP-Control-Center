import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { isAdminSession } from '@/lib/auth-helpers';

const AUDIO_DIR = join(process.cwd(), 'public', 'audio');

interface LocalAudioFile {
  name: string;
  size: number;
  lastModified: string;
}

/**
 * GET /api/audio/local-files
 * Get list of local audio files
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

    // Check if audio directory exists
    if (!existsSync(AUDIO_DIR)) {
      return NextResponse.json({
        files: [],
        count: 0
      });
    }

    // Get all audio files
    const allFiles = await readdir(AUDIO_DIR);
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];
    
    const files: LocalAudioFile[] = [];

    for (const fileName of allFiles) {
      const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
      
      if (audioExtensions.includes(ext)) {
        try {
          const filePath = join(AUDIO_DIR, fileName);
          const stats = await stat(filePath);
          
          files.push({
            name: fileName,
            size: stats.size,
            lastModified: stats.mtime.toISOString()
          });
        } catch (error) {
          console.warn(`[Local Files] Failed to stat ${fileName}`);
        }
      }
    }

    // Sort by name
    files.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      files,
      count: files.length
    });

  } catch (error: any) {
    console.error('[Local Files] Error reading files:', error.message);
    
    return NextResponse.json(
      { error: 'Failed to read local files' },
      { status: 500 }
    );
  }
}
