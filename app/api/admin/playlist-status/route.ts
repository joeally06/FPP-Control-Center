import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { readFile, readdir, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import Database from 'better-sqlite3';
import path from 'path';
import { isAdminSession } from '@/lib/auth-helpers';

const DATA_DIR = join(process.cwd(), 'data');
const MAPPING_FILE = join(DATA_DIR, 'audio-mapping.json');
const AUDIO_DIR = join(process.cwd(), 'public', 'audio');
const dbPath = path.join(process.cwd(), 'votes.db');

interface AudioMapping {
  [sequence: string]: string;
}

interface PlaylistItem {
  type: 'leadIn' | 'main' | 'leadOut';
  sequenceName: string;
  audioFile: string;
  status: 'ready' | 'missing_local' | 'needs_mapping';
}

/**
 * Helper: Get audio mappings from file
 */
async function getMappings(): Promise<AudioMapping> {
  try {
    if (!existsSync(MAPPING_FILE)) {
      return {};
    }
    const content = await readFile(MAPPING_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('[Playlist Status] Error reading mappings:', error);
    return {};
  }
}

/**
 * Helper: Get list of local audio files
 */
async function getLocalAudioFiles(): Promise<string[]> {
  try {
    if (!existsSync(AUDIO_DIR)) {
      await mkdir(AUDIO_DIR, { recursive: true });
      return [];
    }
    
    const files = await readdir(AUDIO_DIR);
    const allowedExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
    
    return files.filter(f => {
      const ext = f.toLowerCase().split('.').pop();
      return ext && allowedExtensions.includes(ext);
    });
  } catch (error) {
    console.error('[Playlist Status] Error reading local files:', error);
    return [];
  }
}

/**
 * Helper: Normalize filename for comparison (case-insensitive, trim whitespace)
 */
function normalizeFilename(filename: string): string {
  return filename.toLowerCase().trim();
}

/**
 * GET /api/admin/playlist-status
 * Get aggregated status for all sequences in a playlist
 * ADMIN ONLY - Security: Requires admin authentication
 * 
 * Query params:
 *   - name: Playlist name (required)
 * 
 * Returns:
 *   - items: Array of PlaylistItem with status
 */
export async function GET(request: NextRequest) {
  let db: Database.Database | null = null;
  
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

    // Get playlist name from query
    const { searchParams } = new URL(request.url);
    const playlistName = searchParams.get('name');

    // SECURITY: Validate input
    if (!playlistName || typeof playlistName !== 'string') {
      return NextResponse.json(
        { error: 'Playlist name is required' },
        { status: 400 }
      );
    }

    // SECURITY: Sanitize playlist name (prevent injection)
    const sanitizedName = playlistName.replace(/[<>"'`;]/g, '').substring(0, 255);

    // Get playlist data from database cache
    db = new Database(dbPath);
    
    const cachedPlaylist = db.prepare(`
      SELECT raw_data FROM fpp_playlists WHERE name = ?
    `).get(sanitizedName) as { raw_data: string } | undefined;

    db.close();
    db = null;

    if (!cachedPlaylist) {
      return NextResponse.json(
        { error: 'Playlist not found', hint: 'Sync playlists from FPP first' },
        { status: 404 }
      );
    }

    // Parse playlist data
    let playlistData: any;
    try {
      playlistData = JSON.parse(cachedPlaylist.raw_data);
    } catch (parseError) {
      console.error('[Playlist Status] Failed to parse playlist data');
      return NextResponse.json(
        { error: 'Invalid playlist data' },
        { status: 500 }
      );
    }

    // Get mappings and local files
    const [mappings, localFiles] = await Promise.all([
      getMappings(),
      getLocalAudioFiles()
    ]);

    // Create normalized lookup for local files
    const normalizedLocalFiles = new Set(localFiles.map(normalizeFilename));

    // Process playlist items
    const items: PlaylistItem[] = [];

    const processEntry = (
      entry: { mediaName?: string; sequenceName?: string; enabled?: number },
      type: 'leadIn' | 'main' | 'leadOut'
    ) => {
      // Skip disabled items or items without sequence name
      if (!entry.sequenceName) return;
      if (entry.enabled !== undefined && entry.enabled !== 1) return;

      const sequenceName = entry.sequenceName;
      
      // Priority: 1) Manual mapping, 2) FPP mediaName
      const audioFile = mappings[sequenceName] || entry.mediaName || '';

      // Determine status
      let status: 'ready' | 'missing_local' | 'needs_mapping' = 'ready';

      if (!audioFile) {
        status = 'needs_mapping';
      } else {
        // Check if file exists locally (case-insensitive)
        const normalizedAudio = normalizeFilename(audioFile);
        if (!normalizedLocalFiles.has(normalizedAudio)) {
          status = 'missing_local';
        }
      }

      items.push({
        type,
        sequenceName,
        audioFile,
        status
      });
    };

    // Process all playlist sections
    if (Array.isArray(playlistData.leadIn)) {
      playlistData.leadIn.forEach((entry: any) => processEntry(entry, 'leadIn'));
    }
    if (Array.isArray(playlistData.mainPlaylist)) {
      playlistData.mainPlaylist.forEach((entry: any) => processEntry(entry, 'main'));
    }
    if (Array.isArray(playlistData.leadOut)) {
      playlistData.leadOut.forEach((entry: any) => processEntry(entry, 'leadOut'));
    }

    console.log(`[Playlist Status] ${sanitizedName}: ${items.length} items`);

    return NextResponse.json({
      success: true,
      playlist: sanitizedName,
      items,
      stats: {
        total: items.length,
        ready: items.filter(i => i.status === 'ready').length,
        needsDownload: items.filter(i => i.status === 'missing_local').length,
        needsMapping: items.filter(i => i.status === 'needs_mapping').length
      }
    });

  } catch (error: any) {
    console.error('[Playlist Status] Error:', error.message);
    
    return NextResponse.json(
      { error: 'Failed to get playlist status' },
      { status: 500 }
    );
  } finally {
    if (db) {
      try {
        db.close();
      } catch (e) {
        // Ignore close errors
      }
    }
  }
}
