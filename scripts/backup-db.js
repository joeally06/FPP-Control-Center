// Consistent database snapshots and backup retention. Plain Node (no TypeScript) so the update
// scripts can call it directly:
//   node scripts/backup-db.js <dest-file> [source-db]   snapshot the live database
//   node scripts/backup-db.js --prune [keep]            keep only the newest backups (default 10)
const fs = require('fs');
const path = require('path');

const DEFAULT_KEEP = 10;

// Only backups this app creates are ever pruned, and each kind keeps its own newest N so a
// pile of one kind (e.g. migration-runner copies) can never push out another:
//   - timestamp folders (backup.js, update scripts)
//   - <timestamp>_votes.db.backup files (migrations runner)
const PRUNABLE_KINDS = [
  [/^\d{8}_\d{6}$/, /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/],
  [/^[\dTZ-]+_votes\.db\.backup$/],
];

/**
 * Writes a consistent single-file copy of a live database. Copying votes.db with its -wal and
 * -shm files while the app is writing can tear; VACUUM INTO reads one snapshot instead.
 * The destination must not exist or be empty.
 */
function snapshotDatabase(srcPath, destPath) {
  // Loaded here so a native-module problem only affects the snapshot, not the rest of backup.js
  const Database = require('better-sqlite3');
  const db = new Database(srcPath, { fileMustExist: true });
  try {
    db.prepare('VACUUM INTO ?').run(destPath);
  } finally {
    db.close();
  }
}

/** Deletes all but the newest `keep` backups of each kind in `dir`; returns the names it removed. */
function pruneBackups(dir, keep = DEFAULT_KEEP) {
  if (!Number.isInteger(keep) || keep < 1) {
    throw new Error(`Backups to keep must be a whole number of 1 or more (got ${keep})`);
  }
  if (!fs.existsSync(dir)) return [];

  const names = fs.readdirSync(dir);
  const removed = [];
  for (const patterns of PRUNABLE_KINDS) {
    const entries = names
      .filter((name) => patterns.some((pattern) => pattern.test(name)))
      .map((name) => ({ name, full: path.join(dir, name), stat: fs.lstatSync(path.join(dir, name)) }))
      .filter((entry) => !entry.stat.isSymbolicLink())
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs || (a.name < b.name ? 1 : -1));

    for (const entry of entries.slice(keep)) {
      fs.rmSync(entry.full, { recursive: true, force: true });
      removed.push(entry.name);
    }
  }
  return removed;
}

function keepFromEnv(arg) {
  const raw = arg ?? process.env.BACKUP_KEEP;
  return raw === undefined || raw === '' ? DEFAULT_KEEP : Number(raw);
}

if (require.main === module) {
  const [first, second] = process.argv.slice(2);
  try {
    if (first === '--prune') {
      const removed = pruneBackups(path.join(process.cwd(), 'backups'), keepFromEnv(second));
      console.log(`Pruned ${removed.length} old backup(s)`);
    } else if (first) {
      snapshotDatabase(second || path.join(process.cwd(), 'votes.db'), first);
    } else {
      console.error('Usage: node scripts/backup-db.js <dest-file> [source-db] | --prune [keep]');
      process.exit(2);
    }
  } catch (error) {
    console.error(`backup-db: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { snapshotDatabase, pruneBackups, DEFAULT_KEEP };
