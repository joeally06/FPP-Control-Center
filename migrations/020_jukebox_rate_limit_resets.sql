-- Migration 020: Remember when an admin cleared a visitor's song-request limit
-- Requests made before reset_at no longer count toward that visitor's hourly limit
-- (Settings > Jukebox > User Rate Limits > Clear). One row per IP, updated on each clear.
-- lib/database.ts creates the same table at startup, so this must stay idempotent.

CREATE TABLE IF NOT EXISTS jukebox_rate_limit_resets (
  requester_ip TEXT PRIMARY KEY,
  reset_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP   -- UTC, same format as jukebox_queue.created_at
);
