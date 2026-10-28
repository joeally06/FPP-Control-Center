#!/bin/bash

# FPP Control Center - Update Script
# Version: 2.3.0 (Enhanced: Direct status file updates)

set -e

# Fix permissions on this script and all other scripts FIRST
# Git doesn't preserve executable bit, so we fix it on every run
chmod +x "$0" 2>/dev/null || true
find scripts/ -name "*.sh" -type f -exec chmod +x {} \; 2>/dev/null || true

# Silent mode flag (for API calls)
SILENT=false
if [ "$1" = "--silent" ]; then
    SILENT=true
fi

# Status file for API polling
STATUS_FILE="logs/update_status"

# Trap errors and update status
trap 'update_status "FAILED"; exit 1' ERR

log() {
    if [ "$SILENT" = false ]; then
        echo "$1"
    else
        # Always log to file in silent mode
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    fi
}

# Update status function for frontend polling
update_status() {
    if [ "$SILENT" = true ]; then
        echo "$1" > "$STATUS_FILE" 2>/dev/null || true
    fi
}

log "🔄 FPP Control Center - Update Manager"
log "======================================"
log ""
update_status "STARTING"

# Display current version
if [ -f "package.json" ]; then
    CURRENT_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
    log "📦 Current Version: v$CURRENT_VERSION"
    
    if command -v git &> /dev/null && [ -d ".git" ]; then
        CURRENT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
        CURRENT_TAG=$(git describe --exact-match --tags 2>/dev/null || echo "")
        
        if [ -n "$CURRENT_TAG" ]; then
            log "🏷️  Running: $CURRENT_TAG"
        else
            log "📝 Commit: $CURRENT_COMMIT (development)"
        fi
    fi
    log ""
fi

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ This is not a Git repository!" >&2
    echo "Please clone from GitHub first." >&2
    exit 1
fi

# Stop PM2 FIRST (before checking git status)
# This closes the database and prevents .db-shm/.db-wal from appearing as uncommitted changes
PM2_WAS_RUNNING=false
if command -v pm2 &> /dev/null; then
    if pm2 list 2>/dev/null | grep -q "fpp-control"; then
        log "⏸️  Stopping server to prevent database conflicts..."
        update_status "STOPPING"
        pm2 delete fpp-control > /dev/null 2>&1 || pm2 stop fpp-control
        PM2_WAS_RUNNING=true
        
        # Wait for database to close cleanly and WAL file to flush
        sleep 3
        
        log "✅ Server stopped safely"
    fi
fi

# NOW check for uncommitted changes (after PM2 stopped)
STASHED=false
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    log "📦 Stashing local changes..."
    update_status "STASHING"
    git stash push -m "Auto-stash before update $(date +%Y%m%d_%H%M%S)"
    STASHED=true
    log "✅ Local changes stashed"
fi

# Backup current version
log "💾 Creating backup..."
update_status "BACKING_UP"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups/$TIMESTAMP"
mkdir -p "$BACKUP_DIR"

# Backup database
# (a consistent snapshot; a plain cp of a live WAL database can miss recent writes)
if [ -f "votes.db" ]; then
    if node scripts/backup-db.js "$BACKUP_DIR/votes.db.backup"; then
        log "✅ Database backed up"
    else
        cp votes.db "$BACKUP_DIR/votes.db.backup"
        log "⚠️  Snapshot failed - copied votes.db as-is (may miss recent writes)"
    fi
fi

# Backup .env.local
if [ -f ".env.local" ]; then
    cp .env.local "$BACKUP_DIR/.env.local.backup"
    log "✅ Configuration backed up"
fi

log "✅ Backup saved to: $BACKUP_DIR"

# Keep only the newest backups (BACKUP_KEEP, default 10)
node scripts/backup-db.js --prune || log "⚠️  Could not prune old backups (non-critical)"
log ""

# Fetch latest changes
log "📥 Fetching latest updates from GitHub..."
update_status "CHECKING"
git fetch origin --quiet

