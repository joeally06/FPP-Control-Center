/**
 * FPP State Polling Service with Circuit Breaker
 * 
 * Background service that polls FPP device periodically and caches
 * the state in the database for efficient frontend queries.
 * 
 * CIRCUIT BREAKER INTEGRATION:
 * - Automatically pauses polling when FPP is offline (saves resources)
 * - Reduces poll interval from 10s → 60s when circuit is OPEN
 * - Tests recovery automatically after configured timeout
 * - Resumes normal operation when FPP comes back online
 * 
 * SECURITY FEATURES:
 * - Input validation on all FPP responses
 * - Circuit breaker prevents resource exhaustion
 * - Graceful error handling
 * - Database transaction safety
 * 
 * Run standalone: node -r esbuild-register lib/fpp-poller.ts
 * Run with PM2: pm2 start ecosystem.config.js --only fpp-poller
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from 'dotenv';
import { getCircuitBreaker, CircuitState } from './circuit-breaker';
import { getFppHost, getFppPort, FPP_DEFAULTS } from './fpp-config';
import { POLLER } from './constants';
import { nextPollDelay } from './poll-timing';
import { markFppOffline } from './fpp-state';
import { getVotesDbPath } from './db-path';

// Load environment variables from .env.local
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  config({ path: envPath });
  console.log('[FPP Poller] Loaded environment from .env.local');
}

// ============================================================================
// Configuration
// ============================================================================

const FPP_HOST = process.env.FPP_HOST || getFppHost();
const FPP_PORT = process.env.FPP_PORT || '80';
const POLL_INTERVAL = parseInt(process.env.FPP_POLL_INTERVAL || String(POLLER.DEFAULT_INTERVAL));
const MIN_POLL_INTERVAL = POLLER.MIN_INTERVAL;
const MAX_POLL_INTERVAL = POLLER.MAX_INTERVAL;
const RETRY_BACKOFF_MULTIPLIER = 1.5; // Exponential backoff
const MAX_CONSECUTIVE_FAILURES = 10; // Max failures before longer backoff

console.log('[FPP Poller] Starting FPP State Polling Service');
console.log(`[FPP Poller] Target: http://${FPP_HOST}:${FPP_PORT}`);
console.log(`[FPP Poller] Poll Interval: ${POLL_INTERVAL}ms`);

// ============================================================================
// Circuit Breaker Setup
// ============================================================================

const circuitBreaker = getCircuitBreaker();

// Listen to circuit state changes
circuitBreaker.on('stateChange', (newState: CircuitState, previousState: CircuitState) => {
  if (newState === CircuitState.OPEN) {
    console.log('[FPP Poller] 🛑 Circuit OPEN - Pausing aggressive polling');
    console.log('[FPP Poller] Poll interval increased to 60s to save resources');
    currentPollInterval = MAX_POLL_INTERVAL; // 60 seconds
  } else if (newState === CircuitState.HALF_OPEN) {
    console.log('[FPP Poller] 🔄 Circuit HALF_OPEN - Testing recovery');
  } else if (newState === CircuitState.CLOSED) {
    console.log('[FPP Poller] ✅ Circuit CLOSED - Normal operations resumed');
    console.log('[FPP Poller] Poll interval restored to 10s');
    currentPollInterval = POLL_INTERVAL; // 10 seconds
    consecutiveFailures = 0;
  }
});

// Log initial circuit state
console.log(`[FPP Poller] Circuit Breaker: ${circuitBreaker.getState()}`);
const initialStats = circuitBreaker.getStats();
if (initialStats.state === CircuitState.OPEN && initialStats.nextRetryIn !== null) {
  console.log(`[FPP Poller] FPP offline - next retry in ${Math.ceil(initialStats.nextRetryIn / 1000)}s`);
}


// ============================================================================
// Database Setup
// ============================================================================

const dbPath = getVotesDbPath();
let db: Database.Database;

try {
  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  console.log('[FPP Poller] Database connected');
} catch (error: any) {
  console.error('[FPP Poller] FATAL: Could not connect to database:', error.message);
  process.exit(1);
}

// ============================================================================
// Prepared Statements
// ============================================================================

const updateState = db.prepare(`
  UPDATE fpp_state 
  SET status = ?,
      current_sequence = ?,
      current_playlist = ?,
      current_playlist_index = ?,
      current_playlist_count = ?,
      seconds_played = ?,
      seconds_remaining = ?,
      volume = ?,
      mode = ?,
      uptime = ?,
      last_updated = CURRENT_TIMESTAMP,
      last_poll_success = 1,
      last_error = NULL,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = 1
`);

const updateStateError = db.prepare(`
  UPDATE fpp_state 
  SET last_poll_success = 0,
      last_error = ?,
      last_updated = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = 1
`);

const logPoll = db.prepare(`
  INSERT INTO fpp_poll_log (success, response_time_ms, error_message, status, current_sequence, consecutive_failures)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const updatePlaylist = db.prepare(`
  INSERT INTO fpp_cached_playlists (name, sequence_count, is_active, last_synced, updated_at)
  VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT(name) DO UPDATE SET
    sequence_count = excluded.sequence_count,
    is_active = excluded.is_active,
    last_synced = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
`);

const clearActiveFlags = db.prepare(`
  UPDATE fpp_cached_playlists SET is_active = 0
`);

const deletePlaylistSequences = db.prepare(`
  DELETE FROM fpp_cached_playlist_sequences WHERE playlist_name = ?
`);

const insertSequence = db.prepare(`
  INSERT INTO fpp_cached_playlist_sequences 
  (playlist_name, sequence_name, position, duration, enabled, last_synced)
  VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

// ============================================================================
// NEW: Security Cache - Prepared Statements for fpp_status_cache and cached_playlists
// ============================================================================

const insertFPPStatus = db.prepare(`
  INSERT INTO fpp_status_cache (
    status_name, current_playlist, current_sequence,
    seconds_played, seconds_remaining, time_elapsed, time_remaining,
    volume, mode_name, scheduler_status, next_playlist, raw_data
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const cleanupOldFPPStatus = db.prepare(`
  DELETE FROM fpp_status_cache 
  WHERE id NOT IN (
    SELECT id FROM fpp_status_cache 
    ORDER BY updated_at DESC 
    LIMIT 100
  )
`);

// Note: We INSERT new records instead of UPSERT because cached_playlists
// uses a partial unique index (name + recent cached_at), not a full UNIQUE constraint
const insertCachedPlaylist = db.prepare(`
  INSERT INTO cached_playlists (name, data)
  VALUES (?, ?)
`);

const cleanupOldCachedPlaylists = db.prepare(`
  DELETE FROM cached_playlists 
  WHERE cached_at < datetime('now', '-5 minutes')
`);

// ============================================================================
// State Management
// ============================================================================

let consecutiveFailures = 0;
let currentPollInterval = POLL_INTERVAL;
let isPolling = false;
// Seconds left in the song FPP was playing at the last successful poll (null when not playing)
let playingSecondsRemaining: number | null = null;

// ============================================================================
// Input Validation & Sanitization
// ============================================================================

/**
 * Validate and sanitize FPP status response
 * SECURITY: Prevent injection attacks via malicious FPP responses
 */
