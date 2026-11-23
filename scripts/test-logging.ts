import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { debugLog } from '../lib/logging';

function print(msg: string) {
  console.log('[test-logging] ' + msg);
}

/** What debugLog prints (to console.log) for the given environment */
function printed(env: { NODE_ENV?: string; JUKEBOX_DEBUG?: string }): unknown[][] {
  const saved = { NODE_ENV: process.env.NODE_ENV, JUKEBOX_DEBUG: process.env.JUKEBOX_DEBUG };
  const realLog = console.log;
  const lines: unknown[][] = [];
  const set = (key: 'NODE_ENV' | 'JUKEBOX_DEBUG', value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else (process.env as Record<string, string | undefined>)[key] = value;
  };
  try {
    set('NODE_ENV', env.NODE_ENV);
    set('JUKEBOX_DEBUG', env.JUKEBOX_DEBUG);
    console.log = (...args: unknown[]) => { lines.push(args); };
    debugLog('a debug line', 1);
  } finally {
    console.log = realLog;
    set('NODE_ENV', saved.NODE_ENV);
    set('JUKEBOX_DEBUG', saved.JUKEBOX_DEBUG);
  }
  return lines;
}

print('Test 1: debugLog is silent in production unless JUKEBOX_DEBUG=true');
assert.deepStrictEqual(printed({ NODE_ENV: 'production' }), [], 'silent in production');
assert.deepStrictEqual(printed({ NODE_ENV: 'production', JUKEBOX_DEBUG: 'false' }), [], 'silent when JUKEBOX_DEBUG is not "true"');
assert.deepStrictEqual(printed({ NODE_ENV: 'production', JUKEBOX_DEBUG: 'true' }), [['a debug line', 1]], 'JUKEBOX_DEBUG=true turns it on');
assert.deepStrictEqual(printed({ NODE_ENV: 'development' }), [['a debug line', 1]], 'prints in development');

print('Test 2: no log line writes a visitor IP address in full');
// A visitor's address is personal data: log it through anonymizeIP() (lib/privacy-utils.ts). This reads one
// line at a time, which is how every log call that names an IP is written today.
const VISITOR_IP = /\$\{\s*(requester_ip|requesterIp|clientIP|clientIp|userIp)\s*\}/;
const LOG_CALL = /console\.(log|warn|error|info)\(/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const root = process.cwd();
const offenders: string[] = [];
for (const file of [...walk(path.join(root, 'app')), ...walk(path.join(root, 'lib'))]) {
  fs.readFileSync(file, 'utf-8').split('\n').forEach((line, i) => {
    if (LOG_CALL.test(line) && VISITOR_IP.test(line) && !line.includes('anonymizeIP(')) {
      offenders.push(`${path.relative(root, file).split(path.sep).join('/')}:${i + 1}`);
    }
  });
}
assert.deepStrictEqual(offenders, [], `These log lines print a full visitor IP; wrap it in anonymizeIP(): ${offenders.join(', ')}`);

print('All tests passed');
