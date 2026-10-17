-- Santa letters: the parent confirms their email address before Santa's reply is sent.
-- One row per letter submitted after this feature; letters without a row are answered as before.
-- Only the SHA-256 of the emailed token is stored.
CREATE TABLE IF NOT EXISTS santa_letter_confirmations (
  letter_id INTEGER PRIMARY KEY REFERENCES santa_letters(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  confirmed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Maximum letters accepted per day from all visitors together
INSERT OR IGNORE INTO settings (key, value, description, category) VALUES
  ('santa_daily_cap', '50', 'Maximum Santa letters accepted per day from all visitors', 'santa');
