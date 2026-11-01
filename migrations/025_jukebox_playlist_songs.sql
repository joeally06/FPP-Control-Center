-- Migration 025: which songs each FPP playlist holds
-- Rows come from FPP on every song-cache refresh (POST /api/jukebox/refresh-cache), next to jukebox_playlists.
-- Visitors see only the songs of the playlists tagged with the active theme (see migration 023).
-- lib/db-schema.ts creates the same table at startup, so this must stay idempotent.

CREATE TABLE IF NOT EXISTS jukebox_playlist_songs (
  playlist_name TEXT NOT NULL,   -- FPP playlist name (jukebox_playlists.name)
  position INTEGER NOT NULL,     -- play order within the playlist
  sequence_name TEXT NOT NULL,   -- sequence name without .fseq
  PRIMARY KEY (playlist_name, position)
);
