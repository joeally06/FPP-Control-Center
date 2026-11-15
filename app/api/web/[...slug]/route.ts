import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { getFppUrl, fetchFpp } from '@/lib/fpp-config';

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  
  // Require admin authentication for ALL FPP web API access
  try {
    await requireAdmin();
  } catch (error) {
    console.error('[Security] Unauthorized FPP web API access attempt:', error);
    return NextResponse.json(
      { error: 'Unauthorized - Admin access required' },
      { status: 401 }
    );
  }
  
  // SECURITY: Validate slug for path traversal
  if (slug.some(segment => segment.includes('..') || segment.includes('%2e%2e'))) {
    console.error('[Security] Path traversal attempt blocked:', slug);
    return NextResponse.json(
      { error: 'Invalid path' },
      { status: 400 }
    );
  }
  
  const url = `${getFppUrl()}/api/${slug.map(encodeURIComponent).join('/')}`;
  try {
    const response = await fetchFpp(url);
    const data = await response.text();
    console.log('FPP API call:', url, 'status:', response.status);
    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (error) {
    console.error('Error fetching from FPP web API:', error);
    return NextResponse.json({ error: `Failed to fetch from FPP web API: ${error instanceof Error ? error.message : 'Unknown error'}` }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  
  // Require admin authentication for all POST requests (control commands)
  try {
    await requireAdmin();
  } catch (error) {
    console.error('[Security] Unauthorized FPP web API access attempt:', error);
    return NextResponse.json(
      { error: 'Unauthorized - Admin access required' },
      { status: 401 }
    );
  }
  
  // SECURITY: Validate slug for path traversal
  if (slug.some(segment => segment.includes('..') || segment.includes('%2e%2e'))) {
    console.error('[Security] Path traversal attempt blocked:', slug);
    return NextResponse.json(
      { error: 'Invalid path' },
      { status: 400 }
    );
  }
  
  const url = `${getFppUrl()}/api/${slug.map(encodeURIComponent).join('/')}`;
  try {
    const body = await request.text();
    const response = await fetchFpp(url, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
      },
    });
    const data = await response.text();
    console.log('FPP API call:', url, 'status:', response.status);
    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (error) {
    console.error('Error fetching from FPP web API:', error);
    return NextResponse.json({ error: `Failed to fetch from FPP web API: ${error instanceof Error ? error.message : 'Unknown error'}` }, { status: 500 });
  }
}
