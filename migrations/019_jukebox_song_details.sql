-- Migration 019: Per-song details for the visitor jukebox catalog
-- duration_seconds comes from the FPP playlist item (filled by POST /api/jukebox/refresh-cache);
-- category is set by the admin (Settings → Jukebox → Song Details).
-- Kept separate from cached_sequences, which is cleared on every cache refresh.
-- lib/database.ts creates the same table at startup, so this must stay idempotent.

CREATE TABLE IF NOT EXISTS jukebox_song_details (
  sequence_name TEXT PRIMARY KEY,      -- bare sequence name (no .fseq), same key as cached_sequences
  duration_seconds REAL,               -- NULL = unknown
  category TEXT,                       -- NULL = uncategorised
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
