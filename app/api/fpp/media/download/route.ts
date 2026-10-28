import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import crypto from 'crypto';
import { isAdminSession } from '@/lib/auth-helpers';

const AUDIO_DIR = join(process.cwd(), 'public', 'audio');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit

/**
 * POST /api/fpp/media/download
 * Download audio file from FPP to local storage
 * ADMIN ONLY - Security: Requires admin authentication, validates files
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
    const { filename } = body;

    // SECURITY: Validate filename input
    if (!filename || typeof filename !== 'string') {
      return NextResponse.json(
        { error: 'Filename is required and must be a string' },
        { status: 400 }
      );
    }

    // SECURITY: Prevent path traversal attacks
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      console.error('[FPP Media Download] Path traversal attempt:', filename);
      return NextResponse.json(
        { error: 'Invalid filename: path traversal detected' },
        { status: 400 }
      );
    }

    // SECURITY: Validate file extension
    const allowedExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
    const ext = filename.toLowerCase().split('.').pop();
    
    if (!ext || !allowedExtensions.includes(ext)) {
      console.error('[FPP Media Download] Invalid extension:', ext, 'for file:', filename);
      return NextResponse.json(
        { error: 'Invalid file type. Only audio files allowed.' },
        { status: 400 }
      );
    }

    // SECURITY: Sanitize filename (keep spaces, but remove dangerous characters)
    // Allow alphanumeric, spaces, dots, dashes, underscores, parentheses, and single quotes
    const sanitized = filename.replace(/[^a-zA-Z0-9.\s_()'-]/g, '_').substring(0, 255);
    
    console.log('[FPP Media Download] Original filename:', filename);
    console.log('[FPP Media Download] Sanitized filename:', sanitized);

    const FPP_URL = process.env.FPP_URL;
    
    if (!FPP_URL) {
      return NextResponse.json(
        { error: 'FPP_URL not configured' },
        { status: 500 }
      );
    }

    // SECURITY: Download with timeout and size limit
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    // FPP serves files from /api/file/Music/ directory
    const response = await fetch(
      `${FPP_URL}/api/file/Music/${encodeURIComponent(filename)}`,
      {
        method: 'GET',
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('[FPP Media Download] FPP returned status:', response.status);
      throw new Error(`FPP returned ${response.status}`);
    }

    // SECURITY: Check Content-Type header (lenient - FPP may not set correct type)
    const contentType = response.headers.get('content-type') || '';
    console.log('[FPP Media Download] Content-Type:', contentType);
    
    // Only reject if content-type is clearly wrong (HTML, JSON, etc)
    const invalidTypes = ['text/html', 'application/json', 'text/plain'];
    const isInvalidType = invalidTypes.some(type => contentType.includes(type));
    
    if (isInvalidType) {
      console.error('[FPP Media Download] Invalid content type:', contentType);
      return NextResponse.json(
        { error: 'Invalid content type received from FPP' },
        { status: 400 }
      );
    }

    // SECURITY: Check Content-Length before downloading
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 413 }
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    
    // SECURITY: Verify size after download
    if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File exceeds maximum allowed size' },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(arrayBuffer);

    // SECURITY: Validate audio file magic bytes (basic check)
    const isValidAudio = validateAudioFile(buffer, ext);
    if (!isValidAudio) {
      return NextResponse.json(
        { error: 'File validation failed: not a valid audio file' },
        { status: 400 }
      );
    }

    // SECURITY: Ensure audio directory exists with restricted permissions
    if (!existsSync(AUDIO_DIR)) {
      await mkdir(AUDIO_DIR, { recursive: true, mode: 0o755 });
    }

    const filePath = join(AUDIO_DIR, sanitized);

    // SECURITY: Check if file already exists
    if (existsSync(filePath)) {
      return NextResponse.json(
        { error: 'File already exists locally' },
        { status: 409 }
      );
    }

    // SECURITY: Write file with restricted permissions
    await writeFile(filePath, buffer, { mode: 0o644 });

    // Calculate file hash for integrity verification
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    console.log(`[FPP Media Download] Success: ${filename} → ${sanitized} (${buffer.length} bytes, SHA256: ${hash.substring(0, 16)}...)`);

    return NextResponse.json({
      success: true,
      filename: sanitized,
      originalName: filename,
      size: buffer.length,
      path: `/audio/${sanitized}`,
      hash: hash.substring(0, 16) // Return first 16 chars for verification
    });

  } catch (error: any) {
    console.error('[FPP Media Download] Error:', error.message);
    
    // SECURITY: Don't expose internal error details
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Download timeout' },
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
      { error: 'Failed to download file' },
      { status: 500 }
    );
  }
}

/**
 * SECURITY: Validate audio file by checking magic bytes
 */
function validateAudioFile(buffer: Buffer, extension: string): boolean {
  if (buffer.length < 12) return false;

  // Check magic bytes for common audio formats
  const magicBytes = buffer.slice(0, 12);

  // MP3: Starts with ID3 or FF FB/FF F3/FF F2
  if (extension === 'mp3') {
    const id3 = magicBytes[0] === 0x49 && magicBytes[1] === 0x44 && magicBytes[2] === 0x33;
    const mp3Frame = magicBytes[0] === 0xFF && (magicBytes[1] & 0xE0) === 0xE0;
    return id3 || mp3Frame;
  }

  // WAV: Starts with RIFF....WAVE
  if (extension === 'wav') {
    const riff = magicBytes[0] === 0x52 && magicBytes[1] === 0x49 && 
                 magicBytes[2] === 0x46 && magicBytes[3] === 0x46;
    const wave = magicBytes[8] === 0x57 && magicBytes[9] === 0x41 && 
                 magicBytes[10] === 0x56 && magicBytes[11] === 0x45;
    return riff && wave;
  }

  // OGG: Starts with OggS
  if (extension === 'ogg') {
    return magicBytes[0] === 0x4F && magicBytes[1] === 0x67 && 
           magicBytes[2] === 0x67 && magicBytes[3] === 0x53;
  }

  // M4A/AAC: Starts with various ftyp markers
  if (extension === 'm4a' || extension === 'aac') {
    // Check for ftyp at offset 4
    return magicBytes[4] === 0x66 && magicBytes[5] === 0x74 && 
           magicBytes[6] === 0x79 && magicBytes[7] === 0x70;
  }

  // FLAC: Starts with fLaC
  if (extension === 'flac') {
    return magicBytes[0] === 0x66 && magicBytes[1] === 0x4C && 
           magicBytes[2] === 0x61 && magicBytes[3] === 0x43;
  }

  // If we can't validate, reject for security
  return false;
}
