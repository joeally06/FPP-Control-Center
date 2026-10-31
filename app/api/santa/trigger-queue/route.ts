// API Route to manually trigger queue processing
// Also serves as health check for the queue processor

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';

// Import the queue processor to ensure it's loaded
import '@/lib/santa-queue-processor';

export const dynamic = 'force-dynamic';

/**
 * GET /api/santa/trigger-queue
 * Manually trigger Santa letter queue processing
 * ADMIN ONLY - Manual queue trigger
 */
export async function GET() {
  try {
    await requireAdmin();
    
    // Forward to the actual processing endpoint with internal API key
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const internalKey = process.env.INTERNAL_API_KEY || 'default-internal-key';
    
    const response = await fetch(`${baseUrl}/api/santa/process-queue`, {
      method: 'GET',
      headers: {
        'x-internal-api-key': internalKey,
      },
    });

    const result = await response.json();

    return NextResponse.json({
      success: true,
      message: 'Manual queue processing triggered',
      result,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[Manual Queue Trigger] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  // Support both GET and POST for flexibility
  return GET();
}
