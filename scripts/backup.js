const fs = require('fs');
const path = require('path');
const { snapshotDatabase, pruneBackups } = require('./backup-db');

console.log('💾 Creating backup...\n');

const timestamp = new Date().toISOString()
  .replace(/:/g, '-')
  .replace(/\..+/, '')
  .replace('T', '_');

const backupDir = path.join(process.cwd(), 'backups', timestamp);

// Create backup directory
if (!fs.existsSync(path.join(process.cwd(), 'backups'))) {
  fs.mkdirSync(path.join(process.cwd(), 'backups'));
}

fs.mkdirSync(backupDir, { recursive: true });

console.log(`📂 Backup directory: ${backupDir}\n`);

let fileCount = 0;

// Backup database
const dbPath = path.join(process.cwd(), 'votes.db');
if (fs.existsSync(dbPath)) {
  // One consistent snapshot; copying the -wal and -shm files separately can tear while the app writes
  try {
    snapshotDatabase(dbPath, path.join(backupDir, 'votes.db'));
    console.log('✅ Backed up: votes.db');
  } catch (error) {
    // Same fallback as the update scripts: an as-is copy beats no backup
    fs.rmSync(path.join(backupDir, 'votes.db'), { force: true });
    fs.copyFileSync(dbPath, path.join(backupDir, 'votes.db'));
    console.log(`⚠️  Snapshot failed (${error.message}) - copied votes.db as-is; it may miss recent writes`);
  }
  fileCount++;
} else {
  console.log('⚠️  Database not found (skipped)');
}

// Backup .env.local
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  fs.copyFileSync(envPath, path.join(backupDir, '.env.local'));
  console.log('✅ Backed up: .env.local');
  fileCount++;
} else {
  console.log('⚠️  Configuration not found (skipped)');
}

console.log(`\n✅ Backup completed: ${fileCount} file(s)`);
console.log(`📂 Location: ${backupDir}`);

// Keep only the newest backups (BACKUP_KEEP, default 10)
const keep = process.env.BACKUP_KEEP ? Number(process.env.BACKUP_KEEP) : undefined;
const pruned = pruneBackups(path.join(process.cwd(), 'backups'), keep);
if (pruned.length > 0) {
  console.log(`🧹 Removed ${pruned.length} old backup(s)`);
}

// List recent backups
console.log('\n📋 Recent backups:');
const backupsPath = path.join(process.cwd(), 'backups');
const backups = fs.readdirSync(backupsPath)
  .filter(f => fs.statSync(path.join(backupsPath, f)).isDirectory())
  .sort()
  .reverse()
  .slice(0, 5);

backups.forEach((backup, index) => {
  const backupPath = path.join(backupsPath, backup);
  const stats = fs.statSync(backupPath);
  const sizeMB = fs.readdirSync(backupPath)
    .reduce((total, file) => {
      return total + fs.statSync(path.join(backupPath, file)).size;
    }, 0) / (1024 * 1024);
  
  console.log(`   ${(index + 1)}. ${backup} (${sizeMB.toFixed(2)} MB)`);
});

console.log('\n💡 To restore from this backup, run:');
console.log(`   Linux/Mac: ./rollback.sh ${backupDir}`);
console.log(`   Windows:   .\\rollback.ps1 -BackupDir ${backupDir}`);
console.log('');
