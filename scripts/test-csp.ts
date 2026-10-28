import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { CONTENT_SECURITY_POLICY } from '../lib/csp';

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

print('All tests passed');
