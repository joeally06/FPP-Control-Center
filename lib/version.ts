/**
 * Version Management System
 * Follows Semantic Versioning (SemVer): MAJOR.MINOR.PATCH
 * 
 * MAJOR: Breaking changes that require manual intervention
 * MINOR: New features (backward compatible)
 * PATCH: Bug fixes (backward compatible)
 * PRERELEASE: Release candidates (rc.1, rc.2, etc.)
 */

export const APP_VERSION = {
  major: 2,
  minor: 0,
  patch: 0,
  prerelease: undefined, // Stable release
  build: null as string | null, // Git commit hash
};

export function getVersion(): string {
  const { major, minor, patch, prerelease, build } = APP_VERSION;
  
  let version = `${major}.${minor}.${patch}`;
  
  if (prerelease) {
    version += `-${prerelease}`;
  }
  
  if (build) {
    version += `+${build}`;
  }
  
  return version;
}

export function getVersionWithBuild(commitHash?: string): string {
  APP_VERSION.build = commitHash || null;
  return getVersion();
}

export function getVersionInfo() {
  return {
    version: getVersion(),
    major: APP_VERSION.major,
    minor: APP_VERSION.minor,
    patch: APP_VERSION.patch,
    prerelease: APP_VERSION.prerelease,
    build: APP_VERSION.build,
  };
}

// Version history and changelog
export const VERSION_HISTORY = [
  {
    version: '1.1.0',
    date: '2025-11-25',
    name: 'Visitor Audio Sync System',
    changes: [
      'Real-time audio playback synchronized with FPP light shows',
      'Server-Sent Events (SSE) architecture for efficient streaming',
      'Automatic audio file detection and smart matching (no manual mapping)',
      'AudioSyncPlayer component with Play/Pause/Stop controls',
      'Volume controls with mute functionality',
      'Admin Media Manager for downloading audio from FPP',
      'Playlist-based filtering for organized file management',
      'Smart sync logic with 10-second drift tolerance',
      'Eliminated audio skipping on periodic broadcasts',
      'Unified purple/blue gradient theme across jukebox and admin',
      'Auto-reconnect on disconnect with 5-second retry',
      'Position calculation with timestamp interpolation',
      'Support for MP3, WAV, OGG, M4A, FLAC, and AAC formats',
      'Multi-client broadcast support',
      'Connection status indicator with real-time updates',
    ],
  },
  {
    version: '1.0.4',
    date: '2025-11-23',
    name: 'Public Access & Rate Limiting Fixes',
    changes: [
      'Fixed Santa letter daily limit not respecting admin-configured values',
      'Added public endpoint for Santa settings (/api/santa/settings)',
      'Fixed jukebox sequences requiring admin authentication',
      'Public users can now browse cached songs without login',
      'Removed FPP refresh requirement for public jukebox access',
      'Admin-only manual cache refresh button in jukebox',
      'Database migration system improvements',
      'Added spotify_url column to sequence_metadata table',
      'Removed GitHub link from footer',
    ],
  },
  {
    version: '1.0.1-rc.3',
    date: '2025-11-09',
    name: 'Circuit Breaker & Resource Optimization Release',
    changes: [
      'Circuit Breaker pattern for intelligent FPP offline handling',
      'Resource-efficient polling - 83% reduction when FPP offline (10s → 60s)',
      'Auto-recovery testing every 60 seconds',
      'Admin dashboard Circuit Breaker widget with real-time status',
      'Health check API optimized (5000ms → 30ms using cached state)',
      'Queue processor respects circuit state (pauses when offline)',
      'Fixed environment variable loading in FPP poller (.env.local support)',
      'Fixed validation for FPP status responses (handles string numbers)',
      'Development workflow improvements (concurrently for Next.js + poller)',
      'Three-state circuit breaker (CLOSED/OPEN/HALF_OPEN)',
      'Persistent circuit state survives application restarts',
      'Event-driven architecture for circuit state changes',
      'Manual circuit reset capability for administrators',
      'Comprehensive circuit breaker test suite',
      '99.4% faster health checks when FPP offline',
    ],
  },
  {
    version: '1.0.1-rc.2',
    date: '2025-11-09',
    name: 'Performance & Architecture Release',
    changes: [
      'FPP state caching system - Backend polling eliminates redundant frontend requests',
      'Database normalization - Unified sequences table with foreign key constraints',
      'Spotify integration - "Listen on Spotify" links in jukebox Now Playing',
      'Auto-refresh Spotify URLs - Metadata updates on Media Library changes',
      'Bulk URL refresh button in Media Library',
      'PM2 dual-process architecture (Next.js + FPP poller)',
      'Stale data indicators in jukebox UI (30s threshold)',
      'Health monitoring view for FPP polling service',
      'Exponential backoff on FPP connection failures',
      'Zero-data-loss migrations with comprehensive validation',
      'Sub-millisecond cached status API responses',
      'Prepared statements for all FPP operations',
    ],
  },
  {
    version: '1.0.0-rc.1',
    date: '2025-11-05',
    name: 'Initial Release Candidate',
    changes: [
      'Complete jukebox system with FPP integration',
      'Admin dashboard with real-time monitoring',
      'Device health monitoring with email alerts',
      'Santa letter system with AI-powered responses (Ollama)',
      'Cookie consent banner (GDPR/CCPA compliant)',
      'Comprehensive privacy policy page',
      'Secure Google OAuth authentication',
      'Real-time update system with status tracking',
      'Automated database maintenance (daily/weekly)',
      'Theme customization system',
      'Models library with import/export',
      'Cloudflare Tunnel support for public HTTPS',
      'Rate limiting on all public endpoints',
      'Session-based admin authentication',
      'Security hardening (CSRF, XSS, SQL injection prevention)',
    ],
  },
];
