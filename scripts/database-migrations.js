// Explicit schema changes only. Importing this module never opens a database.
const fs = require('fs');
const path = require('path');

function migrateDatabase(db, directory = path.join(__dirname, '..', 'migrations')) {
  const files = fs.readdirSync(directory).filter(name => /^\d+_.*\.(sql|js)$/.test(name)).sort();
  if (!files.length) throw new Error('No database migrations found');
  // One transaction for the whole upgrade: a failed step leaves the old schema/data intact.
  return db.transaction(() => {
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, version TEXT UNIQUE NOT NULL, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
    const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(row => row.version));
    let count = 0;
    for (const file of files) {
      const version = file.replace(/\.(sql|js)$/, '');
      if (applied.has(version)) continue;
      // Before migration 027 the app topped up its own schema at every start, so a database can already hold
      // what an old migration adds without having recorded it. For those old migrations only, "already there"
      // means done: undo that one file, count it as applied, and let 027 (idempotent) fill in anything missing.
      // Newer migrations stay strict.
      const legacy = parseInt(version, 10) < 27;
      if (legacy) db.exec('SAVEPOINT legacy_migration');
      try {
        if (file.endsWith('.sql')) db.exec(fs.readFileSync(path.join(directory, file), 'utf8'));
        else require(path.join(directory, file))(db);
        if (legacy) db.exec('RELEASE legacy_migration');
      } catch (error) {
        if (!legacy || !/duplicate column name|already exists/i.test(error.message)) throw error;
        db.exec('ROLLBACK TO legacy_migration; RELEASE legacy_migration');
        console.warn(`Migration ${version} was already in the database (${error.message}); recorded as applied.`);
      }
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
      count++;
    }
    return count;
  })();
}

function configuredDatabasePath() {
  require('@next/env').loadEnvConfig(process.cwd());
  require('esbuild-register');
  return require('../lib/db-path.ts').getVotesDbPath();
}

module.exports = { migrateDatabase, configuredDatabasePath };
