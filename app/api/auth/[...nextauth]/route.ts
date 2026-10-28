import NextAuth, { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import FacebookProvider from 'next-auth/providers/facebook';
import { JWT } from 'next-auth/jwt';
import { Session } from 'next-auth';
import { hashEmail, createSafeUserId } from '@/lib/privacy-utils';
import { SESSION } from '@/lib/constants';
import { isAdminEmail } from '@/lib/admin-emails';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    // FacebookProvider({
    //   clientId: process.env.FACEBOOK_CLIENT_ID!,
    //   clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
    // }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: SESSION.MAX_AGE_SECONDS, // 30 minutes
    updateAge: SESSION.UPDATE_AGE_SECONDS, // Refresh every 5 minutes of activity
  },
  // Cookie configuration - separate settings for production (HTTPS) and development (HTTP)
  cookies: process.env.NODE_ENV === 'production' ? {
    // Production: Use __Secure- prefix for HTTPS
    sessionToken: {
      name: '__Secure-next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: true
      }
    }
  } : {
    // Development: Use standard cookie name for HTTP (localhost)
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false
      }
    }
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      const isAdmin = isAdminEmail(user.email);
      
      // GDPR: Log login attempts with hashed email (no PII)
      console.log(`[AUTH] Login attempt:`, {
        userHash: createSafeUserId(user.email!, account?.provider),
        name: user.name,
        provider: account?.provider,
        isAdmin,
        timestamp: new Date().toISOString()
      });
      
      // Log admin logins separately for security monitoring
      if (isAdmin) {
        console.log(`[SECURITY] Admin login:`, {
          userHash: hashEmail(user.email!),
          provider: account?.provider,
          timestamp: new Date().toISOString()
        });
      }
      
      return true; // Allow all Google OAuth users
    },
    async jwt({ token, user }: { token: JWT; user?: any }) {
      // Add role to token
      if (user) {
        // Check if user email is in admin list
        const isAdmin = isAdminEmail(user.email);
        token.role = isAdmin ? 'admin' : 'user';
        
        // GDPR: Log non-admin authentication attempts with hashed email
        if (!isAdmin) {
          console.warn(`[SECURITY] Non-admin user authenticated:`, {
            userHash: hashEmail(user.email!),
            timestamp: new Date().toISOString()
          });
        }
      }
      return token;
    },
    async session({ session }: { session: Session }) {
      // Display-only role, worked out from the current ADMIN_EMAILS on every read so removing
      // an admin shows up at once. Server checks use isAdminSession()/requireAdmin().
      session.user.role = isAdminEmail(session.user?.email) ? 'admin' : 'user';
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
  debug: process.env.NODE_ENV === 'development',
};

const handler = NextAuth(authOptions);

/**
 * Validates NEXTAUTH_SECRET entropy and strength
 * @param secret - The secret to validate
 * @returns Object with validation result
 */
function validateSecretEntropy(secret: string): { valid: boolean; reason: string } {
  if (!secret || secret.length < 32) {
    return { valid: false, reason: 'Secret must be at least 32 characters' };
  }

  // Allow pure hex secrets (from openssl rand -hex 32) - they're cryptographically secure
  const isValidHex = /^[a-f0-9]{64,}$/i.test(secret);
  if (isValidHex) {
    return { valid: true, reason: 'Secret is valid (hex-encoded)' };
  }

  // Allow base64 secrets (from openssl rand -base64 32) - they're cryptographically secure
  const isValidBase64 = /^[A-Za-z0-9+/]{43,}={0,2}$/.test(secret);
  if (isValidBase64) {
    return { valid: true, reason: 'Secret is valid (base64-encoded)' };
  }

  // For other secrets, check for entropy - require multiple character classes
  const hasUppercase = /[A-Z]/.test(secret);
  const hasLowercase = /[a-z]/.test(secret);
  const hasNumbers = /[0-9]/.test(secret);
  const hasSpecialChars = /[^A-Za-z0-9]/.test(secret);

  const characterClasses = [hasUppercase, hasLowercase, hasNumbers, hasSpecialChars].filter(Boolean).length;

  if (characterClasses < 3) {
    return { 
      valid: false, 
      reason: 'Secret must contain at least 3 of: uppercase, lowercase, numbers, special characters' 
    };
  }

  // Check for obvious weak patterns
  const weakPatterns = [
    /^(.)\1+$/, // All same character
    /^(abc|123|password|secret|admin|test)/i, // Common weak prefixes
  ];

  for (const pattern of weakPatterns) {
    if (pattern.test(secret)) {
      return { valid: false, reason: 'Secret contains weak patterns (e.g., repetitive, dictionary words)' };
    }
  }

  return { valid: true, reason: 'Secret is strong' };
}

// CRITICAL SECURITY: Refuse to start in production without NEXTAUTH_SECRET
// Missing secret makes JWT tokens predictable and allows authentication bypass
if (process.env.NODE_ENV === 'production') {
  if (!process.env.NEXTAUTH_SECRET) {
    throw new Error(
      '[SECURITY] CRITICAL: NEXTAUTH_SECRET is REQUIRED in production. ' +
      'Set a strong random secret (32+ characters) to prevent authentication bypass. ' +
      'Generate one with: openssl rand -base64 32'
    );
  }

  // Validate secret entropy
  const validation = validateSecretEntropy(process.env.NEXTAUTH_SECRET);
  if (!validation.valid) {
    throw new Error(
      `[SECURITY] CRITICAL: NEXTAUTH_SECRET is too weak: ${validation.reason}. ` +
      'Generate a strong secret with: openssl rand -base64 32'
    );
  }
}

export { handler as GET, handler as POST };
