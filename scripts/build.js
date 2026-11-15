// A build may import route modules. Always give those modules a disposable database.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const { migrateDatabase } = require('./database-migrations');

function withBuildDatabase(run) {
  const tmp = path.join(__dirname, '..', 'tmp');
  fs.mkdirSync(tmp, { recursive: true });
  const directory = fs.mkdtempSync(path.join(tmp, 'build-db-'));
  const databasePath = path.join(directory, 'build.db');
  try {
    const db = new Database(databasePath);
    try { migrateDatabase(db); } finally { db.close(); }
    return run({ ...process.env, VOTES_DB_PATH: databasePath, FPP_BUILD: '1' });
  } finally {
    // Only remove the unique directory just created beneath the workspace tmp directory.
    if (path.dirname(directory) !== tmp) throw new Error('Invalid build cleanup path');
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

module.exports = { withBuildDatabase };
if (require.main === module) {
  process.exitCode = withBuildDatabase(env => {
    const result = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], {
      cwd: path.join(__dirname, '..'), env, stdio: 'inherit',
    });
    if (result.error) console.error(result.error.message);
    return result.status ?? 1;
  });
}
