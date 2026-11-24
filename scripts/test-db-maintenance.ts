import assert from 'assert';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { migrateDatabase } from './database-migrations';

function print(msg: string) {
  console.log('[test-db-maintenance] ' + msg);
}

// A throwaway migrated database; the live votes.db is never opened. Import the lib only after
// VOTES_DB_PATH points at it.
const tmp = path.resolve('tmp');
fs.mkdirSync(tmp, { recursive: true });
const dir = fs.mkdtempSync(path.join(tmp, 'test-db-maintenance-'));
const databasePath = path.join(dir, 'test.db');
process.env.VOTES_DB_PATH = databasePath;

const seed = new Database(databasePath);
migrateDatabase(seed);
seed.prepare("INSERT INTO visitors (visitor_hash) VALUES ('v1')").run();
const addSession = seed.prepare("INSERT INTO sessions (visitor_hash, session_start) VALUES ('v1', datetime('now', ?))");
const addView = seed.prepare("INSERT INTO page_views (session_id, page_path, view_time) VALUES (?, '/', datetime('now', ?))");
// An old row, a recent row, and one dated in the future (a broken filter such as OR 1=1 deletes it too)
for (const offset of ['-400 days', '-10 days', '+5 days']) {
  const id = Number(addSession.run(offset).lastInsertRowid);
  addView.run(id, offset);
}
seed.close();

const maintenance = require('../lib/db-maintenance.ts') as typeof import('../lib/db-maintenance');
const { getDb } = require('../lib/database.ts') as typeof import('../lib/database');
const db = getDb();
const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

print('Test 1: daysToKeep must be a whole number from 1 to 3650');
for (const good of [1, 30, 365, 3650]) assert.strictEqual(maintenance.parseDaysToKeep(good), good, String(good));
for (const bad of [0, -5, 3651, 1.5, NaN, Infinity, '365', "365 days') OR 1=1 --", null, undefined, {}, []]) {
  assert.strictEqual(maintenance.parseDaysToKeep(bad), null, JSON.stringify(bad));
}

print('Test 2: a bad value deletes nothing');
for (const bad of ["365 days') OR 1=1 --", 0, -1, 1.5]) {
  const result = maintenance.archiveOldData(bad as number);
  assert.strictEqual(result.success, false, `refused: ${String(bad)}`);
  assert.strictEqual(count('page_views'), 3, `page views untouched after ${String(bad)}`);
  assert.strictEqual(count('sessions'), 3, `sessions untouched after ${String(bad)}`);
}

print('Test 3: a valid value deletes only rows older than that');
const archived = maintenance.archiveOldData(365);
assert.strictEqual(archived.success, true);
assert.strictEqual(count('page_views'), 2, 'the 400-day-old view is gone; the recent and the future one stay');
assert.strictEqual(count('sessions'), 2);
assert.strictEqual(maintenance.archiveOldData(5).success, true);
assert.strictEqual(count('page_views'), 1, 'a 5-day cutoff also removes the 10-day-old view');
assert.strictEqual(count('sessions'), 1);

print('Test 4: a failed maintenance result becomes an error message, a good one does not');
assert.strictEqual(maintenance.maintenanceFailureMessage({ success: true, duration: 3 }), null);
assert.strictEqual(maintenance.maintenanceFailureMessage({ success: true, status: 'ok' }), null);
assert.strictEqual(maintenance.maintenanceFailureMessage({ success: false, error: new Error('database is locked') }), 'database is locked');
assert.match(maintenance.maintenanceFailureMessage({ success: false, status: 'issues', details: [{ integrity_check: 'bad page' }] }) ?? '', /integrity/i);
assert.ok(maintenance.maintenanceFailureMessage({ success: false }), 'a failure with no detail still gets a message');
assert.ok(maintenance.maintenanceFailureMessage(null), 'no result at all (stats unavailable) is a failure');
assert.strictEqual(maintenance.maintenanceFailureMessage({ pageSize: 4096 }), null, 'a stats object is not a failure');

print('Test 5: the route reports a failed maintenance run as a failure, not success');
const route = fs.readFileSync(path.join(process.cwd(), 'app', 'api', 'database', 'maintenance', 'route.ts'), 'utf-8');
assert.ok(route.includes('maintenanceFailureMessage('), 'the POST route checks the result');
assert.ok(route.includes('parseDaysToKeep('), 'the POST route validates daysToKeep');
assert.ok(!/daysToKeep\s*=\s*options\?\.daysToKeep\s*\|\|/.test(route), 'no more "|| 365" (0 and junk fell through to 365)');

// Connections are process-scoped, so the fixture stays under the ignored tmp/ for this test process.
print('All tests passed');