function validateFPPStatus(data: any): boolean {
  if (!data || typeof data !== 'object') return false;
  
  // Validate status_name
  const validStatuses = ['idle', 'playing', 'stopped', 'testing', 'unknown'];
  if (data.status_name && !validStatuses.includes(data.status_name)) {
    console.warn('[FPP Poller] Invalid status_name:', data.status_name);
    return false;
  }
  
  // Validate numeric fields
  if (data.volume !== undefined && (typeof data.volume !== 'number' || data.volume < 0 || data.volume > 100)) {
    console.warn('[FPP Poller] Invalid volume:', data.volume);
    return false;
  }
  
  // seconds_played can be number, string number, or missing when idle
  if (data.seconds_played !== undefined && data.seconds_played !== null) {
    const secondsNum = typeof data.seconds_played === 'string' ? parseFloat(data.seconds_played) : data.seconds_played;
    if (typeof secondsNum !== 'number' || isNaN(secondsNum)) {
      console.warn('[FPP Poller] Invalid seconds_played:', data.seconds_played);
      return false;
    }
  }
  
  return true;
}

/**
 * Sanitize string input to prevent SQL injection
 * (Belt-and-suspenders approach - prepared statements already protect us)
 */
function sanitizeString(input: any): string | null {
  if (!input) return null;
  if (typeof input !== 'string') return String(input).substring(0, 255);
  
  // Remove any null bytes and limit length
  return input.replace(/\0/g, '').substring(0, 255);
}

