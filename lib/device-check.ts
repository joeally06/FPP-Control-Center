// Ping the admin's devices, record the result in device_status and email an alert when one is down.
// Used by the 3-minute background monitor (lib/device-monitor.ts) and the Check button
// (GET /api/devices/check). Devices are checked at any time; alerts only go out while
// alertsActive (during the monitoring schedule).

import type BetterSqlite3 from 'better-sqlite3';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { sendAlertEmail } from './email-service';

type Db = BetterSqlite3.Database;

const execFileAsync = promisify(execFile);

/** A device that is still down is re-alerted at most this often. */
const REALERT_INTERVAL_MS = 60 * 60 * 1000;

interface DeviceRow {
  id: string;
  name: string;
  ip: string;
}

interface DeviceStatusRow {
  last_seen_online: string | null;
  consecutive_failures: number | null;
  last_notified: string | null;
}

export interface DeviceCheckResult {
  deviceId: string;
  name: string;
  ip: string;
  status: 'online' | 'offline';
  consecutiveFailures: number;
  lastSeenOnline?: string | null;
}

export interface DeviceCheckOptions {
  /** Inside the monitoring schedule: offline devices may trigger an email */
  alertsActive: boolean;
  ping?: (ip: string) => Promise<boolean>;
  sendAlert?: (name: string, ip: string) => Promise<unknown>;
  now?: () => number;
}

/** Pings per check; one reply means online (a single dropped packet is common on Wi-Fi). */
const PING_ATTEMPTS = 3;

/** Failed checks in a row before an email goes out. */
const FAILURES_BEFORE_ALERT = 2;

// Ping a device using platform-specific ping command, retrying before giving up
export async function pingDevice(ip: string): Promise<boolean> {
  const isWindows = process.platform === 'win32';
  // Windows: -n 1 -w 2000 (1 packet, 2 second timeout); Linux/Mac: -c 1 -W 2
  const args = isWindows ? ['-n', '1', '-w', '2000', ip] : ['-c', '1', '-W', '2', ip];

  for (let attempt = 1; attempt <= PING_ATTEMPTS; attempt++) {
    try {
      await execFileAsync('ping', args);
      return true; // Success - device is online
    } catch (error: unknown) {
      console.log(`[Device Monitor] Ping ${attempt}/${PING_ATTEMPTS} failed for ${ip}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  return false; // Every attempt failed - device is offline
}

/**
 * Whether an offline device should trigger an email now: only during alert hours, after
 * FAILURES_BEFORE_ALERT failed checks in a row, and then once, or an hour after the last alert.
 */
export function alertDue(input: {
  consecutiveFailures: number;
  lastNotified: string | null;
  alertsActive: boolean;
  now: number;
}): boolean {
  if (!input.alertsActive) return false;
  if (input.consecutiveFailures < FAILURES_BEFORE_ALERT) return false;
  if (!input.lastNotified) return true;
  return new Date(input.lastNotified).getTime() < input.now - REALERT_INTERVAL_MS;
}

/** Check every enabled device once and store the results. */
export async function checkAllDevices(db: Db, options: DeviceCheckOptions): Promise<DeviceCheckResult[]> {
  const ping = options.ping ?? pingDevice;
  const sendAlert = options.sendAlert ?? sendAlertEmail;
  const now = options.now ?? Date.now;

  const devices = db.prepare('SELECT id, name, ip FROM devices WHERE enabled = 1 ORDER BY name').all() as DeviceRow[];
  const getStatus = db.prepare('SELECT last_seen_online, consecutive_failures, last_notified FROM device_status WHERE device_id = ?');
  const upsertStatus = db.prepare(`
    INSERT INTO device_status (device_id, is_online, last_checked, last_seen_online, consecutive_failures, last_notified)
    VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?)
    ON CONFLICT(device_id) DO UPDATE SET
      is_online = excluded.is_online,
      last_checked = CURRENT_TIMESTAMP,
      last_seen_online = excluded.last_seen_online,
      consecutive_failures = excluded.consecutive_failures,
      last_notified = excluded.last_notified
  `);

  const results: DeviceCheckResult[] = [];

  for (const device of devices) {
    console.log(`[Device Monitor] Checking ${device.name} (${device.ip})...`);
    const isOnline = await ping(device.ip);
    const previousStatus = getStatus.get(device.id) as DeviceStatusRow | undefined;

    if (isOnline) {
      console.log(`[Device Monitor] ✅ ${device.name} is ONLINE`);
      // last_notified is kept so a device flapping back down within the hour isn't re-alerted
      upsertStatus.run(device.id, 1, new Date(now()).toISOString(), 0, previousStatus?.last_notified ?? null);
      results.push({ deviceId: device.id, name: device.name, ip: device.ip, status: 'online', consecutiveFailures: 0 });
      continue;
    }

    const consecutiveFailures = (previousStatus?.consecutive_failures || 0) + 1;
    let lastNotified = previousStatus?.last_notified ?? null;
    console.log(`[Device Monitor] ❌ ${device.name} is OFFLINE (${consecutiveFailures} failures)`);

    if (alertDue({ consecutiveFailures, lastNotified, alertsActive: options.alertsActive, now: now() })) {
      console.log(`[Device Monitor] 📧 Sending alert email for ${device.name}...`);
      try {
        await sendAlert(device.name, device.ip);
        lastNotified = new Date(now()).toISOString();
        console.log(`[Device Monitor] ✅ Alert email sent for ${device.name}`);
      } catch (emailError) {
        console.error(`[Device Monitor] ❌ Failed to send alert email for ${device.name}:`, emailError);
      }
    } else if (!options.alertsActive) {
      console.log('[Device Monitor] 🔕 Alerts suppressed - outside monitoring hours');
    }

    upsertStatus.run(device.id, 0, previousStatus?.last_seen_online ?? null, consecutiveFailures, lastNotified);
    results.push({
      deviceId: device.id,
      name: device.name,
      ip: device.ip,
      status: 'offline',
      consecutiveFailures,
      lastSeenOnline: previousStatus?.last_seen_online ?? null,
    });
  }

  console.log(`[Device Monitor] Check complete. ${results.filter(r => r.status === 'online').length}/${results.length} devices online`);
  return results;
}
