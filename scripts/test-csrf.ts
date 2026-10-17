import assert from 'assert';
import { isSameOriginRequest, CsrfEnv } from '../lib/csrf';

function print(msg: string) {
  console.log('[test-csrf] ' + msg);
}

function req(headers: Record<string, string>, env: CsrfEnv): boolean {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return isSameOriginRequest({ get: (name: string) => lower[name.toLowerCase()] ?? null }, env);
}

const PROD: CsrfEnv = { nextAuthUrl: 'https://show.example.com', trustedDomains: 'show.example.com,www.show.example.com' };
const LAN: CsrfEnv = { nextAuthUrl: 'http://192.168.1.50:3000' };
const HOST = { Host: 'show.example.com' };

// Test 1: the reproduced attacks from the spec are all rejected (old code allowed the first three in PROD)
(() => {
  print('Test 1: cross-site attacks are rejected');
  assert.strictEqual(req({ ...HOST, Origin: 'https://evil.com' }, PROD), false, 'foreign Origin must be rejected even though Host matches');
  assert.strictEqual(req({ ...HOST, Origin: 'null' }, PROD), false, 'Origin: null must be rejected');
  assert.strictEqual(req({ ...HOST, 'Sec-Fetch-Site': 'cross-site' }, PROD), false, 'cross-site with no Origin/Referer must be rejected');
  assert.strictEqual(req({ Host: '192.168.1.50:3000', Origin: 'http://localhost.evil.com' }, LAN), false, 'prefix-lookalike must be rejected');
  assert.strictEqual(req({ Host: '192.168.1.50:3000', Origin: 'https://evil.com' }, LAN), false);
  print('Test 1 OK');
})();

// Test 2: lookalike hosts are not matched by prefix/suffix
(() => {
  print('Test 2: lookalike hosts rejected');
  assert.strictEqual(req({ ...HOST, Origin: 'https://show.example.com.evil.com' }, PROD), false);
  assert.strictEqual(req({ ...HOST, Origin: 'https://evilshow.example.com' }, PROD), false);
  assert.strictEqual(req({ ...HOST, Origin: 'https://show.example.com:8443' }, PROD), false, 'different port is a different origin');
  assert.strictEqual(req({ ...HOST, Origin: 'ftp://show.example.com' }, PROD), false, 'non-http(s) scheme rejected');
  print('Test 2 OK');
})();

// Test 3: legitimate same-origin browser requests are allowed
(() => {
  print('Test 3: legitimate requests allowed');
  assert.strictEqual(req({ ...HOST, Origin: 'https://show.example.com', 'Sec-Fetch-Site': 'same-origin' }, PROD), true);
  assert.strictEqual(req({ ...HOST, Origin: 'https://show.example.com' }, PROD), true, 'no Sec-Fetch-Site (older browser) but Origin matches');
  assert.strictEqual(req({ ...HOST, Referer: 'https://show.example.com/jukebox?x=1' }, PROD), true, 'Referer fallback when Origin absent');
  assert.strictEqual(req({ Host: 'show.example.com', Origin: 'https://www.show.example.com' }, PROD), true, 'TRUSTED_DOMAINS entry');
  assert.strictEqual(req({ Host: 'localhost:3000', Origin: 'https://show.example.com' }, PROD), true, 'NEXTAUTH_URL host allowed when Host is rewritten');
  assert.strictEqual(req({ Host: 'show.example.com', 'Sec-Fetch-Site': 'none' }, PROD), true, 'user-initiated');
  print('Test 3 OK');
})();

// Test 4: LAN / localhost access works through Host equality, no special-casing needed
(() => {
  print('Test 4: LAN and localhost');
  assert.strictEqual(req({ Host: '192.168.1.50:3000', Origin: 'http://192.168.1.50:3000' }, LAN), true);
  assert.strictEqual(req({ Host: '10.0.0.7:3000', Origin: 'http://10.0.0.7:3000' }, LAN), true, 'other LAN IP the browser actually used');
  assert.strictEqual(req({ Host: 'localhost:3000', Origin: 'http://localhost:3000' }, {}), true, 'dev with no env at all');
  assert.strictEqual(req({ Host: 'localhost:3000', Origin: 'http://localhost:4000' }, {}), false, 'other localhost port is another origin');
  print('Test 4 OK');
})();

// Test 5: sibling subdomains (same-site) are not trusted
(() => {
  print('Test 5: same-site is not same-origin');
  assert.strictEqual(req({ ...HOST, Origin: 'https://blog.example.com', 'Sec-Fetch-Site': 'same-site' }, PROD), false);
  assert.strictEqual(req({ ...HOST, 'Sec-Fetch-Site': 'same-site' }, PROD), false);
  print('Test 5 OK');
})();

// Test 6: non-browser clients (no Origin, Referer, or Sec-Fetch-Site) are allowed; they cannot carry a victim's cookies
(() => {
  print('Test 6: non-browser clients');
  assert.strictEqual(req({ ...HOST }, PROD), true);
  assert.strictEqual(req({}, {}), true);
  print('Test 6 OK');
})();

// Test 7: malformed headers fail closed
(() => {
  print('Test 7: malformed headers');
  assert.strictEqual(req({ ...HOST, Origin: 'not a url' }, PROD), false);
  assert.strictEqual(req({ ...HOST, Referer: '::::' }, PROD), false);
  assert.strictEqual(req({ ...HOST, Origin: 'https://evil.com', Referer: 'https://show.example.com/' }, PROD), false, 'Origin takes precedence over Referer');
  assert.strictEqual(req({ ...HOST, Origin: 'https://show.example.com' }, { nextAuthUrl: 'garbage', appUrl: '' }), true, 'bad env values are ignored, not fatal');
  print('Test 7 OK');
})();

// Test 8: documented tradeoff — scheme is not compared
(() => {
  print('Test 8: scheme is ignored (documented)');
  assert.strictEqual(req({ ...HOST, Origin: 'http://show.example.com' }, PROD), true);
  print('Test 8 OK');
})();

print('All tests passed.');
