#!/bin/bash

# Restart fpp-control and fpp-poller so they re-read .env.local.
# Started detached by POST /api/admin/restart (Settings > Updates > Restart Services);
# can also be run by hand: bash scripts/restart-services.sh
#
# Start it with a minimal environment: PM2 passes the caller's environment to the apps it
# starts, and both Next.js and dotenv let an existing variable win over .env.local.

if [ -n "$1" ]; then
    PROJECT_DIR="$1"
else
    PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

# SECURITY: same project path checks as update-daemon.sh
BAD_CHARS='[;`$|&<>]'
if [[ ! "$PROJECT_DIR" = /* ]] || [ ! -f "$PROJECT_DIR/package.json" ] || [[ "$PROJECT_DIR" =~ $BAD_CHARS ]]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ SECURITY: Invalid project directory: $PROJECT_DIR" >&2
    exit 1
fi

cd "$PROJECT_DIR" || exit 1
mkdir -p logs

LOG_FILE="$PROJECT_DIR/logs/restart.log"
LOCK_FILE="$PROJECT_DIR/logs/restart.lock"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

if [ -f "$PROJECT_DIR/logs/update.lock" ]; then
    log "⚠️  An update is running - not restarting"
    exit 1
fi

# Clear a lock left by a restart that died, then take the lock atomically
find "$LOCK_FILE" -mmin +5 -delete 2>/dev/null
if ! (set -C; echo $$ > "$LOCK_FILE") 2>/dev/null; then
    log "⚠️  A restart is already running"
    exit 1
fi
trap 'rm -f "$LOCK_FILE"' EXIT
# Keep going while PM2 tears down fpp-control
trap '' TERM INT HUP

log "🔄 Restarting services (PID: $$)"

# Find PM2 executable
PM2_BIN=$(command -v pm2 || echo "")
if [ -z "$PM2_BIN" ]; then
    for path in ~/.nvm/versions/node/*/bin/pm2 /usr/local/bin/pm2 /usr/bin/pm2; do
        if [ -f "$path" ]; then
            PM2_BIN="$path"
            break
        fi
    done
fi
if [ -z "$PM2_BIN" ]; then
    log "❌ PM2 not found - restart by hand: pm2 start ecosystem.config.js"
    exit 1
fi
# nvm keeps node beside pm2
PATH="$(dirname "$PM2_BIN"):$PATH"
log "Found PM2 at: $PM2_BIN"

# fpp-control first, so the old server is gone before the browser starts checking for the new one.
# Delete + start rather than pm2 restart (see update-daemon.sh Phase 7).
log "Restarting fpp-control..."
timeout 10 "$PM2_BIN" delete fpp-control >> "$LOG_FILE" 2>&1 || true

log "Waiting for port 3000 to be released..."
sleep 3
PORT_FREE=false
for i in {1..7}; do
    if ! netstat -tuln 2>/dev/null | grep -q ":3000 " && ! ss -tuln 2>/dev/null | grep -q ":3000 "; then
        PORT_FREE=true
        break
    fi
    sleep 1
done
if [ "$PORT_FREE" = false ]; then
    PORT_PID=$(lsof -t -i:3000 2>/dev/null || fuser 3000/tcp 2>/dev/null | awk '{print $1}' || echo "")
    if [ -n "$PORT_PID" ]; then
        log "⚠️  Port 3000 still in use, killing PID $PORT_PID"
        kill -9 $PORT_PID 2>/dev/null || true
        sleep 2
    fi
fi

if timeout 30 "$PM2_BIN" start ecosystem.config.js --only fpp-control >> "$LOG_FILE" 2>&1; then
    log "✅ fpp-control started"
else
    log "⚠️  fpp-control start failed"
fi

log "Restarting fpp-poller..."
timeout 10 "$PM2_BIN" delete fpp-poller >> "$LOG_FILE" 2>&1 || true
sleep 2
if timeout 30 "$PM2_BIN" start ecosystem.config.js --only fpp-poller >> "$LOG_FILE" 2>&1; then
    log "✅ fpp-poller started"
else
    log "⚠️  fpp-poller start failed"
fi

timeout 10 "$PM2_BIN" save >> "$LOG_FILE" 2>&1 || log "⚠️  Could not save PM2 config"

for i in {1..30}; do
    if curl -sf -o /dev/null http://localhost:3000/api/health; then
        log "✅ Application responding - restart complete"
        exit 0
    fi
    sleep 2
done

log "❌ Application not responding after 60s - check: pm2 logs fpp-control"
exit 1
