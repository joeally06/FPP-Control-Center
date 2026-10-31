import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { getFppUrl } from '@/lib/fpp-config';

const FPP_REQUEST_TIMEOUT = 10000; // 10 seconds

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  
  // Require admin authentication for ALL FPP API access
  try {
    await requireAdmin();
  } catch (error) {
    console.error('[Security] Unauthorized FPP API access attempt:', error);
    return NextResponse.json(
      { error: 'Unauthorized - Admin access required' },
      { status: 401 }
    );
  }
  
  const url = `${getFppUrl()}/api/fppd/${slug.join('/')}`;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FPP_REQUEST_TIMEOUT);

    const response = await fetch(url, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await response.text();
    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (error) {
    console.error('[FPPD Proxy] Error:', error instanceof Error ? error.message : String(error));

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { 
          error: 'FPP request timeout',
          offline: true,
          message: 'The FPP server is not responding. Please check if it is online.'
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { 
        error: `Failed to fetch from FPPD: ${error instanceof Error ? error.message : String(error)}`,
        offline: true,
        message: 'Unable to connect to FPP server. It may be offline or unreachable.'
      },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  
  // Require admin authentication for all POST requests
  try {
    await requireAdmin();
  } catch (error) {
    console.error('[Security] Unauthorized FPP API access attempt:', error);
    return NextResponse.json(
      { error: 'Unauthorized - Admin access required' },
      { status: 401 }
    );
  }
  
  const url = `${getFppUrl()}/api/fppd/${slug.join('/')}`;
  
  try {
    const body = await request.text();
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FPP_REQUEST_TIMEOUT);

    const response = await fetch(url, {
      method: 'POST',
      body,
      signal: controller.signal,
      headers: {
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
      },
    });

    clearTimeout(timeoutId);

    const data = await response.text();
    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (error) {
    console.error('[FPPD Proxy] POST Error:', error instanceof Error ? error.message : String(error));

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { 
          error: 'FPP request timeout',
          offline: true,
          message: 'The FPP server is not responding. Please check if it is online.'
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { 
        error: `Failed to fetch from FPPD: ${error instanceof Error ? error.message : String(error)}`,
        offline: true,
        message: 'Unable to connect to FPP server. It may be offline or unreachable.'
      },
      { status: 503 }
    );
  }
}
