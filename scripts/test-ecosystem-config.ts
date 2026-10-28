import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

interface App {
  name: string;
  script: string;
  interpreter?: string;
  interpreter_args?: string;
  node_args?: string[];
}

function print(msg: string) {
  console.log('[test-ecosystem-config] ' + msg);
}

const root = process.cwd();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require(path.join(root, 'ecosystem.config.js')) as { apps: App[] };
const poller = config.apps.find((app) => app.name === 'fpp-poller');
assert.ok(poller, 'fpp-poller is defined');

print('Test 1: the poller runs TypeScript through esbuild-register on plain node');
assert.strictEqual(poller.interpreter, 'node', 'an explicit interpreter stops PM2 from picking one for .ts');
assert.deepStrictEqual(poller.node_args, ['-r', 'esbuild-register']);
assert.ok(fs.existsSync(path.join(root, poller.script)), 'the poller script exists');
assert.ok(require.resolve('esbuild-register'), 'esbuild-register is installed');

print('Test 2: nothing is fetched at runtime (no npx, no tsx)');
for (const app of config.apps) {
  assert.notStrictEqual(app.interpreter, 'npx', `${app.name} must not use npx`);
  assert.ok(!/\btsx\b/.test(`${app.interpreter ?? ''} ${app.interpreter_args ?? ''} ${(app.node_args ?? []).join(' ')}`), `${app.name} must not use tsx`);
}

print('Test 3: node -r esbuild-register can load a .ts file (what the PM2 runner does)');
const out = execFileSync(
  process.execPath,
  ['-r', 'esbuild-register', '-e', "console.log(typeof require('./lib/single-flight.ts').singleFlight)"],
  { cwd: root, encoding: 'utf-8' }
);
assert.strictEqual(out.trim(), 'function');

print('All tests passed');
