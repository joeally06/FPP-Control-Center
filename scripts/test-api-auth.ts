import assert from 'assert';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

function print(msg: string) {
  console.log('[test-api-auth] ' + msg);
}

// proxy.ts does not protect /api/*, so every route handler must check the caller itself. A handler
// that is public on purpose is listed here with the reason. A new handler fails this test until it
// either calls an auth check or is added here, so "public" is always a decision someone made.
//
// The check is per handler (GET, POST, ...): a guarded PUT does not cover a public GET in the same file.
// [route, methods, why it is public]
const PUBLIC_TABLE: Array<[string, string, string]> = [
  ['analytics/track', 'POST', 'visitor page views; per-IP rate limits'],
  ['audio/sync', 'GET', 'visitors listening along on their phones'],
  ['auth/[...nextauth]', 'GET POST', 'next-auth sign-in handler'],
  ['display/config', 'GET', 'the /display sign (kiosk) reads its settings'],
  ['display/stream', 'GET', 'the /display sign (kiosk) event stream'],
  ['fpp/cached-status', 'GET', 'now-playing status for the visitor and home pages'],
  ['fpp/health', 'GET', 'online/offline banner for all visitors'],
  ['fpp/playlists/list', 'GET', 'read-only FPP playlist names'],
  ['fpp/playlists/[name]', 'GET', 'read-only FPP playlist contents'],
  ['fpp/sequences/list', 'GET', 'read-only FPP sequence names'],
  ['health', 'GET', 'uptime check'],
  ['jukebox/audience', 'GET', 'visitor page: "N watching now"'],
  ['jukebox/banner-config', 'GET', 'visitor page: off-season message'],
  ['jukebox/metadata', 'GET', 'visitor page: song details'],
  ['jukebox/now-playing', 'GET HEAD', 'visitor page'],
  ['jukebox/offline-banner', 'GET', 'visitor page: show-is-inactive message'],
  ['jukebox/playlist', 'GET HEAD', 'visitor page'],
  ['jukebox/playlists', 'GET', 'visitor page: themed playlists'],
  ['jukebox/popular', 'GET', 'visitor page'],
  ['jukebox/queue', 'GET POST', 'visitor song requests; IP rate limit and location check'],
  ['jukebox/request-status', 'GET', 'visitor page: place in line'],
  ['jukebox/schedule-status', 'GET', 'visitor page: show times'],
  ['jukebox/sequences', 'GET', 'visitor page: song list'],
  ['jukebox/settings', 'GET', 'visitor page: public display settings'],
  ['jukebox/song-art/[id]', 'GET', 'visitor page and TV: a song picture (read-only; re-encoded WebP bytes)'],
  ['jukebox/status', 'GET', 'visitor page: now playing (requester IPs removed)'],
  ['jukebox/videos', 'GET HEAD', 'visitor page: light show videos'],
  ['location-restrictions/check', 'POST', 'visitor in/out of range; IP rate limit'],
  ['santa/check-limit', 'POST', 'visitor Santa form'],
  ['santa/confirm', 'POST', 'parent confirms by emailed token'],
  ['santa/send-letter', 'POST', 'visitor Santa form; rate limits and confirmation email'],
  ['santa/settings', 'GET', 'visitor Santa form: public settings'],
  ['theme', 'GET', 'visitor pages: the active theme'],
  ['theme/asset', 'GET', 'visitor pages: theme images'],
  ['trivia/play', 'POST', 'visitor trivia; rate limited'],
  ['trivia/play/answer', 'POST', 'visitor trivia; scored on the server'],
  ['trivia/play/question', 'POST', 'visitor trivia'],
  ['version', 'GET', 'app version'],
  ['votes', 'GET POST', 'visitor votes; IP rate limit'],
  ['youtube-videos', 'GET', 'visitor page: light show videos'],
];

const PUBLIC_HANDLERS = new Set(
  PUBLIC_TABLE.flatMap(([route, methods]) => methods.split(' ').map((method) => `${route} ${method}`))
);

// Calls (not mentions) to one of these functions, or a read of INTERNAL_API_KEY, found in the parsed code.
// Strings and comments are not code, so mentioning a guard there does not count.
// Limit: this catches a handler that forgets its guard, not code written to fool it. Names are matched
// as spelled, so a local variable that shadows a guard name, or a guard inside a nested function that is
// never called, still counts. Telling those apart needs real scope analysis; read the handler when in doubt.
const GUARD_CALLS = new Set(['requireAdmin', 'requireAdminWithRateLimit', 'isAdminSession', 'isAdminEmail']);
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/** What a node calls by bare name (`adminOnly()`, not `obj.adminOnly()`), and whether it reads INTERNAL_API_KEY */
function guardInfo(node: ts.Node): { guard: boolean; calls: Set<string> } {
  const calls = new Set<string>();
  let guard = false;
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      calls.add(n.expression.text);
      if (GUARD_CALLS.has(n.expression.text)) guard = true;
    }
    if (ts.isPropertyAccessExpression(n) && n.name.text === 'INTERNAL_API_KEY') guard = true;
    ts.forEachChild(n, visit);
  };
  visit(node);
  return { guard, calls };
}

/**
 * The route handlers in a route.ts source and whether each one reaches an auth check.
 * A handler counts as guarded when its own code calls a guard, or calls (by bare name) a function in
 * the same file that is guarded (a local `adminOnly()` helper, or POST handing over to GET).
 */
