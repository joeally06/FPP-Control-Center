const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { configuredDatabasePath, migrateDatabase } = require('./database-migrations');
const { snapshotDatabase } = require('./backup-db');
let db;
try {
  const dbPath = configuredDatabasePath();
  db = new Database(dbPath, { fileMustExist: true });
  if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Database integrity check failed');
  const backupDirectory = process.env.DB_BACKUP_DIR || path.join(process.cwd(), 'backups');
  fs.mkdirSync(backupDirectory, { recursive: true });
  const destination = path.join(backupDirectory, new Date().toISOString().replace(/[:.]/g, '-') + '_votes.db.backup');
  snapshotDatabase(dbPath, destination);
  console.log('Recovery snapshot: ' + destination);
  console.log('Database migrated: ' + migrateDatabase(db) + ' migrations applied');
} catch (error) {
  console.error('Database migration failed; do not restart with the new release:', error.message);
  process.exitCode = 1;
} finally {
  if (db) db.close();
}
