import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { addToQueueTransactional, countRecentRequests, resetRequestLimit } from '../lib/jukebox-queue';

// Columns the queue insert writes (location columns since migration 016) and the reset table (migration 020)
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS jukebox_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sequence_name TEXT NOT NULL,
    media_name TEXT,
    requester_name TEXT,
    requester_ip TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    latitude REAL,
    longitude REAL,
    city TEXT,
    region TEXT,
    country_code TEXT,
    distance_from_show REAL
  );
  CREATE TABLE IF NOT EXISTS jukebox_rate_limit_resets (
    requester_ip TEXT PRIMARY KEY,
    reset_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

(async () => {
  const tmpDir = path.join(process.cwd(), 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const dbPath = path.join(tmpDir, 'test-jukebox-queue.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const db = new Database(dbPath);
  try {
    // Create minimal schema
    db.exec(SCHEMA);

    // Set test rate limit
    const rateLimit = 3;
    const requesterIp = '192.0.2.1';

    // Insert rateLimit items to reach limit
    const stmt = db.prepare(`INSERT INTO jukebox_queue (sequence_name, media_name, requester_name, requester_ip) VALUES (?, ?, ?, ?)`);
    for (let i = 0; i < rateLimit; i++) {
      stmt.run(`song-${i}`, null, 'Tester', requesterIp);
    }

    console.log('[test] Inserted initial items to reach rate limit');

    // Attempt to insert one more using transactional helper
    try {
      addToQueueTransactional(db, {
        sequence_name: 'song-4',
        media_name: null,
        requester_name: 'Tester',
        requester_ip: requesterIp,
        rateLimit
      });
      console.error('[test] ❌ Expected rate limit to block, but insert succeeded');
      process.exit(2);
    } catch (err: any) {
      if (err.code === 'RATE_LIMIT_EXCEEDED') {
        console.log('[test] ✅ Rate limit enforced as expected');
      } else {
        console.error('[test] ❌ Unexpected error:', err);
        process.exit(3);
      }
    }

    // Now test concurrency: start with 2 items used, rate limit 3
    // Create fresh DB
  } catch (err) {
    console.error('[test] Error during test:', err);
    process.exit(1);
  } finally {
    db.close();
  }

  // Test concurrency scenario
  const db2Path = path.join(tmpDir, 'test-jukebox-queue-2.db');
  if (fs.existsSync(db2Path)) fs.unlinkSync(db2Path);
  const db2 = new Database(db2Path);
  try {
    db2.exec(SCHEMA);

    const rateLimit2 = 3;
    const ip2 = '192.0.2.2';
    const stmt2 = db2.prepare(`INSERT INTO jukebox_queue (sequence_name, media_name, requester_name, requester_ip) VALUES (?, ?, ?, ?)`);
    stmt2.run('a', null, 'Tester', ip2);
    stmt2.run('b', null, 'Tester', ip2); // 2 used

    // Concurrent attempts: attempt to insert two entries simultaneously
    const p1 = new Promise((resolve, reject) => {
      try {
        const res = addToQueueTransactional(db2, {
          sequence_name: 'concurrent-1',
          requester_ip: ip2,
          rateLimit: rateLimit2
        } as any);
        resolve(res);
      } catch (e) {
        reject(e);
      }
    });

    const p2 = new Promise((resolve, reject) => {
      try {
        const res = addToQueueTransactional(db2, {
          sequence_name: 'concurrent-2',
          requester_ip: ip2,
          rateLimit: rateLimit2
        } as any);
        resolve(res);
      } catch (e) {
        reject(e);
      }
    });

    try {
      const [r1, r2] = await Promise.all([p1, p2].map(p => p.catch(err => err)));
      const results = [r1, r2];
      const successCount = results.filter(r => !(r instanceof Error)).length;
      const errorCount = results.filter(r => r instanceof Error && (r as any).code === 'RATE_LIMIT_EXCEEDED').length;

      console.log(`[concurrency test] success: ${successCount}, rate-limited: ${errorCount}`);
      if (successCount === 1 && errorCount === 1) {
        console.log('[test] ✅ Concurrency: only one of the concurrent inserts succeeded, the other was rate-limited');
      } else {
        console.error('[test] ❌ Concurrency test failed');
        process.exit(4);
      }
    } catch (err) {
      console.error('[test] Unexpected concurrency error:', err);
      process.exit(5);
    }
  } finally {
    db2.close();
  }

  // Admin "Clear": the playing song survives the clear but must stop counting toward the limit
  const db3Path = path.join(tmpDir, 'test-jukebox-queue-3.db');
  if (fs.existsSync(db3Path)) fs.unlinkSync(db3Path);
  const db3 = new Database(db3Path);
  try {
    db3.exec(SCHEMA);
    const rateLimit3 = 3;
    const ip3 = '192.0.2.3';
    const backdate = (minutes: number) => `datetime('now', '-${minutes} minutes')`;
    // Limit reached: one song playing, two waiting - all made a few minutes ago (before the clear)
    db3.exec(`
      INSERT INTO jukebox_queue (sequence_name, requester_ip, status, created_at) VALUES
        ('playing-song', '${ip3}', 'playing', ${backdate(5)}),
        ('queued-1', '${ip3}', 'pending', ${backdate(4)}),
        ('queued-2', '${ip3}', 'pending', ${backdate(3)}),
        ('other-visitor', '192.0.2.99', 'pending', ${backdate(3)});
    `);
    if (countRecentRequests(db3, ip3) !== 3) {
      console.error('[test] ❌ Expected 3 requests counted before the clear');
      process.exit(6);
    }

    // What DELETE /api/jukebox/users does: remove the waiting ones, keep the playing one, reset the count
    const clear = (ip: string) => {
      db3.prepare(`DELETE FROM jukebox_queue WHERE requester_ip = ? AND status IN ('pending', 'completed', 'skipped')`).run(ip);
      resetRequestLimit(db3, ip);
    };
    clear(ip3);
    if ((db3.prepare(`SELECT status FROM jukebox_queue WHERE requester_ip = ?`).all(ip3) as { status: string }[]).map((r) => r.status).join() !== 'playing') {
      console.error('[test] ❌ Clear should keep only the playing song');
      process.exit(12);
    }

    if (countRecentRequests(db3, ip3) !== 0) {
      console.error('[test] ❌ Playing song still counted after the clear');
      process.exit(7);
    }
    if (countRecentRequests(db3, '192.0.2.99') !== 1) {
      console.error("[test] ❌ Clearing one visitor changed another visitor's count");
      process.exit(8);
    }

    // Full allowance again, then the limit applies to new requests
    for (let i = 0; i < rateLimit3; i++) {
      addToQueueTransactional(db3, { sequence_name: `after-clear-${i}`, requester_ip: ip3, rateLimit: rateLimit3 });
    }
    try {
      addToQueueTransactional(db3, { sequence_name: 'one-too-many', requester_ip: ip3, rateLimit: rateLimit3 });
      console.error('[test] ❌ Expected the limit to apply again after the clear');
      process.exit(9);
    } catch (err: any) {
      if (err.code !== 'RATE_LIMIT_EXCEEDED') throw err;
    }

    // Clearing again moves the reset forward
    db3.exec(`UPDATE jukebox_rate_limit_resets SET reset_at = ${backdate(10)} WHERE requester_ip = '${ip3}'`);
    clear(ip3);
    const resetRow = db3.prepare(`SELECT reset_at >= datetime('now', '-1 minute') AS fresh FROM jukebox_rate_limit_resets WHERE requester_ip = ?`).get(ip3) as { fresh: number };
    if (!resetRow.fresh || countRecentRequests(db3, ip3) !== 0) {
      console.error('[test] ❌ A second clear did not reset the count');
      process.exit(10);
    }
    console.log('[test] ✅ Clear: playing song kept but not counted, full allowance restored, limit applies again');
  } catch (err) {
    console.error('[test] Unexpected error in clear test:', err);
    process.exit(11);
  } finally {
    db3.close();
  }

  process.exit(0);
})();
