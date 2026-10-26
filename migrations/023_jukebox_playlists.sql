-- Migration 023: FPP playlists visitors can request from the jukebox
-- Rows come from FPP on every song-cache refresh (POST /api/jukebox/refresh-cache);
-- theme is set by the admin (Settings → Jukebox → Playlists). NULL theme = hidden from visitors.
-- Visitors only see playlists tagged with the active theme.
-- lib/database.ts creates the same table at startup, so this must stay idempotent.
-- The jukebox_queue.request_kind and queue_processor_state.start_deadline columns are added by the
-- "add column if missing" loop in lib/database.ts, not here (ALTER TABLE ADD COLUMN is not idempotent).

CREATE TABLE IF NOT EXISTS jukebox_playlists (
  name TEXT PRIMARY KEY,                                   -- FPP playlist name
  theme TEXT CHECK (theme IN ('christmas', 'halloween')),  -- NULL = hidden
  item_count INTEGER NOT NULL DEFAULT 0,
  duration_seconds REAL,                                   -- NULL = unknown
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
