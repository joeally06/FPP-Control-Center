import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { NextRequest } from 'next/server';
import { getClientIP } from './rate-limit';
import { RATE_LIMIT } from './constants';
import { isAdminEmail } from './admin-emails';

// Admin rate limiting - in-memory store (resets on server restart)
// Key: "email:ip", Value: { count, timestamp }
const adminRateLimitStore = new Map<string, { count: number; timestamp: number }>();

// Rate limit configuration for admin routes
const ADMIN_RATE_LIMIT = {
  windowMs: RATE_LIMIT.ADMIN_WINDOW_MS, // 1 minute
  maxRequests: RATE_LIMIT.ADMIN_MAX_REQUESTS // 100 requests per minute per admin
};

/**
 * Requires admin authentication with rate limiting for API routes
 * 
 * SECURITY: 
 * - Re-verifies admin status from ADMIN_EMAILS environment variable
 * - Does NOT trust the role claim in JWT
 * - Rate limits admin requests to prevent DoS (100 req/min per admin)
 * 
 * @param request - NextRequest object for rate limiting (optional)
 * @throws Error if user is not authenticated, not an admin, or rate limited
 * @returns The authenticated session
 */
export async function requireAdminWithRateLimit(request?: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    throw new Error('Authentication required');
  }
  
  if (!session.user?.email) {
    throw new Error('User email not found in session');
  }
  
  // SECURITY: Always verify admin status from environment variable
  // NEVER trust the role claim from JWT as it could be tampered with
  const userEmail = session.user.email.toLowerCase();
  
  if (!isAdminEmail(userEmail)) {
    console.error(`[Security] Unauthorized admin access attempt by: ${session.user.email}`);
    throw new Error('Admin access required');
  }
  
  // SECURITY: Rate limit admin requests
  if (request) {
    const ip = getClientIP(request);
    const now = Date.now();
    const key = `${userEmail}:${ip}`;
    
    // Clean up old entries (older than window)
    for (const [entryKey, data] of adminRateLimitStore.entries()) {
      if (now - data.timestamp > ADMIN_RATE_LIMIT.windowMs) {
        adminRateLimitStore.delete(entryKey);
      }
    }
    
    // Get or create rate limit entry
    const rateLimitData = adminRateLimitStore.get(key) || { count: 0, timestamp: now };
    
    // Check if within rate limit window
    if (now - rateLimitData.timestamp < ADMIN_RATE_LIMIT.windowMs) {
      if (rateLimitData.count >= ADMIN_RATE_LIMIT.maxRequests) {
        console.warn(`[Security] Admin rate limit exceeded: ${userEmail} from ${ip}`);
        throw new Error('Rate limit exceeded. Please slow down your requests.');
      }
      // Increment count
      rateLimitData.count++;
    } else {
      // Reset window
      rateLimitData.count = 1;
      rateLimitData.timestamp = now;
    }
    
    adminRateLimitStore.set(key, rateLimitData);
  }
  
  // Log successful admin access for audit trail
  console.log(`[Security] Admin access granted to: ${session.user.email}`);
  
  return session;
}

/**
 * Requires admin authentication for API routes (no rate limiting; pass the request to
 * requireAdminWithRateLimit() for that)
 * 
 * SECURITY: Re-verifies admin status from ADMIN_EMAILS environment variable
 * Does NOT trust the role claim in JWT - verifies against server-side source of truth
 * 
 * @throws Error if user is not authenticated or not an admin
 * @returns The authenticated session
 */
export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    throw new Error('Authentication required');
  }
  
  if (!session.user?.email) {
    throw new Error('User email not found in session');
  }
  
  // SECURITY: Always verify admin status from environment variable
  // NEVER trust the role claim from JWT as it could be tampered with
  const userEmail = session.user.email.toLowerCase();
  
  if (!isAdminEmail(userEmail)) {
    console.error(`[Security] Unauthorized admin access attempt by: ${session.user.email}`);
    throw new Error('Admin access required');
  }
  
  // Log successful admin access for audit trail
  console.log(`[Security] Admin access granted to: ${session.user.email}`);
  
  return session;
}

/**
 * Gets the current session without requiring authentication
 * Useful for optional authentication checks
 * @returns The session or null if not authenticated
 */
export async function getSession() {
  return await getServerSession(authOptions);
}

/**
 * Checks if the current user is an admin
 * 
 * SECURITY: Verifies against ADMIN_EMAILS environment variable, not JWT role
 * 
 * @returns true if user is admin, false otherwise
 */
export async function isAdmin() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    return false;
  }
  
  // SECURITY: Verify admin status from environment variable
  return isAdminEmail(session.user.email);
}

/**
 * For routes that already hold a session: is this session's user in ADMIN_EMAILS?
 * Checks the env list, not the role stored in the JWT.
 */
export function isAdminSession(session: { user?: { email?: string | null } | null } | null | undefined): boolean {
  return isAdminEmail(session?.user?.email);
}
