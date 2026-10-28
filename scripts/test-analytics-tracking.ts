// Not UTC, so a duration worked out with local-time parsing of SQLite's UTC timestamps would fail here
process.env.TZ = 'America/Los_Angeles';

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { parseSessionId, recordTrackEvent, sanitizePagePath, trimUserAgent, type GeoLocation } from '../lib/analytics-tracking';

function print(msg: string) {
  console.log('[test-analytics-tracking] ' + msg);
}

const db = new Database(':memory:');
db.exec(fs.readFileSync(path.join(process.cwd(), 'migrations', '001_initial_schema.sql'), 'utf-8'));

let geoCalls = 0;
const noGeo: GeoLocation = { city: null, region: null, country: null };
const lookupGeo = async () => {
  geoCalls++;
  return { city: 'Springfield', region: 'IL', country: 'US' };
};
const as = (visitorHash: string, userAgent = 'test-agent') => ({ visitorHash, userAgent, lookupGeo });
const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

async function main() {
  print('Test 1: page paths and session IDs from the browser are checked');
  assert.strictEqual(sanitizePagePath('/jukebox', '/x'), '/jukebox');
  assert.strictEqual(sanitizePagePath('/a/b?c=1', '/x'), '/a/b?c=1');
  for (const bad of [undefined, null, 5, {}, '', 'jukebox', '//' + 'a'.repeat(300), '/a\nb', '/a\u0000b']) {
    assert.strictEqual(sanitizePagePath(bad, '/x'), '/x', JSON.stringify(bad));
  }
  assert.strictEqual(sanitizePagePath('/' + 'a'.repeat(199), '/x').length, 200);
  assert.strictEqual(parseSessionId(7), 7);
  for (const bad of ['7', 0, -1, 1.5, NaN, Infinity, null, undefined, {}, 2 ** 60]) {
    assert.strictEqual(parseSessionId(bad), null, String(bad));
  }
  assert.strictEqual(trimUserAgent('x'.repeat(1000)).length, 300);

  print('Test 2: a first visit creates the visitor, session and page view, with one location lookup');
  const first = await recordTrackEvent(db, { action: 'visit', page: '/jukebox' }, as('alice'));
  assert.strictEqual(first.status, 200);
  assert.strictEqual(first.body.isReturning, false);
  assert.strictEqual(typeof first.body.sessionId, 'number');
  assert.strictEqual(geoCalls, 1);
  assert.strictEqual(count('visitors'), 1);
  assert.strictEqual(count('sessions'), 1);
  assert.strictEqual(count('page_views'), 1);
  assert.strictEqual((db.prepare('SELECT city FROM visitors').get() as { city: string }).city, 'Springfield');

  print('Test 3: a returning visitor makes no location lookup and counts as returning');
  const second = await recordTrackEvent(db, { action: 'visit' }, as('alice'));
  assert.strictEqual(second.body.isReturning, true);
  assert.strictEqual(geoCalls, 1);
  assert.strictEqual((db.prepare("SELECT total_visits AS n FROM visitors WHERE visitor_hash = 'alice'").get() as { n: number }).n, 2);
  assert.strictEqual((db.prepare('SELECT page_path FROM page_views ORDER BY id DESC LIMIT 1').get() as { page_path: string }).page_path, '/jukebox');

  print('Test 4: a visitor with no location answer is still recorded');
  await recordTrackEvent(db, { action: 'visit' }, { visitorHash: 'carol', userAgent: 'ua', lookupGeo: async () => noGeo });
  assert.strictEqual((db.prepare("SELECT city FROM visitors WHERE visitor_hash = 'carol'").get() as { city: string | null }).city, null);

  print('Test 5: only the visitor who owns a session can add page views to it or end it');
  const sessionId = first.body.sessionId as number;
  const before = count('page_views');

  const stranger = await recordTrackEvent(db, { action: 'pageview', page: '/x', sessionId }, as('mallory'));
  assert.strictEqual(stranger.status, 404);
  assert.strictEqual(count('page_views'), before, 'a stranger added a page view');
  const strangerEnd = await recordTrackEvent(db, { action: 'end', sessionId }, as('mallory'));
  assert.strictEqual(strangerEnd.status, 404);
  assert.strictEqual((db.prepare('SELECT session_end FROM sessions WHERE id = ?').get(sessionId) as { session_end: string | null }).session_end, null);

  for (const bad of ['1', 99999, -1, null, undefined, 1.5]) {
    const result = await recordTrackEvent(db, { action: 'pageview', sessionId: bad }, as('alice'));
    assert.strictEqual(result.status, 404, `sessionId ${String(bad)}`);
  }
  assert.strictEqual(count('page_views'), before);

  const own = await recordTrackEvent(db, { action: 'pageview', page: '/santa', sessionId }, as('alice'));
  assert.strictEqual(own.status, 200);
  assert.strictEqual(count('page_views'), before + 1);
  assert.strictEqual((db.prepare('SELECT page_views AS n FROM sessions WHERE id = ?').get(sessionId) as { n: number }).n, 2);

  print('Test 6: ending a session records the duration once');
  db.prepare("UPDATE sessions SET session_start = datetime('now', '-90 seconds') WHERE id = ?").run(sessionId);
  assert.strictEqual((await recordTrackEvent(db, { action: 'end', sessionId }, as('alice'))).status, 200);
  const ended = db.prepare('SELECT session_end, duration_seconds AS d FROM sessions WHERE id = ?').get(sessionId) as { session_end: string; d: number };
  assert.ok(ended.session_end);
  assert.ok(ended.d >= 89 && ended.d <= 92, `duration ${ended.d}`);
  db.prepare("UPDATE sessions SET session_start = datetime('now', '-9000 seconds') WHERE id = ?").run(sessionId);
  await recordTrackEvent(db, { action: 'end', sessionId }, as('alice'));
  assert.strictEqual((db.prepare('SELECT duration_seconds AS d FROM sessions WHERE id = ?').get(sessionId) as { d: number }).d, ended.d, 'a second end changed the duration');

  print('Test 7: long or odd input is cut down or replaced');
  const long = await recordTrackEvent(db, { action: 'visit', page: '/' + 'a'.repeat(5000) }, as('dave', 'u'.repeat(5000)));
  const stored = db.prepare('SELECT page_path FROM page_views WHERE session_id = ?').get(long.body.sessionId) as { page_path: string };
  assert.strictEqual(stored.page_path, '/jukebox');
  assert.strictEqual((db.prepare('SELECT length(user_agent) AS n FROM sessions WHERE id = ?').get(long.body.sessionId) as { n: number }).n, 300);

  print('Test 7b: two first visits at once from the same new address both succeed');
  const racing = await recordTrackEvent(db, { action: 'visit' }, {
    visitorHash: 'erin',
    userAgent: 'ua',
    lookupGeo: async () => {
      // the other tab's visit lands while this one waits for the location answer
      db.prepare("INSERT INTO visitors (visitor_hash) VALUES ('erin')").run();
      return noGeo;
    },
  });
  assert.strictEqual(racing.status, 200);
  assert.strictEqual((db.prepare("SELECT COUNT(*) AS n FROM visitors WHERE visitor_hash = 'erin'").get() as { n: number }).n, 1);

  print('Test 8: unknown actions are refused');
  for (const action of [undefined, 'drop', 5, null]) {
    assert.strictEqual((await recordTrackEvent(db, { action }, as('alice'))).status, 400);
  }

  // ── The route wires the limits in ───────────────────────────────────────
  print('Test 9: the route rate limits requests and visits, and caps location lookups');
  const route = fs.readFileSync(path.join(process.cwd(), 'app', 'api', 'analytics', 'track', 'route.ts'), 'utf-8');
  const limit = (name: string) => route.match(new RegExp(`const ${name} = createFixedWindowLimiter\\(\\{ windowMs: 60_000, max: (\\d+) \\}\\)`))?.[1];
  assert.strictEqual(limit('requestLimiter'), '60', 'requests per minute per IP');
  assert.strictEqual(limit('visitLimiter'), '10', 'visits per minute per IP');
  assert.strictEqual(limit('geolocationLimiter'), '30', 'location lookups per minute, all visitors together');
  const recordAt = route.indexOf('recordTrackEvent(getDb()');
  for (const check of ['requestLimiter.allow(ip)', 'visitLimiter.allow(ip)']) {
    const at = route.indexOf(check);
    assert.ok(at > -1 && at < recordAt, `${check} must run before anything is written`);
  }
  assert.ok(/geolocationLimiter\.allow\(/.test(route), 'outbound location lookups are capped');
  assert.ok(/status: 429/.test(route));

  db.close();
  print('All tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
