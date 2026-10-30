import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { CONTENT_SECURITY_POLICY, FRAMEABLE_PATHS, isFrameablePath } from '../lib/csp';

function print(msg: string) {
  console.log('[test-csp] ' + msg);
}

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf-8');

print('Test 1: the policy keeps its protections');
const directives = new Map(
  CONTENT_SECURITY_POLICY.split(';').map((part) => {
    const [name, ...values] = part.trim().split(/\s+/);
    return [name, values] as const;
  })
);
assert.deepStrictEqual(directives.get('default-src'), ["'self'"]);
assert.deepStrictEqual(directives.get('frame-ancestors'), ["'self'"]);
assert.deepStrictEqual(directives.get('object-src'), ["'none'"]);
assert.deepStrictEqual(directives.get('base-uri'), ["'self'"]);
assert.deepStrictEqual(directives.get('form-action'), ["'self'"]);

print('Test 2: connect-src names no LAN address (the server makes every FPP and Ollama call)');
const privateHost = /\/\/(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|localhost)/;
for (const [name, values] of directives) {
  assert.ok(!values.some((value) => privateHost.test(value)), `${name} lists a private address`);
}
assert.ok(directives.get('connect-src')!.includes("'self'"));

print('Test 3: only proxy.ts sets the policy, from lib/csp.ts');
const proxySource = read('proxy.ts');
assert.ok(/set\(\s*'Content-Security-Policy',\s*CONTENT_SECURITY_POLICY\s*\)/.test(proxySource), 'proxy.ts must set the shared policy');
assert.ok(!/default-src/.test(proxySource), 'proxy.ts must not carry its own copy of the policy');
const nextConfig = read('next.config.js');
assert.ok(!/Content-Security-Policy|default-src|connect-src/i.test(nextConfig.replace(/\/\/.*$/gm, '')), 'next.config.js must not set a second policy');

print('Test 4: only the two preview pages may be framed, and next.config.js agrees with proxy.ts');
assert.deepStrictEqual([...FRAMEABLE_PATHS].sort(), ['/settings/display/preview', '/settings/jukebox/preview']);
assert.ok(isFrameablePath('/settings/display/preview') && isFrameablePath('/settings/jukebox/preview'));
for (const other of ['/', '/dashboard', '/settings', '/settings/display', '/display', '/display/x', '/jukebox', '/api/display/stream']) {
  assert.ok(!isFrameablePath(other), `${other} must not be frameable`);
}
assert.ok(/isFrameablePath\(pathname\)\s*\?\s*'SAMEORIGIN'\s*:\s*'DENY'/.test(proxySource), 'proxy.ts must use isFrameablePath');
const nextConfigCode = nextConfig.replace(/\/\/.*$/gm, '');
assert.strictEqual(nextConfigCode.split("'SAMEORIGIN'").length - 1, FRAMEABLE_PATHS.length, 'next.config.js may allow SAMEORIGIN only for the frameable paths');
const denyAt = nextConfigCode.indexOf("source: '/:path*'");
assert.ok(denyAt >= 0, 'next.config.js sets the default headers for every path');
for (const framed of FRAMEABLE_PATHS) {
  assert.ok(nextConfigCode.indexOf(`source: '${framed}'`) > denyAt, `the ${framed} rule must come after the default DENY (a later rule wins)`);
}
for (const framed of FRAMEABLE_PATHS) {
  const at = nextConfig.indexOf(`source: '${framed}'`);
  assert.ok(at >= 0, `next.config.js needs a rule for ${framed}`);
  const rule = nextConfig.slice(at, nextConfig.indexOf('}', nextConfig.indexOf('headers', at)));
  assert.ok(rule.includes("'X-Frame-Options'") && rule.includes("'SAMEORIGIN'"), `next.config.js must send SAMEORIGIN for ${framed}`);
}

print('All tests passed');