// ============================================================================
// FPP API Communication
// ============================================================================

/**
 * Fetch FPP status from device with timeout and error handling
 * SECURITY: Timeout prevents hanging on slow/malicious responses
 */
async function fetchFPPStatus(): Promise<{ success: boolean; data?: any; error?: string; responseTime: number }> {
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), POLLER.TIMEOUT);
    
    const url = `http://${FPP_HOST}:${FPP_PORT}/api/fppd/status`;
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'FPP-Control-Center-Poller/1.0'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const responseTime = Date.now() - startTime;

    // Validate response before accepting it
    if (!validateFPPStatus(data)) {
      throw new Error('Invalid FPP status response format');
    }

    return { success: true, data, responseTime };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error.name === 'AbortError' 
      ? 'Request timeout (5s)' 
      : error.message || 'Unknown error';
    
    return { 
      success: false, 
      error: errorMessage, 
      responseTime 
    };
  }
}

/**
 * Fetch playlist details from FPP (optional, for caching sequences)
 */
async function fetchPlaylistDetails(playlistName: string): Promise<any | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), POLLER.TIMEOUT);
    
    const url = `http://${FPP_HOST}:${FPP_PORT}/api/playlist/${encodeURIComponent(playlistName)}`;
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    return null;
  }
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Update database with FPP state
 * Uses transactions for atomic updates
 * SECURITY: Now also caches to fpp_status table for frontend API consumption
 */
