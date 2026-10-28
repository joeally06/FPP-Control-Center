import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { getPrivacyKey, keyedHash } from '../lib/privacy-key';
import { checkAgainstShow, isRestrictionConfigured, parseUserCoordinates, roundMiles } from '../lib/location-check';
import { createFixedWindowLimiter } from '../lib/fixed-window-limiter';
import { redactEmails, safeErrorSummary } from '../lib/privacy-utils';

function print(msg: string) {
  console.log('[test-privacy] ' + msg);
}

const OLD_PUBLISHED_SALT = 'fpp-jukebox-salt-2025';

// ── Privacy key ───────────────────────────────────────────────────────────
print('Test 1: IP_HASH_SALT wins; otherwise the key comes from NEXTAUTH_SECRET');
assert.strictEqual(getPrivacyKey({ IP_HASH_SALT: ' my-own-salt ', NEXTAUTH_SECRET: 'a' }), 'my-own-salt');
const keyA = getPrivacyKey({ NEXTAUTH_SECRET: 'secret-one' });
const keyB = getPrivacyKey({ NEXTAUTH_SECRET: 'secret-two' });
assert.notStrictEqual(keyA, keyB);
assert.strictEqual(keyA, getPrivacyKey({ NEXTAUTH_SECRET: 'secret-one' }), 'stable for the same secret');
assert.notStrictEqual(keyA, OLD_PUBLISHED_SALT);
assert.notStrictEqual(keyA, 'secret-one', 'the secret itself is never used as the key');
assert.strictEqual(getPrivacyKey({ IP_HASH_SALT: '   ', NEXTAUTH_SECRET: 'secret-one' }), keyA, 'a blank salt is ignored');

print('Test 2: production without any secret refuses; development falls back');
assert.throws(() => getPrivacyKey({ NODE_ENV: 'production' }), /IP_HASH_SALT or NEXTAUTH_SECRET/);
assert.doesNotThrow(() => getPrivacyKey({ NODE_ENV: 'development' }));
assert.notStrictEqual(getPrivacyKey({}), OLD_PUBLISHED_SALT);

print('Test 3: hashes are keyed, separated by purpose, and not the old guessable hash');
const envOne = { NEXTAUTH_SECRET: 'secret-one' };
const envTwo = { NEXTAUTH_SECRET: 'secret-two' };
const ipHash = keyedHash('203.0.113.7', 'ip', envOne);
assert.match(ipHash, /^[0-9a-f]{16}$/);
assert.notStrictEqual(ipHash, keyedHash('203.0.113.7', 'ip', envTwo), 'a different secret gives a different hash');
assert.notStrictEqual(ipHash, keyedHash('203.0.113.7', 'email', envOne), 'purposes are separate');
assert.strictEqual(ipHash, keyedHash('203.0.113.7', 'ip', envOne), 'stable');
const oldIpHash = crypto.createHash('sha256').update('203.0.113.7' + OLD_PUBLISHED_SALT).digest('hex').substring(0, 16);
assert.notStrictEqual(ipHash, oldIpHash, 'cannot be rebuilt with the salt that was in the repo');
const oldEmailHash = crypto.createHash('sha256').update('parent@example.com').digest('hex').substring(0, 16);
assert.notStrictEqual(keyedHash('parent@example.com', 'email', envOne), oldEmailHash, 'cannot be rebuilt with a plain SHA-256');

// ── Location check ────────────────────────────────────────────────────────
print('Test 4: coordinates from a request are validated');
assert.deepStrictEqual(parseUserCoordinates({ lat: 41.5, lng: -90.5 }), { lat: 41.5, lng: -90.5 });
for (const bad of [null, undefined, 'x', 5, {}, { lat: '41', lng: '-90' }, { lat: NaN, lng: 0 }, { lat: 91, lng: 0 }, { lat: 0, lng: 181 }, { lat: Infinity, lng: 0 }, { lat: 1 }]) {
  assert.strictEqual(parseUserCoordinates(bad), null, JSON.stringify(bad));
}

print('Test 5: the range check answers in/out and rounds the distance, without revealing the show');
const show = { is_active: 1, max_distance_miles: 1, show_latitude: 41.5, show_longitude: -90.5 };
const near = checkAgainstShow({ lat: 41.5, lng: -90.5 }, show);
assert.deepStrictEqual(near, { enabled: true, withinRange: true, distanceMiles: 0, maxDistance: 1 });
const far = checkAgainstShow({ lat: 41.6, lng: -90.5 }, show); // about 6.9 miles north
assert.ok(far.enabled && !far.withinRange && far.distanceMiles > 6 && far.distanceMiles < 8);
assert.ok(far.enabled && Math.abs(far.distanceMiles * 10 - Math.round(far.distanceMiles * 10)) < 1e-9, 'rounded to 0.1 mile');
const body = JSON.stringify(far);
assert.ok(!body.includes('41.5') && !body.includes('90.5'), 'the answer carries no show coordinates');
assert.deepStrictEqual(checkAgainstShow({ lat: 0, lng: 0 }, { ...show, is_active: 0 }), { enabled: false });
assert.deepStrictEqual(checkAgainstShow({ lat: 0, lng: 0 }, { ...show, show_latitude: null }), { enabled: false });
assert.deepStrictEqual(checkAgainstShow({ lat: 0, lng: 0 }, undefined), { enabled: false });
assert.strictEqual(isRestrictionConfigured({ ...show, show_latitude: 0, show_longitude: 0 }), true, '0,0 is a real position');
assert.strictEqual(roundMiles(1.04), 1);
assert.strictEqual(roundMiles(1.06), 1.1);