# Check if there are updates
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/master)

if [ "$LOCAL" = "$REMOTE" ]; then
    log "✅ Already up to date!"
    update_status "UP_TO_DATE"
    
    # Restore stashed changes if any
    if [ "$STASHED" = true ]; then
        log "📦 Restoring stashed changes..."
        git stash pop --quiet
    fi
    
    # Restart PM2 if it was running
    if [ "$PM2_WAS_RUNNING" = true ]; then
        log "🔄 Restarting server..."
        pm2 start ecosystem.config.js
    fi
    
    log ""
    exit 0
fi

# Show what's new (only in interactive mode)
if [ "$SILENT" = false ]; then
    echo ""
    echo "📋 New changes available:"
    git log HEAD..origin/master --oneline --max-count=10
    echo ""
    
    read -p "Continue with update? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Update cancelled"
        
        # Restore stashed changes
        if [ "$STASHED" = true ]; then
            git stash pop --quiet
        fi
        
        # Restart PM2 if it was running
        if [ "$PM2_WAS_RUNNING" = true ]; then
            pm2 start ecosystem.config.js
        fi
        
        exit 1
    fi
fi

# Pull changes
log "📥 Pulling updates..."
update_status "UPDATING"
git pull origin master --quiet

# Fix script permissions after pull (git doesn't preserve executable bit)
find scripts/ -name "*.sh" -type f -exec chmod +x {} \; 2>/dev/null
chmod +x update.sh 2>/dev/null

# Install/update dependencies
log "📦 Updating dependencies..."
update_status "INSTALLING"
if [ "$SILENT" = true ]; then
    npm install --silent 2>&1 > /dev/null
else
    npm install
fi

# Run database migrations if script exists
if [ -f "scripts/migrate-database.js" ]; then
    log "🗄️  Running database migrations..."
    update_status "MIGRATING"
    node scripts/migrate-database.js
fi

# Rebuild application (PM2 is stopped, no database conflicts)
log "🔨 Building application..."
update_status "BUILDING"
if [ "$SILENT" = true ]; then
    npm run build 2>&1 | grep -E "(Creating|Compiled|Error|Warning)" || true
else
    npm run build
fi

log ""
log "✅ Update complete!"
update_status "COMPLETED"
log ""

# Display new version
if [ -f "package.json" ]; then
    NEW_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
    log "📦 Updated to Version: v$NEW_VERSION"
    
    if command -v git &> /dev/null; then
        NEW_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
        NEW_TAG=$(git describe --exact-match --tags 2>/dev/null || echo "")
        
        if [ -n "$NEW_TAG" ]; then
            log "🏷️  Now running: $NEW_TAG"
        else
            log "📝 Commit: $NEW_COMMIT"
        fi
    fi
    log ""
fi

log "📋 Backup location: $BACKUP_DIR"

# Restore stashed changes if any (merge with new code)
if [ "$STASHED" = true ]; then
    log "📦 Restoring stashed changes..."
    update_status "RESTORING"
    if git stash pop --quiet 2>/dev/null; then
        log "✅ Local changes restored"
    else
        log "⚠️  Conflict detected - local changes kept in stash"
        log "   Run 'git stash list' to see stashed changes"
    fi
fi

# Restart PM2 if it was running
if [ "$PM2_WAS_RUNNING" = true ]; then
    log "🔄 Restarting server..."
    update_status "RESTARTING"
    pm2 start ecosystem.config.js
    log "✅ Server restarted successfully"
    update_status "COMPLETED"
fi

if [ "$SILENT" = false ]; then
    echo ""
    echo "To view stashed changes:"
    echo "  git stash list"
    echo ""
    echo "To rollback if needed:"
    echo "  git reset --hard HEAD@{1}"
    echo "  npm install"
    echo "  npm run build"
    echo "  pm2 restart fpp-control"
    echo ""
fi