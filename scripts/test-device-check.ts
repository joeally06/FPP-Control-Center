import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import assert from 'assert';
import { alertDue, checkAllDevices } from '../lib/device-check';

// Tables as lib/database.ts creates them
const SCHEMA = `
  CREATE TABLE device_status (
    device_id TEXT PRIMARY KEY,
    is_online BOOLEAN NOT NULL DEFAULT 0,
    last_checked DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_online DATETIME,
    consecutive_failures INTEGER DEFAULT 0,
    last_notified DATETIME
  );
  CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    ip TEXT NOT NULL,
    enabled BOOLEAN DEFAULT 1,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

interface StatusRow {
  is_online: number;
  consecutive_failures: number;
  last_seen_online: string | null;
  last_notified: string | null;
}

function print(msg: string) {
  console.log('[test-device-check] ' + msg);
}

const HOUR = 60 * 60 * 1000;

(async () => {
  const tmpDir = path.join(process.cwd(), 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbPath = path.join(tmpDir, 'test-device-check.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = new Database(dbPath);

  try {
    db.exec(SCHEMA);
    const addDevice = db.prepare('INSERT INTO devices (id, name, type, ip, enabled) VALUES (?, ?, ?, ?, ?)');
    addDevice.run('fpp', 'FPP Player', 'fpp', '192.0.2.10', 1);
    addDevice.run('old', 'Retired Controller', 'controller', '192.0.2.99', 0);

    const status = () => db.prepare('SELECT * FROM device_status WHERE device_id = ?').get('fpp') as StatusRow;
    let online = false;
    const pinged: string[] = [];
    const emails: string[] = [];
    let clock = Date.parse('2026-10-26T15:00:00Z');
    let emailFails = false;
    const run = (alertsActive: boolean) => checkAllDevices(db, {
      alertsActive,
      ping: async (ip) => { pinged.push(ip); return online; },
      sendAlert: async (name) => { if (emailFails) throw new Error('SMTP down'); emails.push(name); },
      now: () => clock,
    });

    // Test 1: alert rule
    print('Test 1: alertDue');
    const now = clock;
    assert.strictEqual(alertDue({ consecutiveFailures: 1, lastNotified: null, alertsActive: false, now }), false);
    assert.strictEqual(alertDue({ consecutiveFailures: 1, lastNotified: new Date(now).toISOString(), alertsActive: true, now }), true);
    assert.strictEqual(alertDue({ consecutiveFailures: 5, lastNotified: null, alertsActive: true, now }), true);
    assert.strictEqual(alertDue({ consecutiveFailures: 5, lastNotified: new Date(now - HOUR / 2).toISOString(), alertsActive: true, now }), false);
    assert.strictEqual(alertDue({ consecutiveFailures: 5, lastNotified: new Date(now - 2 * HOUR).toISOString(), alertsActive: true, now }), true);
    print('Test 1 OK');

    // Test 2: offline outside alert hours - recorded, no email; disabled devices aren't pinged
    print('Test 2: offline outside alert hours');
    let results = await run(false);
    assert.deepStrictEqual(pinged, ['192.0.2.10']);
    assert.deepStrictEqual(results.map((r) => [r.deviceId, r.status, r.consecutiveFailures]), [['fpp', 'offline', 1]]);
    assert.strictEqual(status().is_online, 0);
    assert.strictEqual(emails.length, 0);
    print('Test 2 OK');

    // Test 3: still down when alert hours start - one email (the old rule never sent it)
    print('Test 3: alert when alert hours start');
    clock += 5 * 60 * 1000;
    await run(true);
    assert.deepStrictEqual(emails, ['FPP Player']);
    assert.strictEqual(status().consecutive_failures, 2);
    assert.strictEqual(status().last_notified, new Date(clock).toISOString());
    clock += 5 * 60 * 1000;
    await run(true);
    assert.strictEqual(emails.length, 1, 'no repeat within the hour');
    clock += HOUR;
    await run(true);
    assert.strictEqual(emails.length, 2, 'repeat after an hour');
    print('Test 3 OK');

    // Test 4: back online - shown online straight away, failures reset, last alert kept
    print('Test 4: back online');
    const lastNotified = status().last_notified;
    online = true;
    clock += 5 * 60 * 1000;
    results = await run(false);
    assert.strictEqual(results[0].status, 'online');
    assert.deepStrictEqual(status(), {
      ...status(),
      is_online: 1,
      consecutive_failures: 0,
      last_seen_online: new Date(clock).toISOString(),
      last_notified: lastNotified,
    });
    print('Test 4 OK');

    // Test 5: an email failure still records the status and leaves last_notified alone
    print('Test 5: email failure');
    online = false;
    emailFails = true;
    clock += 2 * HOUR;
    await run(true);
    assert.strictEqual(status().is_online, 0);
    assert.strictEqual(status().consecutive_failures, 1);
    assert.strictEqual(status().last_notified, lastNotified);
    print('Test 5 OK');

    print('All tests passed');
  } catch (err) {
    console.error('[test-device-check] ❌', err);
    process.exitCode = 1;
  } finally {
    db.close();
  }
})();
