import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import runMigrations from '../lib/migrations-runner';

(async () => {
  const tmpDir = path.join(process.cwd(), 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const dbPath = path.join(tmpDir, 'test-votes.db');
  // Backups go to a throwaway folder, not the real backups/ directory
  const backupDir = path.join(tmpDir, 'test-migrations-backups');
  fs.rmSync(backupDir, { recursive: true, force: true });
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const db = new Database(dbPath);
  try {
    // Create minimal settings table so the migration insert doesn't fail
    db.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    `);

    console.log('[test-migrations] Running runner against', dbPath);

    const result1 = await runMigrations({ dbPath, backup: true, backupDir });
    console.log('[test-migrations] Runner result (first run):', result1);
    const result2 = await runMigrations({ dbPath, backup: true, backupDir });
    console.log('[test-migrations] Runner result (second run):', result2);

    const table = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='game_scores'`).get();
    if (table) {
      console.log('[test-migrations] ✅ game_scores table created successfully');
      process.exit(0);
    } else {
      console.error('[test-migrations] ❌ game_scores table missing');
      process.exit(2);
    }
  } catch (err) {
    console.error('[test-migrations] Error during test-run:', err);
    process.exit(1);
  } finally {
    db.close();
  }
})();
