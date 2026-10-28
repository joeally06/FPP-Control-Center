import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { getVotesDbPath } from './db-path';

export async function runMigrations(opts: { dbPath?: string, backup?: boolean, backupDir?: string } = {}) {
  // Support override via environment variable for testing purposes
  const envDbPath = process.env.MOCK_DB_PATH;
  const dbPath = opts.dbPath || envDbPath || getVotesDbPath();

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found: ${dbPath}`);
  }

  if (opts.backup) {
    // Create backups directory
    const backupsDir = opts.backupDir || path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

    const now = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupsDir, `${now}_votes.db.backup`);
    // A consistent snapshot; copying the file alone would miss what is still in the WAL
    const source = new Database(dbPath);
    try {
      source.prepare('VACUUM INTO ?').run(backupFile);
    } finally {
      source.close();
    }
    console.log(`🔒 Backup created: ${backupFile}`);
  }

  const db = new Database(dbPath);

  try {
    const tableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='game_scores'`).get();

    if (tableExists) {
      console.log('✅ game_scores table already exists');
      return { status: 'skipped', message: 'already_exists' };
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS game_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_name TEXT NOT NULL DEFAULT 'Anonymous',
        score INTEGER NOT NULL,
        game_type TEXT NOT NULL,
        theme TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ip_address TEXT,
        session_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_game_scores_leaderboard ON game_scores(game_type, score DESC, created_at);
      CREATE INDEX IF NOT EXISTS idx_game_scores_ip_time ON game_scores(ip_address, created_at);
    `);

    // Add default game settings if they don't exist
    const settings = [
      ['game_enabled', '1'],
      ['game_initialSpeed', '0.5'],
      ['game_speedIncreasePerLevel', '0.15'],
      ['game_initialSpawnInterval', '2000'],
      ['game_spawnDecreasePerLevel', '100'],
      ['game_minSpawnInterval', '800']
    ];

    const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);

    settings.forEach(([key, value]) => insertSetting.run(key, value));

    console.log('✅ Game scores migration completed successfully!');
    return { status: 'ok' };
  } finally {
    db.close();
  }
}

export default runMigrations;
