#!/bin/bash

# ========================================
# FPP Control Center - Rollback Script
# ========================================

if [ -z "$1" ]; then
  echo "❌ Error: Backup directory path required"
  echo ""
  echo "Usage: ./rollback.sh <backup_directory>"
  echo ""
  echo "Example: ./rollback.sh backups/20250128_143022"
  echo ""
  echo "Available backups:"
  if [ -d "backups" ]; then
    ls -1t backups/ | head -5
  else
    echo "  No backups found"
  fi
  exit 1
fi

BACKUP_DIR="$1"

if [ ! -d "$BACKUP_DIR" ]; then
  echo "❌ Error: Backup directory not found: $BACKUP_DIR"
  exit 1
fi

echo "🔄 FPP Control Center Rollback"
echo "================================"
echo ""
echo "⚠️  WARNING: This will restore your system to a previous state."
echo "   Current database and configuration will be replaced."
echo ""
echo "📂 Backup directory: $BACKUP_DIR"
echo ""

# Backups come as votes.db (npm run backup) or votes.db.backup (the update scripts)
DB_BACKUP=""
for candidate in "$BACKUP_DIR/votes.db" "$BACKUP_DIR/votes.db.backup"; do
  if [ -f "$candidate" ]; then DB_BACKUP="$candidate"; break; fi
done

ENV_BACKUP=""
for candidate in "$BACKUP_DIR/.env.local" "$BACKUP_DIR/.env.local.backup"; do
  if [ -f "$candidate" ]; then ENV_BACKUP="$candidate"; break; fi
done

if [ -n "$DB_BACKUP" ]; then
  echo "✅ Database backup found"
else
  echo "❌ Database backup not found in $BACKUP_DIR"
  exit 1
fi

if [ -n "$ENV_BACKUP" ]; then
  echo "✅ Configuration backup found"
else
  echo "⚠️  Configuration backup not found (will skip .env.local restore)"
fi

echo ""
read -p "Continue with rollback? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Rollback cancelled"
  exit 0
fi

echo ""
echo "🔄 Restoring from backup..."

# Stop the server if running (optional - user should stop it manually)
# pkill -f "next dev" || true

# Restore database. Remove the live WAL/SHM first: a newer WAL applied over an older
# database file would corrupt it.
rm -f votes.db-wal votes.db-shm
cp "$DB_BACKUP" votes.db
echo "✅ Database restored"

# Backups made by an older backup.js kept the WAL beside the database; they go back together
if [ -f "$BACKUP_DIR/votes.db-wal" ]; then
  cp "$BACKUP_DIR/votes.db-wal" votes.db-wal
  echo "✅ Database WAL file restored"
fi
if [ -f "$BACKUP_DIR/votes.db-shm" ]; then
  cp "$BACKUP_DIR/votes.db-shm" votes.db-shm
  echo "✅ Database SHM file restored"
fi

# Restore configuration
if [ -n "$ENV_BACKUP" ]; then
  cp "$ENV_BACKUP" .env.local
  echo "✅ Configuration restored"
fi

echo ""
echo "✅ Rollback completed successfully!"
echo ""
echo "📋 Next steps:"
echo "   1. Review your configuration: .env.local"
echo "   2. Restart the server: npm run dev"
echo ""
echo "💡 Tip: If issues persist, you can try another backup:"
echo "   Available backups in backups/ directory"
echo ""
