const Database = require('better-sqlite3');
const { configuredDatabasePath, migrateDatabase } = require('./database-migrations');
let db;
try {
  db = new Database(configuredDatabasePath());
  db.pragma('journal_mode = WAL');
  console.log('Database initialized: ' + migrateDatabase(db) + ' migrations applied');
} catch (error) {
  console.error('Database setup failed:', error.message);
  process.exitCode = 1;
} finally {
  if (db) db.close();
}
