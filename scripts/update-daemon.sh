#!/bin/bash

# Update Daemon - Inspired by FPP's upgrade system
# Runs completely independent of PM2/Node.js processes
# Version: 4.1.0 - Added security: path validation and command injection prevention

set -e

# Determine project directory
# If argument provided, use it; otherwise find project root
if [ -n "$1" ]; then
    PROJECT_DIR="$1"
else
    # Find project root by looking for package.json
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ -f "$SCRIPT_DIR/../package.json" ]; then
        PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
    else
        PROJECT_DIR="$(pwd)"
    fi
fi

# SECURITY: Validate PROJECT_DIR to prevent command injection
# 1. Must be an absolute path
if [[ ! "$PROJECT_DIR" = /* ]]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ SECURITY: PROJECT_DIR must be absolute path, got: $PROJECT_DIR" >&2
    exit 1
fi

# 2. Canonicalize path (resolve symlinks, remove .., etc.)
if command -v realpath >/dev/null 2>&1; then
    PROJECT_DIR=$(realpath "$PROJECT_DIR" 2>/dev/null) || {
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ SECURITY: Invalid project path: $PROJECT_DIR" >&2
        exit 1
    }
fi

# 3. Must contain package.json (validate it's a Node.js project)
if [ ! -f "$PROJECT_DIR/package.json" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ SECURITY: Invalid project directory (no package.json found)" >&2
    exit 1
fi

# 4. Validate path doesn't contain dangerous characters
if [[ "$PROJECT_DIR" =~ [';''`''$''|''&''<''>'] ]]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ SECURITY: PROJECT_DIR contains invalid characters" >&2
    exit 1
fi

LOG_FILE="$PROJECT_DIR/logs/update.log"
STATUS_FILE="$PROJECT_DIR/logs/update_status"
LOCK_FILE="$PROJECT_DIR/logs/update.lock"

# Track if update completed successfully
UPDATE_SUCCESS=false

# Function to write status
write_status() {
    echo "$1" > "$STATUS_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] STATUS: $1" >> "$LOG_FILE"
}

# Function to log
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Cleanup on exit - only mark completed if UPDATE_SUCCESS is true
cleanup() {
    rm -f "$LOCK_FILE"
    if [ "$UPDATE_SUCCESS" = true ]; then
        write_status "COMPLETED"
        log "✅ Update completed successfully"
    else
        # Check if we were just "up to date" (not a failure)
        CURRENT_STATUS=$(cat "$STATUS_FILE" 2>/dev/null || echo "")
        if [ "$CURRENT_STATUS" != "UP_TO_DATE" ] && [ "$CURRENT_STATUS" != "COMPLETED" ]; then
            write_status "FAILED"
            log "❌ Update failed"
        fi
    fi
}

# Set up traps
trap cleanup EXIT
# Ignore SIGTERM and SIGINT during update to prevent PM2 from killing us
trap '' TERM INT

# Ensure logs directory exists
mkdir -p "$PROJECT_DIR/logs"

# Check for lock file (prevent concurrent updates)
if [ -f "$LOCK_FILE" ]; then
    log "⚠️  Another update is already running"
    write_status "LOCKED"
    exit 1
fi

# Create lock file
echo $$ > "$LOCK_FILE"

log "🚀 Update Daemon Started (PID: $$)"
log "Project Directory: $PROJECT_DIR"
write_status "STARTING"

cd "$PROJECT_DIR" || {
    log "❌ Cannot change to project directory: $PROJECT_DIR"
    write_status "FAILED"
    exit 1
}

# Phase 1: Pre-download and verify
log "📥 Phase 1: Downloading updates..."
write_status "DOWNLOADING"

# Fetch latest changes without applying
git fetch origin master >> "$LOG_FILE" 2>&1 || {
    log "❌ Git fetch failed"
    write_status "FAILED"
    exit 1
}

# Check if updates are available
LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse origin/master)

if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
    log "✅ Already up to date"
    write_status "UP_TO_DATE"
    UPDATE_SUCCESS=true
    exit 0
fi

log "📦 Updates available: $LOCAL_COMMIT -> $REMOTE_COMMIT"

# Refuse to update over local changes to tracked files - the pull and any
# rollback (git reset --hard) would lose them. Runtime data is gitignored.
LOCAL_CHANGES=$(git status --porcelain --untracked-files=no)
if [ -n "$LOCAL_CHANGES" ]; then
    log "❌ Local changes to tracked files would be lost by the update:"
    echo "$LOCAL_CHANGES" | tee -a "$LOG_FILE"
    log "   Nothing was changed. Review them with 'git diff', commit or discard them, then update again."
    write_status "FAILED"
    exit 1
fi

# Get commit messages
log "Changes to be applied:"
git log --oneline "$LOCAL_COMMIT..$REMOTE_COMMIT" >> "$LOG_FILE" 2>&1

# Phase 2: Backup current state
log "💾 Phase 2: Creating backup..."
write_status "BACKING_UP"

BACKUP_DIR="$PROJECT_DIR/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup database
if [ -f "votes.db" ]; then
    cp votes.db "$BACKUP_DIR/votes.db.backup" && \
        log "✅ Database backed up" || \
        log "⚠️  Database backup failed (non-critical)"
fi

# Backup env file
if [ -f ".env.local" ]; then
    cp .env.local "$BACKUP_DIR/.env.local.backup" && \
        log "✅ Config backed up" || \
        log "⚠️  Config backup failed (non-critical)"
fi

log "✅ Backup saved to: $BACKUP_DIR"

# Phase 3: Stop auxiliary services only
log "⏸️  Phase 3: Stopping auxiliary services..."
write_status "STOPPING"

# Find PM2 executable
PM2_BIN=$(command -v pm2 || echo "")

if [ -z "$PM2_BIN" ]; then
    # Try common locations
    for path in ~/.nvm/versions/node/*/bin/pm2 /usr/local/bin/pm2 /usr/bin/pm2; do
        if [ -f "$path" ]; then
            PM2_BIN="$path"
            break
        fi
    done
fi

if [ -n "$PM2_BIN" ]; then
    log "Found PM2 at: $PM2_BIN"
    
    # Only stop fpp-poller (safe to stop)
    # DO NOT stop fpp-control - it will be restarted cleanly at the end
    log "Stopping fpp-poller..."
    if "$PM2_BIN" stop fpp-poller >> "$LOG_FILE" 2>&1; then
        log "✅ fpp-poller stopped"
    else
        log "⚠️  fpp-poller not running or already stopped"
    fi
    
    sleep 2
    log "✅ Auxiliary services stopped (fpp-control will restart with new code)"
else
    log "⚠️  PM2 not found, skipping service stop"
fi

# Phase 4: Apply updates
log "📥 Phase 4: Applying updates..."
write_status "UPDATING"

# Pull updates
if git pull origin master >> "$LOG_FILE" 2>&1; then
    log "✅ Code updated successfully"
else
    log "❌ Git pull failed"
    
    # Attempt rollback
    log "🔄 Attempting rollback..."
    git reset --hard "$LOCAL_COMMIT" >> "$LOG_FILE" 2>&1
    
    write_status "FAILED"
    exit 1
fi

# Phase 5: Install dependencies
log "📦 Phase 5: Installing dependencies..."
write_status "INSTALLING"

# Install all dependencies including devDependencies (needed for TypeScript build)
if npm install --include=dev >> "$LOG_FILE" 2>&1; then
    log "✅ Dependencies installed"
else
    log "❌ npm install failed"
    
    # Attempt rollback
    log "🔄 Attempting rollback..."
    git reset --hard "$LOCAL_COMMIT" >> "$LOG_FILE" 2>&1
    npm install --include=dev >> "$LOG_FILE" 2>&1
    
    write_status "FAILED"
    exit 1
fi

# Phase 6: Build application
log "🔨 Phase 6: Building application..."
write_status "BUILDING"

if npm run build >> "$LOG_FILE" 2>&1; then
    log "✅ Build completed"
else
    log "❌ Build failed"
    
    # Attempt rollback
    log "🔄 Attempting rollback..."
    git reset --hard "$LOCAL_COMMIT" >> "$LOG_FILE" 2>&1
    npm install --include=dev >> "$LOG_FILE" 2>&1
    npm run build >> "$LOG_FILE" 2>&1
    
    write_status "FAILED"
    exit 1
fi

# Phase 6.5: Run database migrations
log "🗄️  Phase 6.5: Running database migrations..."
write_status "MIGRATING"

if [ -f "$PROJECT_DIR/scripts/migrate-database.js" ]; then
    if node "$PROJECT_DIR/scripts/migrate-database.js" >> "$LOG_FILE" 2>&1; then
        log "✅ Database migrations completed"
    else
        log "❌ Database migrations failed"
        log "⚠️  Continuing anyway - check logs/update.log for details"
        # Don't exit - migrations might fail if already applied
    fi
else
    log "ℹ️  No migration script found, skipping"
fi

# Phase 7: Restart all services
log "🔄 Phase 7: Restarting all services..."
write_status "RESTARTING"

if [ -n "$PM2_BIN" ]; then
    # IMPORTANT: PM2 restart commands are unreliable and cause process ID corruption.
    # Instead, always delete + start fresh for consistent behavior.
    log "Restarting services (delete + start for reliability)..."
    
    set +e
    
    # Restart fpp-poller first (it's less critical)
    log "Restarting fpp-poller..."
    timeout 10 "$PM2_BIN" delete fpp-poller >> "$LOG_FILE" 2>&1 || true
    sleep 2
    timeout 30 "$PM2_BIN" start ecosystem.config.js --only fpp-poller >> "$LOG_FILE" 2>&1
    if [ $? -eq 0 ]; then
        log "✅ fpp-poller started"
    else
        log "⚠️  fpp-poller start failed"
    fi
    
    # Restart fpp-control (main app) - always delete + start
    # Wait for port 3000 to be released before starting
    log "Restarting fpp-control..."
    timeout 10 "$PM2_BIN" delete fpp-control >> "$LOG_FILE" 2>&1 || true
    
    # Wait for port 3000 to be free (max 10 seconds)
    # Initial delay to let the process start shutting down
    log "Waiting for port 3000 to be released..."
    sleep 3
    PORT_FREE=false
    for i in {1..7}; do
        if ! netstat -tuln 2>/dev/null | grep -q ":3000 " && ! ss -tuln 2>/dev/null | grep -q ":3000 "; then
            PORT_FREE=true
            log "✅ Port 3000 is free (after ${i}s)"
            break
        fi
        log "   Port 3000 still in use, waiting... (${i}/7)"
        sleep 1
    done
    
    # If port still in use, kill the process holding it
    if [ "$PORT_FREE" = false ]; then
        log "⚠️  Port 3000 still in use, forcefully killing process..."
        # Find and kill process on port 3000
        PORT_PID=$(lsof -t -i:3000 2>/dev/null || fuser 3000/tcp 2>/dev/null | awk '{print $1}' || echo "")
        if [ -n "$PORT_PID" ]; then
            log "   Killing PID $PORT_PID holding port 3000"
            kill -9 $PORT_PID 2>/dev/null || true
            sleep 2
        else
            log "   Could not identify process on port 3000"
        fi
    fi
    
    timeout 30 "$PM2_BIN" start ecosystem.config.js --only fpp-control >> "$LOG_FILE" 2>&1
    if [ $? -eq 0 ]; then
        log "✅ fpp-control started"
    else
        log "⚠️  fpp-control start failed"
    fi
    
    set -e
    
    sleep 3
    
    # Save PM2 config (with timeout)
    timeout 10 "$PM2_BIN" save >> "$LOG_FILE" 2>&1 || log "⚠️  Could not save PM2 config"
    
    # Show current status (ignore errors - PM2 status can crash on stopping processes)
    set +e
    timeout 10 "$PM2_BIN" status >> "$LOG_FILE" 2>&1 || log "⚠️  PM2 status command failed (process may be restarting)"
    set -e
    
    # Verify services are running - this is the real test
    # Use timeout to prevent hanging on jlist if processes are in bad state
    FPP_CONTROL_STATUS=$(timeout 5 "$PM2_BIN" jlist 2>/dev/null | jq -r '.[] | select(.name=="fpp-control") | .pm2_env.status' 2>/dev/null || echo "unknown")
    FPP_POLLER_STATUS=$(timeout 5 "$PM2_BIN" jlist 2>/dev/null | jq -r '.[] | select(.name=="fpp-poller") | .pm2_env.status' 2>/dev/null || echo "unknown")
    
    if [ "$FPP_CONTROL_STATUS" = "online" ]; then
        log "✅ fpp-control is running"
    else
        log "⚠️  fpp-control status: $FPP_CONTROL_STATUS"
    fi
    
    if [ "$FPP_POLLER_STATUS" = "online" ]; then
        log "✅ fpp-poller is running"
    else
        log "⚠️  fpp-poller status: $FPP_POLLER_STATUS"
    fi
else
    log "⚠️  PM2 not found, cannot restart services"
    log "ℹ️  Please manually restart: pm2 start ecosystem.config.js"
fi

# Phase 8: Verify health
log "🏥 Phase 8: Verifying health..."
write_status "VERIFYING"

sleep 5

# Check if services are running
if [ -n "$PM2_BIN" ]; then
    # Use timeout to prevent hanging if PM2 is in bad state
    RUNNING=$(timeout 5 "$PM2_BIN" list 2>/dev/null | grep -c "online" || echo "0")
    EXPECTED=2
    if [ "$RUNNING" -ge "$EXPECTED" ]; then
        log "✅ All services running ($RUNNING/$EXPECTED online)"
    else
        log "⚠️  Only $RUNNING/$EXPECTED services online"
    fi
fi

# Try to ping the application
if command -v curl &> /dev/null; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 || echo "000")
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "401" ]; then
        log "✅ Application responding (HTTP $HTTP_CODE)"
    else
        log "⚠️  Application health check: HTTP $HTTP_CODE"
    fi
fi

log "🎉 Update completed successfully!"
log "Updated from $LOCAL_COMMIT to $REMOTE_COMMIT"

# Mark success so cleanup trap knows we completed properly
UPDATE_SUCCESS=true

exit 0