// ── Limiter ───────────────────────────────────────────────────────────────
print('Test 6: the fixed-window limiter stops a key after max calls, then lets it back in');
const limiter = createFixedWindowLimiter({ windowMs: 1000, max: 3 });
assert.deepStrictEqual([1, 2, 3, 4].map(() => limiter.allow('ip-a', 0)), [true, true, true, false]);
assert.strictEqual(limiter.allow('ip-b', 10), true, 'other keys are independent');
assert.strictEqual(limiter.allow('ip-a', 999), false);
assert.strictEqual(limiter.allow('ip-a', 1000), true, 'a new window starts');

// ── Migration 025 ─────────────────────────────────────────────────────────
print('Test 7: migration 025 drops the old multiplayer trivia tables and nothing else');
{
  const db = new Database(':memory:');
  const dir = path.join(process.cwd(), 'migrations');
  for (const file of ['004_settings_table.sql', '018_trivia.sql', '024_trivia_games.sql']) db.exec(fs.readFileSync(path.join(dir, file), 'utf-8'));
  db.prepare("INSERT INTO trivia_players (session_id, client_token, display_name, ip_address) VALUES (1, 't', 'n', '203.0.113.7')").run();
  const drop = fs.readFileSync(path.join(dir, '025_drop_old_trivia_tables.sql'), 'utf-8');
  db.exec(drop);
  db.exec(drop); // idempotent
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((t) => t.name);
  for (const gone of ['trivia_sessions', 'trivia_players', 'trivia_answers']) assert.ok(!tables.includes(gone), `${gone} dropped`);
  for (const kept of ['trivia_questions', 'trivia_games']) assert.ok(tables.includes(kept), `${kept} kept`);
  db.close();
}

// ── Source scans ──────────────────────────────────────────────────────────
const root = process.cwd();
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}
const rel = (file: string) => path.relative(root, file).split(path.sep).join('/');
const sources = [...walk(path.join(root, 'app')), ...walk(path.join(root, 'lib'))];

print('Test 8: the published salt is gone and children\'s or parents\' details are not logged');
const publishedSalt = sources.filter((file) => fs.readFileSync(file, 'utf-8').includes(OLD_PUBLISHED_SALT)).map(rel);
assert.deepStrictEqual(publishedSalt, [], `The old salt must not be used: ${publishedSalt.join(', ')}`);

const personal = /\b(child_name|childName|child_age|childAge|parent_email|parentEmail)\b/;
const logOffenders: string[] = [];
for (const file of sources) {
  const text = fs.readFileSync(file, 'utf-8');
  // Whole statements, so a call split over several lines is still checked
  for (const call of text.matchAll(/(console\.(?:log|warn|error|info)|debugLog)\([\s\S]*?\);/g)) {
    // a hashed address is fine to log
    const withoutHashes = call[0].replace(/hashEmail\([^)]*\)/g, '');
    if (personal.test(withoutHashes)) {
      logOffenders.push(`${rel(file)}:${text.slice(0, call.index).split('\n').length}`);
    }
  }
}
assert.deepStrictEqual(logOffenders, [], `Do not log names, ages or email addresses (use the letter ID or hashEmail): ${logOffenders.join(', ')}`);

print('Test 8b: the whole Santa request is not logged, and email errors are redacted');
const ollamaSource = fs.readFileSync(path.join(root, 'lib', 'ollama-client.ts'), 'utf-8');
const ollamaLogs = [...ollamaSource.matchAll(/console\.(?:log|warn|error|info)\([\s\S]*?\);/g)].map((m) => m[0]);
assert.ok(ollamaLogs.length > 0, 'the scan found the log calls');
assert.ok(!ollamaLogs.some((call) => /JSON\.stringify\(\s*request\b|\brequest\b\s*[,)]/.test(call)), 'the Ollama request holds the child\'s name, age and letter');
const emailSource = fs.readFileSync(path.join(root, 'lib', 'email-service.ts'), 'utf-8');
assert.ok(!/console\.error\([^;]*Santa[^;]*,\s*(err|error)\);/.test(emailSource), 'an SMTP error object can carry the parent\'s address: use safeErrorSummary()');
assert.strictEqual(redactEmails('550 <parent@example.com> rejected, cc a.b+c@mail.example.org'), '550 <[email]> rejected, cc [email]');
assert.strictEqual(redactEmails('connection refused'), 'connection refused');
const smtpError = Object.assign(new Error('Recipient address rejected: parent@example.com'), { code: 'EENVELOPE' });
assert.strictEqual(safeErrorSummary(smtpError), 'EENVELOPE: Recipient address rejected: [email]');
assert.strictEqual(safeErrorSummary('failed for parent@example.com'), 'failed for [email]');

print('Test 9: settings values are not logged');
const settingsSource = fs.readFileSync(path.join(root, 'lib', 'settings.ts'), 'utf-8');
assert.ok(!/console\.log\([^)]*\$\{value\}/.test(settingsSource), 'a setting value is logged');
assert.ok(!/JSON\.stringify\(settings/.test(settingsSource), 'all settings are logged');

print('All tests passed');
