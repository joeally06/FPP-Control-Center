// Security Proxy - Add security headers and protection to all responses

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { isSameOriginRequest } from './lib/csrf';
import { isAdminEmail } from './lib/admin-emails';
import { CONTENT_SECURITY_POLICY, isFrameablePath } from './lib/csp';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CSRF Protection for API routes (except NextAuth)
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/')) {
    const method = request.method;
    
    // Only check state-changing methods
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      if (!isSameOriginRequest(request.headers, {
        nextAuthUrl: process.env.NEXTAUTH_URL,
        appUrl: process.env.NEXT_PUBLIC_APP_URL,
        trustedDomains: process.env.TRUSTED_DOMAINS,
      })) {
        console.warn('[SECURITY] CSRF detected:', {
          path: pathname,
          method,
          origin: request.headers.get('origin') || 'none',
          referer: request.headers.get('referer') || 'none',
          host: request.headers.get('host') || 'none',
          secFetchSite: request.headers.get('sec-fetch-site') || 'none',
          // Security: Prioritize cf-connecting-ip to prevent IP spoofing
          ip: request.headers.get('cf-connecting-ip') || 
              request.headers.get('x-forwarded-for') || 
              request.headers.get('x-real-ip') || 
              'unknown'
        });
        
        return NextResponse.json(
          { error: 'Invalid request origin' },
          { status: 403 }
        );
      }
    }
  }

  // Admin route protection
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/settings')) {
    const token = await getToken({ 
      req: request,
      secret: process.env.NEXTAUTH_SECRET 
    });

    if (!isAdminEmail(token?.email)) {
      const url = new URL('/api/auth/signin', request.url);
      url.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(url);
    }
  }

  const response = NextResponse.next();

  // ✅ SECURITY HEADERS
  
  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');
  
  // Prevent clickjacking. The two preview pages are shown in a frame on the settings pages (same origin only)
  response.headers.set('X-Frame-Options', isFrameablePath(pathname) ? 'SAMEORIGIN' : 'DENY');
  
  // Enable XSS protection
  response.headers.set('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy
  response.headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  
  // Permissions Policy (formerly Feature-Policy)
  // Allow geolocation for this domain only (required for voting/song requests)
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self)'
  );

  // Strict-Transport-Security (HSTS) - only when running on HTTPS in production
  const proto = request.headers.get('x-forwarded-proto') || request.headers.get('x-forwarded-protocol') || '';
  if (process.env.NODE_ENV === 'production' && proto.includes('https')) {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  return response;
}

// Configure which routes the middleware applies to
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