function updateDatabase(status: any, responseTime: number): void {
  try {
    // Normalize numeric fields that might be strings
    const secondsPlayed = typeof status.seconds_played === 'string' ? parseFloat(status.seconds_played) : status.seconds_played;
    const secondsRemaining = typeof status.seconds_remaining === 'string' ? parseFloat(status.seconds_remaining) : status.seconds_remaining;
    const timeElapsed = typeof status.time_elapsed === 'string' ? status.time_elapsed : null;
    const timeRemaining = typeof status.time_remaining === 'string' ? status.time_remaining : null;
    
    // Start transaction for atomic update
    const transaction = db.transaction(() => {
      // Update FPP state (existing table)
      updateState.run(
        sanitizeString(status.status_name) || 'unknown',
        sanitizeString(status.current_sequence) || null,
        sanitizeString(status.current_playlist?.playlist) || null,
        status.current_playlist?.index ?? null,
        status.current_playlist?.count ?? null,
        secondsPlayed ?? 0,
        secondsRemaining ?? 0,
        status.volume ?? 0,
        sanitizeString(status.mode_name) || 'player',
        status.uptime ?? 0
      );

      // ✅ NEW: Insert into fpp_status_cache (for secure frontend API)
      insertFPPStatus.run(
        sanitizeString(status.status_name) || 'unknown',
        sanitizeString(status.current_playlist?.playlist) || null,
        sanitizeString(status.current_sequence) || null,
        secondsPlayed ?? 0,
        secondsRemaining ?? 0,
        timeElapsed,
        timeRemaining,
        status.volume ?? 0,
        sanitizeString(status.mode_name) || 'player',
        status.scheduler?.status || null,
        status.scheduler?.nextPlaylist?.playlistName || null,
        JSON.stringify(status) // Store full response for debugging
      );

      // Log successful poll
      logPoll.run(
        1, // success
        responseTime,
        null,
        sanitizeString(status.status_name) || 'unknown',
        sanitizeString(status.current_sequence) || null,
        0 // reset consecutive failures
      );

      // Update active playlist
      if (status.current_playlist?.playlist) {
        clearActiveFlags.run();
        updatePlaylist.run(
          sanitizeString(status.current_playlist.playlist),
          status.current_playlist.count || 0,
          1 // is_active
        );
      } else {
        clearActiveFlags.run();
      }

      // ✅ NEW: Cleanup old fpp_status_cache records (keep last 100)
      cleanupOldFPPStatus.run();
    });

    // Execute transaction
    transaction();

    // Reset failure counter on success
    consecutiveFailures = 0;
    currentPollInterval = POLL_INTERVAL;
    playingSecondsRemaining = status.status_name === 'playing' && Number.isFinite(secondsRemaining) ? secondsRemaining : null;

    // ✅ CIRCUIT BREAKER: Record success
    circuitBreaker.recordSuccess();

    console.log(`[FPP Poller] ✓ Updated state: ${status.status_name} | ${status.current_sequence || 'idle'} (${responseTime}ms)`);

    // Async: Fetch and cache playlist details (don't block polling)
    if (status.current_playlist?.playlist) {
      fetchPlaylistDetails(status.current_playlist.playlist)
        .then(details => {
          if (details?.mainPlaylist) {
            syncPlaylistSequences(status.current_playlist.playlist, details.mainPlaylist);
            
            // ✅ NEW: Cache full playlist data for frontend API
            cachePlaylistData(status.current_playlist.playlist, details);
          }
        })
        .catch(err => {
          console.error('[FPP Poller] Failed to fetch playlist details:', err.message);
        });
    }

    // ✅ NEW: Periodic cleanup of old cached playlists (every 10th poll ≈ 100 seconds)
    if (Math.random() < 0.1) {
      try {
        cleanupOldCachedPlaylists.run();
      } catch (err: any) {
        console.error('[FPP Poller] Playlist cache cleanup error:', err.message);
      }
    }
  } catch (error: any) {
    console.error('[FPP Poller] Database update error:', error.message);
    // Don't crash - log and continue
  }
}

/**
 * Sync playlist sequences to database
 */
function syncPlaylistSequences(playlistName: string, sequences: any[]): void {
  try {
    const transaction = db.transaction(() => {
      // Clear existing sequences
      deletePlaylistSequences.run(playlistName);

      // Insert updated sequences
      sequences.forEach((seq, index) => {
        insertSequence.run(
          playlistName,
          sanitizeString(seq.sequenceName || seq.playlistName),
          index,
          seq.duration || null,
          seq.enabled !== false ? 1 : 0
        );
      });
    });

    transaction();
    console.log(`[FPP Poller] ✓ Synced ${sequences.length} sequences for playlist: ${playlistName}`);
  } catch (error: any) {
    console.error('[FPP Poller] Sequence sync error:', error.message);
  }
}

/**
 * ✅ NEW: Cache playlist data for frontend API consumption
 * SECURITY: Stores playlist JSON for secure backend API access
 */
function cachePlaylistData(playlistName: string, data: any): void {
  try {
    insertCachedPlaylist.run(
      playlistName,
      JSON.stringify(data)
    );
    console.log(`[FPP Poller] ✓ Cached playlist data: ${playlistName}`);
  } catch (error: any) {
    console.error('[FPP Poller] Playlist cache error:', error.message);
  }
}

/**
 * Handle polling error with exponential backoff
 */
