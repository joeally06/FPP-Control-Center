import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { getFppUrl } from '@/lib/fpp-config';
import { isAdminSession } from '@/lib/auth-helpers';

const AUDIO_DIR = join(process.cwd(), 'public', 'audio');
const DATA_DIR = join(process.cwd(), 'data');
const MAPPING_FILE = join(DATA_DIR, 'audio-mapping.json');
const FPP_URL = getFppUrl();

/**
 * POST /api/audio/download
 * Download audio file from FPP for a specific sequence
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
    const { sequenceName, mediaName } = body;

    if (!sequenceName || typeof sequenceName !== 'string') {
      return NextResponse.json(
        { error: 'Sequence name is required' },
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

    // Ensure audio directory exists
    if (!existsSync(AUDIO_DIR)) {
      await mkdir(AUDIO_DIR, { recursive: true, mode: 0o755 });
    }

    // Get sequence info from FPP to find audio file
    console.log(`[Audio Download] Looking for audio in sequence: ${sequenceName}`);
    
    let audioFileName: string | null = null;
    
    // If mediaName is provided directly from playlist data, use it
    if (mediaName && typeof mediaName === 'string') {
      // SECURITY: Prevent path traversal in mediaName
      if (mediaName.includes('..') || mediaName.includes('/') || mediaName.includes('\\')) {
        return NextResponse.json(
          { error: 'Invalid media name' },
          { status: 400 }
        );
      }
      audioFileName = mediaName;
      console.log(`[Audio Download] Using mediaName from playlist: ${audioFileName}`);
    } else {
      // Fallback: Try to find matching audio from FPP media list
      console.log(`[Audio Download] No mediaName provided, searching FPP media list...`);
      
      const mediaListRes = await fetch(`${FPP_URL}/api/media`, {
        signal: AbortSignal.timeout(10000)
      });

      if (!mediaListRes.ok) {
        console.error('[Audio Download] Failed to list media from FPP:', mediaListRes.status);
        return NextResponse.json(
          { error: 'Failed to connect to FPP' },
          { status: 502 }
        );
      }

      const mediaList = await mediaListRes.json();
      console.log(`[Audio Download] FPP has ${mediaList.length} media files`);

      // Try to find matching audio file
      // Normalize for comparison
      const normalize = (str: string) => {
        return str
          .toLowerCase()
          .replace(/['']/g, '')
          .replace(/[_-]/g, ' ')
          .replace(/\s+/g, ' ')
          .replace(/\.(fseq|mp3|wav|ogg|m4a|flac|aac)$/i, '')
          .trim();
      };

      const normalizedSeq = normalize(sequenceName);

      for (const mediaFile of mediaList) {
        if (normalize(mediaFile) === normalizedSeq) {
          audioFileName = mediaFile;
          break;
        }
      }

      // If no exact match, try partial match
      if (!audioFileName) {
        for (const mediaFile of mediaList) {
          const normalizedMedia = normalize(mediaFile);
          if (normalizedMedia.includes(normalizedSeq) || normalizedSeq.includes(normalizedMedia)) {
            audioFileName = mediaFile;
            break;
          }
        }
      }
    }

    if (!audioFileName) {
      console.log(`[Audio Download] No matching audio found for: ${sequenceName}`);
      return NextResponse.json(
        { error: 'No matching audio file found on FPP', sequenceName },
        { status: 404 }
      );
    }

    console.log(`[Audio Download] Downloading audio: ${audioFileName}`);

    // Download the audio file from FPP
    // FPP serves music files at /api/file/music/{filename}
    const audioUrl = `${FPP_URL}/api/file/music/${encodeURIComponent(audioFileName)}`;
    console.log(`[Audio Download] Fetching from URL: ${audioUrl}`);
    
    let audioRes: Response;
    try {
      audioRes = await fetch(audioUrl, {
        signal: AbortSignal.timeout(60000) // 1 minute timeout for large files
      });
    } catch (fetchError: any) {
      console.error(`[Audio Download] Fetch error:`, fetchError.message);
      return NextResponse.json(
        { error: `Failed to connect to FPP: ${fetchError.message}`, url: audioUrl },
        { status: 502 }
      );
    }

    if (!audioRes.ok) {
      const errorText = await audioRes.text().catch(() => 'No response body');
      console.error(`[Audio Download] Failed to download from FPP: ${audioRes.status} - ${errorText}`);
      return NextResponse.json(
        { error: `Failed to download audio from FPP (${audioRes.status})`, url: audioUrl },
        { status: 502 }
      );
    }

    // Get the audio content
    const audioBuffer = await audioRes.arrayBuffer();
    const audioBytes = Buffer.from(audioBuffer);

    // Write to local audio directory
    const localPath = join(AUDIO_DIR, audioFileName);
    await writeFile(localPath, audioBytes, { mode: 0o644 });

    console.log(`[Audio Download] Saved: ${audioFileName} (${audioBytes.length} bytes)`);

    // Auto-create mapping: sequence → audio file
    try {
      // Ensure data directory exists
      if (!existsSync(DATA_DIR)) {
        await mkdir(DATA_DIR, { recursive: true, mode: 0o755 });
      }

      // Load existing mappings
      let mappings: Record<string, string> = {};
      if (existsSync(MAPPING_FILE)) {
        try {
          const content = await readFile(MAPPING_FILE, 'utf-8');
          mappings = JSON.parse(content);
        } catch {
          // Start fresh if file is corrupted
          mappings = {};
        }
      }

      // Add new mapping
      mappings[sequenceName] = audioFileName;
      
      // Save mappings
      await writeFile(MAPPING_FILE, JSON.stringify(mappings, null, 2), { mode: 0o644 });
      console.log(`[Audio Download] Auto-mapped: "${sequenceName}" → "${audioFileName}"`);
    } catch (mappingError: any) {
      // Don't fail the download if mapping fails
      console.warn(`[Audio Download] Failed to auto-create mapping:`, mappingError.message);
    }

    return NextResponse.json({
      success: true,
      sequenceName,
      audioFile: audioFileName,
      size: audioBytes.length,
      mapped: true
    });

  } catch (error: any) {
    console.error('[Audio Download] Error:', error.message);
    
    if (error.name === 'TimeoutError') {
      return NextResponse.json(
        { error: 'Download timed out - file may be too large' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to download audio' },
      { status: 500 }
    );
  }
}
