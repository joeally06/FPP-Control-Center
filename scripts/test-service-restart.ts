import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { restartBlocker, restartEnv } from '../lib/service-restart';

function print(msg: string) {
  console.log('[test-service-restart] ' + msg);
}

const LOGS_DIR = path.join(process.cwd(), 'tmp', 'test-service-restart');

function writeLock(name: string, ageMs: number) {
  const file = path.join(LOGS_DIR, name);
  fs.writeFileSync(file, '1');
  const time = new Date(Date.now() - ageMs);
  fs.utimesSync(file, time, time);
}

try {
  // Test 1: the restart script gets none of the app's settings, so .env.local is read fresh
  print('Test 1: restartEnv');
  const env = restartEnv({
    PATH: '/home/show/.nvm/versions/node/v22.0.0/bin:/usr/bin',
    HOME: '/home/show',
    NEXTAUTH_SECRET: 'secret',
    ADMIN_EMAILS: 'a@example.com',
    FPP_URL: 'http://192.168.1.10',
    NODE_ENV: 'production',
  });
  assert.deepStrictEqual(env, { NODE_ENV: 'production', PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/home/show' });
  assert.strictEqual(restartEnv({ HOME: '/home/show', PM2_HOME: '/srv/pm2' }).PM2_HOME, '/srv/pm2', 'PM2_HOME kept');
  assert.deepStrictEqual(restartEnv({}), { NODE_ENV: 'production', PATH: '/usr/local/bin:/usr/bin:/bin' }, 'no HOME');

  // Test 2: live locks block a restart, stale ones don't
  print('Test 2: restartBlocker');
  fs.rmSync(LOGS_DIR, { recursive: true, force: true });
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  assert.strictEqual(restartBlocker(LOGS_DIR), null, 'no locks');

  writeLock('update.lock', 60 * 1000);
  assert.match(restartBlocker(LOGS_DIR) || '', /update is in progress/, 'fresh update lock');
  writeLock('update.lock', 31 * 60 * 1000);
  assert.strictEqual(restartBlocker(LOGS_DIR), null, 'stale update lock');

  writeLock('restart.lock', 30 * 1000);
  assert.match(restartBlocker(LOGS_DIR) || '', /restart is already in progress/, 'fresh restart lock');
  writeLock('restart.lock', 6 * 60 * 1000);
  assert.strictEqual(restartBlocker(LOGS_DIR), null, 'stale restart lock');

  fs.rmSync(LOGS_DIR, { recursive: true, force: true });
  print('All tests passed');
} catch (error) {
  console.error('[test-service-restart] FAILED:', error);
  process.exit(1);
}
