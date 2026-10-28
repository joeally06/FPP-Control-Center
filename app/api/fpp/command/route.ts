import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { isAdminSession } from '@/lib/auth-helpers';

const FPP_URL = process.env.FPP_URL || 'http://fpp.local';

/**
 * POST /api/fpp/command
 * Send commands to FPP
 * 
 * Security:
 * - Admin authentication required
 * - Input validation on command and args
 * - Whitelist of allowed commands
 * - Request timeout (5s)
 * - Comprehensive logging
 */
export async function POST(request: NextRequest) {
  try {
    // 1. AUTHENTICATION CHECK - Admin only
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      console.warn('[FPP Command] Unauthorized attempt - No session');
      return NextResponse.json(
        { error: 'Unauthorized - Authentication required' },
        { status: 401 }
      );
    }

    if (!isAdminSession(session)) {
      console.warn('[FPP Command] Forbidden -', session.user.email, 'is not an admin');
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    // 2. PARSE REQUEST
    const { command, args = [] } = await request.json();

    const timestamp = new Date().toISOString();
    const userEmail = session.user.email;

    // 3. VALIDATE COMMAND
    if (!command || typeof command !== 'string') {
      console.warn(`[${timestamp}] [FPP Command] Invalid command format from ${userEmail}`);
      return NextResponse.json(
        { error: 'Invalid command' },
        { status: 400 }
      );
    }

    // 4. VALIDATE ARGS
    if (!Array.isArray(args)) {
      console.warn(`[${timestamp}] [FPP Command] Invalid args from ${userEmail}`);
      return NextResponse.json(
        { error: 'Args must be an array' },
        { status: 400 }
      );
    }

    // 5. WHITELIST CHECK (security)
    const allowedCommands = [
      'Start Playlist',
      'Start Playlist At Item',
      'Stop Gracefully',
      'Stop Now',
      'Next Playlist Item',
      'Prev Playlist Item',
      'Start Playlist At Random Item',
      'Pause Playlist',
      'Resume Playlist',
      'Restart Playlist Item',
      'FSEQ Effect Start',
      'FSEQ Effect Stop',
      'Effects Stop',
      'Volume Set',
      'Volume Adjust',
      'Volume Increase',
      'Volume Decrease',
    ];

    if (!allowedCommands.includes(command)) {
      console.warn(`[${timestamp}] [FPP Command] Disallowed command "${command}" attempted by ${userEmail}`);
      return NextResponse.json(
        { error: 'Command not allowed' },
        { status: 403 }
      );
    }

    console.log(`[${timestamp}] [FPP Command] ${userEmail} executing: "${command}" with args:`, args);

    // 6. SEND COMMAND TO FPP
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${FPP_URL}/api/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        command,
        args,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${timestamp}] [FPP Command] Error from FPP for ${userEmail}: ${errorText}`);
      return NextResponse.json(
        { error: 'FPP command failed' },
        { status: response.status }
      );
    }

    // FPP API sometimes returns plain text instead of JSON
    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      // Plain text response (e.g., "Stopped")
      const text = await response.text();
      data = { result: text, status: 'success' };
    }

    console.log(`[${timestamp}] [FPP Command] Success for ${userEmail}: "${command}"`);
    
    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error(`[${new Date().toISOString()}] [FPP Command] Request timeout`);
      return NextResponse.json(
        { error: 'FPP request timeout' },
        { status: 504 }
      );
    }

    console.error(`[${new Date().toISOString()}] [FPP Command] Error:`, error);
    return NextResponse.json(
      { error: 'Failed to send command to FPP' },
      { status: 500 }
    );
  }
}
