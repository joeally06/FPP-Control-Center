import assert from 'assert';
import http from 'http';
import type { AddressInfo } from 'net';
import { CLIENT_IP_HEADER, getClientIP } from '../lib/rate-limit';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const server = require('../server.js');

function print(msg: string) {
  console.log('[test-client-ip] ' + msg);
}

type FakeReq = { socket: { remoteAddress?: string }; headers: Record<string, string | string[] | undefined> };
const fakeReq = (remoteAddress: string | undefined, headers: FakeReq['headers'] = {}): FakeReq => ({ socket: { remoteAddress }, headers });

(async () => {
  try {
    assert.strictEqual(server.CLIENT_IP_HEADER, CLIENT_IP_HEADER, 'server.js and the app use the same header');

    // Test 1: Cloudflare's header is believed only from cloudflared on this machine
    print('Test 1: clientIpFor');
    const none: string[] = [];
    const cf = { 'cf-connecting-ip': '203.0.113.7' };
    assert.strictEqual(server.clientIpFor(fakeReq('127.0.0.1', cf), none), '203.0.113.7', 'IPv4 loopback');
    assert.strictEqual(server.clientIpFor(fakeReq('::1', cf), none), '203.0.113.7', 'IPv6 loopback');
    assert.strictEqual(server.clientIpFor(fakeReq('::ffff:127.0.0.1', cf), none), '203.0.113.7', 'mapped loopback');
    assert.strictEqual(server.clientIpFor(fakeReq('127.0.0.1', { 'cf-connecting-ip': '2001:db8::1' }), none), '2001:db8::1', 'IPv6 visitor');
    assert.strictEqual(server.clientIpFor(fakeReq('192.168.1.50', cf), none), '192.168.1.50', 'home-network device cannot forge it');
    assert.strictEqual(server.clientIpFor(fakeReq('::ffff:192.168.1.50', { 'x-forwarded-for': '1.2.3.4' }), none), '192.168.1.50', 'X-Forwarded-For ignored, mapped address normalised');
    assert.strictEqual(server.clientIpFor(fakeReq('127.0.0.1', { 'cf-connecting-ip': 'evil' }), none), '127.0.0.1', 'not an IP');
    assert.strictEqual(server.clientIpFor(fakeReq('127.0.0.1', { 'cf-connecting-ip': '1.2.3.4, 5.6.7.8' }), none), '127.0.0.1', 'duplicate header');
    assert.strictEqual(server.clientIpFor(fakeReq('127.0.0.1'), none), '127.0.0.1', 'local request without Cloudflare');
    assert.strictEqual(server.clientIpFor(fakeReq(undefined), none), 'unknown', 'no socket address');
    const trusted = server.parseTrustedProxies(' 10.0.0.5 , ::ffff:10.0.0.6,,');
    assert.deepStrictEqual(trusted, ['10.0.0.5', '10.0.0.6'], 'TRUSTED_PROXY_IPS parsed');
    assert.strictEqual(server.clientIpFor(fakeReq('10.0.0.6', cf), trusted), '203.0.113.7', 'listed proxy trusted');
    assert.strictEqual(server.clientIpFor(fakeReq('10.0.0.7', cf), trusted), '10.0.0.7', 'unlisted address not trusted');
    print('Test 1 OK');

    // Test 2: through a real HTTP server with a stand-in for Next.js
    print('Test 2: createRequestListener');
    let seen: http.IncomingHttpHeaders = {};
    const httpServer = http.createServer(server.createRequestListener((req: http.IncomingMessage, res: http.ServerResponse) => {
      seen = req.headers;
      res.end('ok');
    }, []));
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const { port } = httpServer.address() as AddressInfo;
    const get = (headers: Record<string, string>) => new Promise<void>((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, headers }, (res) => { res.resume(); res.on('end', resolve); }).on('error', reject);
    });
    await get({ [CLIENT_IP_HEADER]: '6.6.6.6', 'x-forwarded-for': '7.7.7.7' });
    assert.strictEqual(seen[CLIENT_IP_HEADER], '127.0.0.1', 'forged header replaced by the connection address');
    await get({ [CLIENT_IP_HEADER]: '6.6.6.6', 'cf-connecting-ip': '198.51.100.23' });
    assert.strictEqual(seen[CLIENT_IP_HEADER], '198.51.100.23', 'Cloudflare header from this machine used');
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    print('Test 2 OK');

    // Test 3: the app reads the header; falls back to forwarding headers only without it
    print('Test 3: getClientIP');
    const req = (headers: Record<string, string>) => new Request('http://localhost/api/x', { headers });
    assert.strictEqual(getClientIP(req({ [CLIENT_IP_HEADER]: '198.51.100.23', 'cf-connecting-ip': '1.1.1.1' })), '198.51.100.23');
    assert.strictEqual(getClientIP(req({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' })), '1.1.1.1', 'next dev fallback');
    assert.strictEqual(getClientIP(req({ 'x-forwarded-for': '2.2.2.2, 3.3.3.3' })), '2.2.2.2');
    assert.strictEqual(getClientIP(req({})), 'unknown');
    print('Test 3 OK');

    print('All tests passed');
  } catch (err) {
    console.error('[test-client-ip] FAILED:', err);
    process.exitCode = 1;
  }
})();
