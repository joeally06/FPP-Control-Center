import assert from 'assert';
import fs from 'fs';
import path from 'path';

function print(msg: string) {
  console.log('[test-api-auth] ' + msg);
}

// proxy.ts does not protect /api/*, so every route file must check the caller itself. A route that
// is public on purpose is listed here with the reason. A new route fails this test until it either
// calls an auth check or is added here, so "public" is always a decision someone made.
//
// File level: a file that guards its PUT but has a public GET counts as guarded, so read the
// handlers when you add a method to a guarded file.
const PUBLIC_ROUTES: Record<string, string> = {
  'analytics/track': 'visitor page views; per-IP rate limits',
  'audio/sync': 'visitors listening along on their phones',
  'display/stream': 'the /display sign (kiosk) event stream',
  'fpp/cached-status': 'now-playing status for the visitor and home pages',
  'fpp/health': 'online/offline banner for all visitors',
  'fpp/playlists/list': 'read-only FPP playlist names',
  'fpp/playlists/[name]': 'read-only FPP playlist contents',
  'fpp/sequences/list': 'read-only FPP sequence names',
  'health': 'uptime check',
  'jukebox/audience': 'visitor page: "N watching now"',
  'jukebox/metadata': 'visitor page: song details',
  'jukebox/now-playing': 'visitor page',
  'jukebox/playlist': 'visitor page',
  'jukebox/playlists': 'visitor page: themed playlists',
  'jukebox/popular': 'visitor page',
  'jukebox/queue': 'visitor song requests; IP rate limit and location check',
  'jukebox/request-status': 'visitor page: place in line',
  'jukebox/schedule-status': 'visitor page: show times',
  'jukebox/sequences': 'visitor page: song list',
  'jukebox/settings': 'visitor page: public display settings',
  'jukebox/videos': 'visitor page: light show videos',
  'location-restrictions/check': 'visitor in/out of range; IP rate limit',
  'santa/check-limit': 'visitor Santa form',
  'santa/confirm': 'parent confirms by emailed token',
  'santa/send-letter': 'visitor Santa form; rate limits and confirmation email',
  'santa/settings': 'visitor Santa form: public settings',
  'trivia/play': 'visitor trivia; rate limited',
  'trivia/play/answer': 'visitor trivia; scored on the server',
  'trivia/play/question': 'visitor trivia',
  'version': 'app version',
  'votes': 'visitor votes; IP rate limit',
  'youtube-videos': 'visitor page: light show videos',
};

// Calls (not mentions): requireAdmin(), requireAdminWithRateLimit(), isAdminSession(), isAdminEmail(),
// or a check against the internal API key used by server-to-server routes.
const GUARD = /\b(requireAdmin|requireAdminWithRateLimit|isAdminSession|isAdminEmail)\(|INTERNAL_API_KEY/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === 'route.ts') out.push(full);
  }
  return out;
}

function withoutComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\/?\*)/.test(line))
    .join('\n');
}

const apiDir = path.join(process.cwd(), 'app', 'api');
const routes = walk(apiDir).map((file) => ({
  name: path.relative(apiDir, file).split(path.sep).join('/').replace(/\/route\.ts$/, ''),
  source: withoutComments(fs.readFileSync(file, 'utf-8')),
}));

print('Test 1: every API route calls an auth check or is on the reviewed public list');
assert.ok(routes.length > 90, `the scan found the routes (${routes.length})`);
const unguarded = routes.filter((r) => !GUARD.test(r.source)).map((r) => r.name).sort();
const unlisted = unguarded.filter((name) => !(name in PUBLIC_ROUTES));
assert.deepStrictEqual(
  unlisted,
  [],
  `No auth check in: ${unlisted.join(', ')}. Call requireAdmin() (lib/auth-helpers.ts), or add the route to PUBLIC_ROUTES with the reason it is public.`
);

print('Test 2: the public list has no stale entries');
const routeNames = new Set(routes.map((r) => r.name));
const gone = Object.keys(PUBLIC_ROUTES).filter((name) => !routeNames.has(name));
assert.deepStrictEqual(gone, [], `Listed as public but no such route: ${gone.join(', ')}`);
const nowGuarded = Object.keys(PUBLIC_ROUTES).filter((name) => routeNames.has(name) && !unguarded.includes(name));
assert.deepStrictEqual(nowGuarded, [], `Listed as public but now calls an auth check, remove from the list: ${nowGuarded.join(', ')}`);

print('Test 3: the routes that must never be public are guarded');
for (const prefix of ['admin/', 'fppd/', 'web/']) {
  const open = routes.filter((r) => r.name.startsWith(prefix) && !GUARD.test(r.source)).map((r) => r.name);
  assert.deepStrictEqual(open, [], `${prefix}* must stay admin-only`);
}

print('All tests passed');