function handleError(error: string, responseTime: number): void {
  try {
    consecutiveFailures++;
    playingSecondsRemaining = null;

    // ✅ CIRCUIT BREAKER: Record failure
    circuitBreaker.recordFailure(error);

    const transaction = db.transaction(() => {
      updateStateError.run(sanitizeString(error));
      logPoll.run(
        0, // failed
        responseTime,
        sanitizeString(error),
        null,
        null,
        consecutiveFailures
      );
    });

    transaction();

    // Circuit breaker handles poll interval adjustments
    const cbState = circuitBreaker.getState();
    
    if (cbState === CircuitState.OPEN) {
      // FPP is down, not just slow: stop showing the last song as still playing
      markFppOffline(db);
      // Circuit is OPEN - minimal polling to save resources
      currentPollInterval = MAX_POLL_INTERVAL; // 60 seconds
      const stats = circuitBreaker.getStats();
      if (stats.nextRetryIn !== null) {
        console.error(`[FPP Poller] ⚠️  FPP offline - next retry in ${Math.ceil(stats.nextRetryIn / 1000)}s`);
      }
    } else if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      // Exponential backoff for repeated failures (circuit still CLOSED)
      currentPollInterval = Math.min(
        POLL_INTERVAL * Math.pow(RETRY_BACKOFF_MULTIPLIER, consecutiveFailures - MAX_CONSECUTIVE_FAILURES),
        MAX_POLL_INTERVAL
      );
      console.error(`[FPP Poller] ✗ ${consecutiveFailures} failures - backing off to ${currentPollInterval}ms`);
    } else {
      console.error(`[FPP Poller] ✗ Poll failed: ${error} (${responseTime}ms) [${consecutiveFailures} consecutive failures]`);
    }
  } catch (err: any) {
    console.error('[FPP Poller] Failed to log error:', err.message);
  }
}

// ============================================================================
// Main Polling Loop
// ============================================================================

/**
 * Main polling loop with error recovery
 */
async function pollLoop(): Promise<void> {
  while (true) {
    // ✅ CIRCUIT BREAKER: Check if request is allowed
    if (!circuitBreaker.allowRequest()) {
      const stats = circuitBreaker.getStats();
      if (stats.nextRetryIn !== null) {
        // Only log every 30 seconds to avoid spam
        if (Math.floor(stats.nextRetryIn / 30000) !== Math.floor((stats.nextRetryIn + currentPollInterval) / 30000)) {
          console.log(`[FPP Poller] 🛑 Circuit OPEN - skipping poll (retry in ${Math.ceil(stats.nextRetryIn / 1000)}s)`);
        }
      }
      await sleep(currentPollInterval);
      continue;
    }

    if (isPolling) {
      console.warn('[FPP Poller] Previous poll still running, skipping...');
      await sleep(currentPollInterval);
      continue;
    }

    isPolling = true;

    try {
      const result = await fetchFPPStatus();

      if (result.success && result.data) {
        updateDatabase(result.data, result.responseTime);
      } else {
        handleError(result.error || 'Unknown error', result.responseTime);
      }
    } catch (error: any) {
      console.error('[FPP Poller] Unexpected error:', error.message);
      handleError(error.message, 0);
    } finally {
      isPolling = false;
    }

    // Check again just after the current song ends if that is sooner, so the next song shows up right away
    await sleep(nextPollDelay(currentPollInterval, playingSecondsRemaining));
  }
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

function shutdown(signal: string): void {
  console.log(`\n[FPP Poller] Received ${signal}, shutting down gracefully...`);
  
  try {
    // Close circuit breaker first (persists state)
    if (circuitBreaker) {
      circuitBreaker.close();
      console.log('[FPP Poller] Circuit breaker closed');
    }
    
    if (db) {
      db.close();
      console.log('[FPP Poller] Database closed');
    }
  } catch (error: any) {
    console.error('[FPP Poller] Error during shutdown:', error.message);
  }
  
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  console.error('[FPP Poller] Uncaught exception:', error);
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason) => {
  console.error('[FPP Poller] Unhandled rejection:', reason);
  shutdown('UNHANDLED_REJECTION');
});

// ============================================================================
// Utilities
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Start Service
// ============================================================================

console.log('[FPP Poller] Service initialized, starting polling loop...\n');

pollLoop().catch(error => {
  console.error('[FPP Poller] Fatal error in poll loop:', error);
  shutdown('FATAL_ERROR');
});
