-- Real-Time Christmas Trivia
-- Question bank, sessions (one "active" at a time), players, and answers.

CREATE TABLE IF NOT EXISTS trivia_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL DEFAULT 'General',
  question_text TEXT NOT NULL,
  choices TEXT NOT NULL,               -- JSON array of 2-6 strings
  correct_index INTEGER NOT NULL,
  points INTEGER NOT NULL DEFAULT 1000,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trivia_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'ended')),
  question_ids TEXT NOT NULL DEFAULT '[]',   -- JSON array snapshot of ordered question IDs
  current_index INTEGER NOT NULL DEFAULT -1,
  phase TEXT NOT NULL DEFAULT 'lobby' CHECK (phase IN ('lobby', 'question', 'reveal', 'ended')),
  question_started_at TEXT,
  question_ends_at TEXT,
  seconds_per_question INTEGER NOT NULL DEFAULT 20,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trivia_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  client_token TEXT NOT NULL,
  display_name TEXT NOT NULL,
  ip_address TEXT,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, client_token)
);

CREATE TABLE IF NOT EXISTS trivia_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  client_token TEXT NOT NULL,
  choice_index INTEGER NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0,
  answer_ms INTEGER NOT NULL DEFAULT 0,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, question_id, client_token)
);

CREATE INDEX IF NOT EXISTS idx_trivia_players_session ON trivia_players(session_id);
CREATE INDEX IF NOT EXISTS idx_trivia_players_ip ON trivia_players(ip_address, joined_at);
CREATE INDEX IF NOT EXISTS idx_trivia_answers_leaderboard ON trivia_answers(session_id, client_token);
CREATE INDEX IF NOT EXISTS idx_trivia_answers_question ON trivia_answers(session_id, question_id);
CREATE INDEX IF NOT EXISTS idx_trivia_answers_ip ON trivia_answers(ip_address, created_at);
CREATE INDEX IF NOT EXISTS idx_trivia_sessions_status ON trivia_sessions(status);
