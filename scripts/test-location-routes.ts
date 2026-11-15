import assert from 'assert';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { migrateDatabase } from './database-migrations';

async function main() {
  const tmp = path.resolve('tmp');
  fs.mkdirSync(tmp, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tmp, 'test-location-routes-'));
  const databasePath = path.join(dir, 'test.db');
  process.env.VOTES_DB_PATH = databasePath;
  const seed = new Database(databasePath);
  migrateDatabase(seed);
  seed.prepare("INSERT INTO cached_sequences (sequence_name) VALUES ('Carol')").run();
  seed.prepare('UPDATE location_restrictions SET is_active = 1, show_latitude = 0, show_longitude = 0, max_distance_miles = 1').run();
  seed.close();
  // Import only after selecting the throwaway database. No server/background jobs are started.
  const vote = require('../app/api/votes/route.ts') as typeof import('../app/api/votes/route');
  const queue = require('../app/api/jukebox/queue/route.ts') as typeof import('../app/api/jukebox/queue/route');
  const { getDb } = require('../lib/database.ts') as typeof import('../lib/database');
  const db = getDb();
  const request = (body: object) => new NextRequest('http://localhost/api/test', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-fpp-client-ip': '203.0.113.8' }, body: JSON.stringify(body) });
  for (const [handler, body] of [[vote.POST, { sequenceName: 'Carol', voteType: 'up' }], [queue.POST, { sequence_name: 'Carol' }]] as const) {
    for (const [userLocation, status] of [[undefined, 403], [{ lat: '0', lng: 0 }, 400], [{ lat: 10, lng: 10 }, 403]] as const) {
      assert.strictEqual((await handler(request({ ...body, userLocation }))).status, status);
    }
    db.prepare('UPDATE location_restrictions SET show_latitude = NULL').run();
    assert.strictEqual((await handler(request({ ...body, userLocation: { lat: 0, lng: 0 } }))).status, 503);
    db.prepare('UPDATE location_restrictions SET show_latitude = 0').run();
  }
  assert.strictEqual((db.prepare('SELECT COUNT(*) n FROM votes').get() as { n: number }).n, 0);
  assert.strictEqual((db.prepare('SELECT COUNT(*) n FROM jukebox_queue').get() as { n: number }).n, 0);
  assert.strictEqual((await vote.POST(request({ sequenceName: 'Carol', voteType: 'up', userLocation: { lat: 0, lng: 0 } }))).status, 200);
  const accepted = await queue.POST(request({ sequence_name: 'Carol', userLocation: { lat: 0, lng: 0 } }));
  assert.strictEqual(accepted.status, 200, JSON.stringify(await accepted.clone().json()));
  assert.strictEqual((await accepted.json()).requestsUsed, 1, 'rejections consumed no request allowance');
  // Connections are process-scoped, so this fixture is left under ignored tmp/ for this test process.
  console.log('[test-location-routes] All tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
