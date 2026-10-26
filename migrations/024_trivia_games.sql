-- Solo trivia: each visitor plays their own self-paced game on their phone.
-- One row per game. The phone holds only the random token; the server keeps the
-- question order, the clock and the score, so a client can't fake a result.
-- Abandoned games keep finished_at NULL and never reach the leaderboard.
-- The old shared-game tables from 018 (trivia_sessions/players/answers) are left untouched.
-- lib/database.ts creates the same table and indexes at startup, so this must stay idempotent.

CREATE TABLE IF NOT EXISTS trivia_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,              -- random secret held by the phone
  display_name TEXT NOT NULL,
  question_ids TEXT NOT NULL,              -- JSON array, drawn at random when the game starts
  seconds_per_question INTEGER NOT NULL,
  current_index INTEGER NOT NULL DEFAULT 0,
  question_started_at TEXT,                -- ISO; NULL until the current question is served
  score INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  finished_at TEXT,                        -- 'YYYY-MM-DD HH:MM:SS' UTC; NULL while in progress or abandoned
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trivia_games_ip ON trivia_games(ip_address, created_at);
CREATE INDEX IF NOT EXISTS idx_trivia_games_finished ON trivia_games(finished_at, score);

-- Game settings (Settings -> Trivia -> Game); ranges are enforced by PUT /api/settings
INSERT OR IGNORE INTO settings (key, value, description, category) VALUES
  ('trivia_questions_per_game', '10', 'Questions in each trivia game', 'trivia'),
  ('trivia_seconds_per_question', '20', 'Seconds a visitor has to answer each trivia question', 'trivia');
