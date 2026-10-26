import { spawn } from 'child_process';
import { existsSync, realpathSync, statSync } from 'fs';
import path from 'path';

// An update.lock older than this is stale (same rule as /api/admin/update-install)
const UPDATE_LOCK_MAX_AGE_MS = 30 * 60 * 1000;
// A restart takes well under a minute; scripts/restart-services.sh clears its lock after 5 minutes too
const RESTART_LOCK_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Environment for scripts/restart-services.sh. PM2 hands the caller's environment to the apps it
 * starts, and both Next.js and dotenv let an existing variable win over .env.local, so passing this
 * process's env (which already holds every .env.local value) would keep the old values alive.
 */
export function restartEnv(env: Record<string, string | undefined>): NodeJS.ProcessEnv {
  // NODE_ENV matches what ecosystem.config.js gives both apps
  const result: NodeJS.ProcessEnv = { NODE_ENV: 'production', PATH: '/usr/local/bin:/usr/bin:/bin' };
  if (env.HOME) result.HOME = env.HOME; // PM2 finds its daemon under ~/.pm2
  if (env.PM2_HOME) result.PM2_HOME = env.PM2_HOME;
  return result;
}

function isLive(lockFile: string, maxAgeMs: number, now: number): boolean {
  return existsSync(lockFile) && now - statSync(lockFile).mtimeMs < maxAgeMs;
}

/** Why a restart can't start right now, or null if it can */
export function restartBlocker(logsDir: string, now = Date.now()): string | null {
  if (isLive(path.join(logsDir, 'update.lock'), UPDATE_LOCK_MAX_AGE_MS, now)) {
    return 'An update is in progress - it restarts the services when it finishes';
  }
  if (isLive(path.join(logsDir, 'restart.lock'), RESTART_LOCK_MAX_AGE_MS, now)) {
    return 'A restart is already in progress';
  }
  return null;
}

/**
 * Start scripts/restart-services.sh in its own session (setsid) so it survives PM2 stopping this
 * process. Returns as soon as the script is spawned.
 */
export function startServiceRestart(): void {
  const projectDir = realpathSync(/*turbopackIgnore: true*/ process.cwd());
  if (/[;`$|&<>]/.test(projectDir)) {
    throw new Error('Project path contains invalid characters');
  }

  const child = spawn('setsid', ['bash', path.join(projectDir, 'scripts', 'restart-services.sh'), projectDir], {
    detached: true,
    stdio: 'ignore',
    cwd: projectDir,
    env: restartEnv(process.env),
  });
  child.unref();
}
