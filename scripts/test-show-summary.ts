import assert from 'assert';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { DateTime } from 'luxon';
import { getShowSummary, startOfShowDayUtc } from '../lib/show-summary';

function print(msg: string) {
  console.log('[test-show-summary] ' + msg);
}

const ZONE = 'America/Chicago';
const tmpDir = path.join(process.cwd(), 'tmp');
fs.mkdirSync(tmpDir, { recursive: true });
const dbPath = path.join(tmpDir, `test-show-summary-${process.pid}.db`);
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
const db = new Database(dbPath);

try {
  // Test 1: the day boundary is the show's local midnight, in UTC
  print('Test 1: start of the show day');
  // October is daylight time (UTC-5), December standard time (UTC-6)
  assert.strictEqual(startOfShowDayUtc(DateTime.fromISO('2026-10-17T20:00:00', { zone: ZONE }), ZONE), '2026-10-17 05:00:00');
  assert.strictEqual(startOfShowDayUtc(DateTime.fromISO('2026-12-12T20:00:00', { zone: ZONE }), ZONE), '2026-12-12 06:00:00');
  // 9:30 PM Central on 12 Dec is already 13 Dec in UTC: still counts from 12 Dec local midnight
  assert.strictEqual(startOfShowDayUtc(DateTime.fromISO('2026-12-13T03:30:00Z'), ZONE), '2026-12-12 06:00:00');
  print('Test 1 OK');

  // Tables as lib/database.ts creates them (only the columns the summary reads, plus defaults)
  db.exec(`
    CREATE TABLE jukebox_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sequence_name TEXT NOT NULL, requester_ip TEXT NOT NULL,
      status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sequence_name TEXT NOT NULL, vote_type TEXT NOT NULL,
      user_ip TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE santa_letters (
      id INTEGER PRIMARY KEY AUTOINCREMENT, child_name TEXT NOT NULL, parent_email TEXT NOT NULL,
      letter_content TEXT NOT NULL, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE devices (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, ip TEXT NOT NULL, enabled BOOLEAN DEFAULT 1
    );
    CREATE TABLE device_status (
      device_id TEXT PRIMARY KEY, is_online BOOLEAN NOT NULL DEFAULT 0, last_seen_online DATETIME
    );
  `);

  // Test 2: an empty database
  print('Test 2: empty database');
  assert.deepStrictEqual(getShowSummary(db, '2026-12-12 06:00:00'), {
    requestsToday: 0, votesToday: 0, lettersPending: 0, oldestPendingLetterAt: null,
    devicesTotal: 0, devicesOnline: 0, offlineDevices: [],
  });
  print('Test 2 OK');

  // Test 3: only rows from the boundary on count as today
  print('Test 3: today counts');
  const queue = db.prepare('INSERT INTO jukebox_queue (sequence_name, requester_ip, status, created_at) VALUES (?, ?, ?, ?)');
  queue.run('Carol of the Bells', '1.1.1.1', 'completed', '2026-12-12 05:59:59'); // yesterday evening, local
  queue.run('Wizards in Winter', '1.1.1.2', 'completed', '2026-12-12 06:00:00'); // exactly midnight, local
  queue.run('Jingle Bell Rock', '1.1.1.3', 'pending', '2026-12-13 03:30:00');    // 9:30 PM local
  const vote = db.prepare('INSERT INTO votes (sequence_name, vote_type, user_ip, created_at) VALUES (?, ?, ?, ?)');
  vote.run('Carol of the Bells', 'up', '1.1.1.1', '2026-12-11 23:00:00');
  vote.run('Carol of the Bells', 'up', '1.1.1.2', '2026-12-12 20:00:00');
  const summary = getShowSummary(db, '2026-12-12 06:00:00');
  assert.strictEqual(summary.requestsToday, 2);
  assert.strictEqual(summary.votesToday, 1);
  print('Test 3 OK');

  // Test 4: pending letters of any day, with the oldest one's time
  print('Test 4: pending letters');
  const letter = db.prepare('INSERT INTO santa_letters (child_name, parent_email, letter_content, status, created_at) VALUES (?, ?, ?, ?, ?)');
  letter.run('Emma', 'a@example.com', 'Dear Santa', 'pending', '2026-12-12 01:12:00');
  letter.run('Liam', 'b@example.com', 'Dear Santa', 'pending', '2026-12-13 01:31:00');
  letter.run('Noah', 'c@example.com', 'Dear Santa', 'sent', '2026-12-10 01:00:00');
  letter.run('Lucas', 'd@example.com', 'Dear Santa', 'rejected', '2026-12-09 01:00:00');
  const letters = getShowSummary(db, '2026-12-12 06:00:00');
  assert.strictEqual(letters.lettersPending, 2);
  assert.strictEqual(letters.oldestPendingLetterAt, '2026-12-12 01:12:00');
  print('Test 4 OK');

  // Test 5: device health: online, offline, never checked, and disabled devices
  print('Test 5: devices');
  const device = db.prepare('INSERT INTO devices (id, name, type, ip, enabled) VALUES (?, ?, ?, ?, ?)');
  device.run('tree', 'Mega tree', 'falcon', '192.168.1.61', 1);
  device.run('house', 'House outline', 'falcon', '192.168.1.62', 1);
  device.run('arches', 'Arches', 'falcon', '192.168.1.64', 1);
  device.run('old', 'Old controller', 'falcon', '192.168.1.99', 0);
  const status = db.prepare('INSERT INTO device_status (device_id, is_online, last_seen_online) VALUES (?, ?, ?)');
  status.run('tree', 0, '2026-12-13 01:42:00');
  status.run('house', 1, '2026-12-13 03:29:00');
  status.run('old', 0, null); // disabled: ignored even though it is offline
  const devices = getShowSummary(db, '2026-12-12 06:00:00');
  assert.strictEqual(devices.devicesTotal, 3, 'disabled devices are not counted');
  assert.strictEqual(devices.devicesOnline, 1);
  assert.deepStrictEqual(devices.offlineDevices, [{ id: 'tree', name: 'Mega tree', lastSeenOnline: '2026-12-13 01:42:00' }]);
  print('Test 5 OK');

  print('All tests passed');
} catch (err) {
  console.error('[test-show-summary] FAILED:', err);
  process.exitCode = 1;
} finally {
  db.close();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
}
