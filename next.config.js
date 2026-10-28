/** @type {import('next').NextConfig} */
const nextConfig = {
  // Read allowed origins from environment variable, fallback to localhost
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS
    ? process.env.ALLOWED_DEV_ORIGINS.split(',')
    : ['localhost', '127.0.0.1'],
  
  experimental: {
    // Every `next build` starts clean. The persistent build cache (on by default since Next 16.3) has shipped
    // stale Tailwind CSS with newly added @theme colours missing, and the self-update builds on top of it.
    turbopackFileSystemCacheForBuild: false,
  },

  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    const baseHeaders = [
      // No Content-Security-Policy here: it lives in lib/csp.ts and proxy.ts sets it
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff'
      },
      {
        key: 'X-Frame-Options',
        value: 'DENY'
      },
      {
        key: 'X-XSS-Protection',
        value: '1; mode=block'
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin'
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(self)'
      }
    ];

    if (isProd) {
      baseHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload'
      });
    }

    return [
      {
        source: '/:path*',
        headers: baseHeaders
      },
      {
        // Shown in a frame on Settings → Jukebox; a later rule overrides the DENY above for this path only
        source: '/settings/jukebox/preview',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }]
      }
    ];
  }
};

module.exports = nextConfig;