function scanHandlers(source: string): Array<{ method: string; guarded: boolean }> {
  const file = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  // Top-level functions and consts by name, plus which names are exported
  const pieces = new Map<string, { guard: boolean; calls: Set<string> }>();
  const exported = new Set<string>();
  const handlers = new Map<string, string>(); // method -> name of the piece that holds its code
  const isExported = (n: ts.Node) => !!ts.getModifiers(n as ts.HasModifiers)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      pieces.set(statement.name.text, guardInfo(statement));
      if (isExported(statement)) exported.add(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        pieces.set(decl.name.text, guardInfo(decl));
        if (isExported(statement)) exported.add(decl.name.text);
      }
    } else if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      // `export { handler as GET, handler as POST }`
      for (const el of statement.exportClause.elements) {
        if (METHODS.includes(el.name.text)) handlers.set(el.name.text, (el.propertyName ?? el.name).text);
      }
    }
  }
  for (const name of exported) if (METHODS.includes(name)) handlers.set(name, name);

  // A piece is guarded when it has a guard, or calls a guarded piece (repeat until nothing changes)
  const guarded = new Set<string>();
  for (const [name, info] of pieces) if (info.guard) guarded.add(name);
  for (let changed = true; changed; ) {
    changed = false;
    for (const [name, info] of pieces) {
      if (!guarded.has(name) && [...info.calls].some((callee) => callee !== name && guarded.has(callee))) {
        guarded.add(name);
        changed = true;
      }
    }
  }

  return [...handlers].map(([method, name]) => ({ method, guarded: guarded.has(name) }));
}

print('Test 0: the scanner reads handlers correctly');
const found = (source: string) =>
  Object.fromEntries(scanHandlers(source).map((h) => [h.method, h.guarded]));
assert.deepStrictEqual(
  found(`
    export async function GET() { return 1; }
    export async function PUT() { await requireAdmin(); }
  `),
  { GET: false, PUT: true },
  'a guarded PUT does not cover an open GET in the same file'
);
assert.deepStrictEqual(
  found(`
    function adminOnly() { return isAdminSession(s); }
    function helper() { return 1; }
    export async function GET() { if (!(await adminOnly())) return 1; }
    export async function POST() { return helper(); }
  `),
  { GET: true, POST: false },
  'a handler that calls a guarded local helper is guarded; one that calls an unguarded helper is not'
);
assert.deepStrictEqual(
  found(`
    export async function GET() { await requireAdmin(); }
    export async function POST() { return GET(); }
  `),
  { GET: true, POST: true },
  'a handler that hands over to a guarded handler is guarded'
);
assert.deepStrictEqual(
  found(`
    const handler = NextAuth(options);
    export { handler as GET, handler as POST };
  `),
  { GET: false, POST: false },
  're-exported handlers are found'
);
assert.deepStrictEqual(
  found(`
    // await requireAdmin();
    export async function GET() { return 1; }
  `),
  { GET: false },
  'a guard that is only in a comment does not count'
);
assert.deepStrictEqual(found(`export async function helperNotAHandler() { await requireAdmin(); }`), {}, 'other exports are not handlers');
assert.deepStrictEqual(
  found(`
    export async function GET() { return Response.json({}); }
    export const PUT: () => Promise<Response> = async () => { await requireAdmin(); return Response.json({}); };
  `),
  { GET: false, PUT: true },
  'a typed const handler is found, and its guard does not leak into the handler before it'
);
assert.deepStrictEqual(
  found(`
    export async function GET() { return Response.json({ message: 'requireAdmin()' }); }
    export async function POST() { /* requireAdmin(); */ return Response.json({}); }
  `),
  { GET: false, POST: false },
  'a guard named in a string or a block comment does not count'
);
assert.deepStrictEqual(
  found(`
    function adminOnly() { return isAdminSession(s); }
    export async function GET() { return unrelated.adminOnly(); }
  `),
  { GET: false },
  'a method that happens to share a local helper name is not a call to that helper'
);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === 'route.ts') out.push(full);
  }
  return out;
}

const apiDir = path.join(process.cwd(), 'app', 'api');
const handlers = walk(apiDir).flatMap((file) => {
  const route = path.relative(apiDir, file).split(path.sep).join('/').replace(/\/route\.ts$/, '');
  return scanHandlers(fs.readFileSync(file, 'utf-8')).map((h) => ({ key: `${route} ${h.method}`, route, guarded: h.guarded }));
});

print('Test 1: every API handler calls an auth check or is on the reviewed public list');
assert.ok(handlers.length > 100, `the scan found the handlers (${handlers.length})`);
const unguarded = handlers.filter((h) => !h.guarded).map((h) => h.key).sort();
const unlisted = unguarded.filter((key) => !PUBLIC_HANDLERS.has(key));
assert.deepStrictEqual(
  unlisted,
  [],
  `No auth check in: ${unlisted.join(', ')}. Call requireAdmin() (lib/auth-helpers.ts), or add the handler to PUBLIC_TABLE with the reason it is public.`
);

print('Test 2: the public list has no stale entries');
const handlerKeys = new Set(handlers.map((h) => h.key));
const gone = [...PUBLIC_HANDLERS].filter((key) => !handlerKeys.has(key));
assert.deepStrictEqual(gone, [], `Listed as public but no such handler: ${gone.join(', ')}`);
const nowGuarded = [...PUBLIC_HANDLERS].filter((key) => handlerKeys.has(key) && !unguarded.includes(key));
assert.deepStrictEqual(nowGuarded, [], `Listed as public but now calls an auth check, remove from the list: ${nowGuarded.join(', ')}`);

print('Test 3: the routes that must never be public are guarded');
for (const prefix of ['admin/', 'fppd/', 'web/']) {
  const open = handlers.filter((h) => h.route.startsWith(prefix) && !h.guarded).map((h) => h.key);
  assert.deepStrictEqual(open, [], `${prefix}* must stay admin-only`);
}

print('All tests passed');
