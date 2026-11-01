-- Migration 026: pictures uploaded for a song in a playlist, and per-playlist song details
-- Settings -> Jukebox -> Songs lets the admin pick a playlist and give each of its songs its own title, artist,
-- album and picture. Uploads are re-encoded to a square WebP and stored here (like theme_assets, migration 021).
-- The columns title, artist, album, art_url and art_id on jukebox_playlist_songs (migration 025) are added by the
-- "add column if missing" loop in lib/db-schema.ts, not here (ALTER TABLE ADD COLUMN is not idempotent).
-- lib/db-schema.ts creates the same table at startup, so this must stay idempotent.

CREATE TABLE IF NOT EXISTS jukebox_song_art (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mime_type TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  data BLOB NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
