-- Seasonal logo and round badge uploaded on the Theme Settings page, one of each per theme.
-- Stored in the database (re-encoded to WebP) so they survive git pull / reset and stay out of the public repo.
-- lib/database.ts creates the same table at startup, because `next build` imports it before migrations run.
CREATE TABLE IF NOT EXISTS theme_assets (
  theme_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('logo', 'badge')),
  mime_type TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  data BLOB NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (theme_id, kind)
);
