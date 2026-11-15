import type Database from 'better-sqlite3';

/** Read-only startup check; schema changes belong to the explicit migration command. */
export function assertDatabaseReady(db: Database.Database): void {
  const tracked = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
  if (!tracked || !db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get('028_circuit_breaker')) {
    throw new Error('Database needs migration. Run "node scripts/migrate-database.js" before starting the application.');
  }
}
