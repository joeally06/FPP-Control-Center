import assert from 'assert';
import { resolveFppUrl, getFppPort, fetchFpp } from '../lib/fpp-config';

async function main() {
  console.log('[test-fpp-config] canonical URL, custom LAN addresses, schemes and legacy precedence');
  assert.strictEqual(resolveFppUrl({}), 'http://fpp.local');
  assert.strictEqual(resolveFppUrl({ FPP_URL: 'https://192.168.12.50:8443/' }), 'https://192.168.12.50:8443');
  assert.strictEqual(resolveFppUrl({ FPP_URL: 'http://show.local', FPP_HOST: 'old.local', FPP_PORT: '8080' }), 'http://show.local');
  assert.strictEqual(resolveFppUrl({ FPP_HOST: 'show.local', FPP_PORT: '8080' }), 'http://show.local:8080');
  assert.strictEqual(resolveFppUrl({ NEXT_PUBLIC_FPP_URL: 'https://show.local' }), 'https://show.local');
  for (const value of ['wrong', 'ftp://show.local', 'http://a:b@show.local', 'http://show.local/path', 'http://show.local?x=1', 'http://show.local#x', 'http://localhost', 'http://127.0.0.1', 'http://2130706433', 'http://169.254.169.254', 'http://[::1]', 'http://[::ffff:127.0.0.1]']) assert.throws(() => resolveFppUrl({ FPP_URL: value }), Error, value);
  const saved = process.env.FPP_URL;
  try {
    process.env.FPP_URL = 'https://show.local';
    assert.strictEqual(getFppPort(), 443);
    process.env.FPP_URL = 'http://show.local:8080';
    assert.strictEqual(getFppPort(), 8080);
    let calls = 0;
    const fake: typeof fetch = async (url, options) => {
      calls++;
      assert.strictEqual(url, 'http://show.local:8080/api/system/status');
      assert.strictEqual(options?.redirect, 'error');
      return new Response('{}');
    };
    await fetchFpp('/api/system/status', { redirect: 'follow' }, fake);
    for (const input of ['//elsewhere.local/api/x', 'https://elsewhere.local/api/x', '/api/../private', 'http://name:password@show.local:8080/api/x']) await assert.rejects(() => fetchFpp(input, {}, fake));
    assert.strictEqual(calls, 1, 'invalid destinations never reach the transport');
    await assert.rejects(() => fetchFpp('/api/system/status', {}, async () => new Response(null, { status: 302, headers: { Location: 'http://elsewhere.local' } })), /redirects/);
  } finally {
    if (saved === undefined) delete process.env.FPP_URL;
    else process.env.FPP_URL = saved;
  }
  console.log('[test-fpp-config] All tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
