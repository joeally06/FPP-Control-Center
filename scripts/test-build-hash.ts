import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { createBuildHashReader, getBuildHash } from '../lib/build-hash';

function print(msg: string) {
  console.log('[test-build-hash] ' + msg);
}

print('Test 1: git is asked once, however many times the hash is read');
let calls = 0;
const reader = createBuildHashReader(() => {
  calls++;
  return 'abc1234';
});
assert.deepStrictEqual([reader(), reader(), reader()], ['abc1234', 'abc1234', 'abc1234']);
assert.strictEqual(calls, 1);

print('Test 2: "no git" is remembered too, not asked again on every request');
let missCalls = 0;
const missing = createBuildHashReader(() => {
  missCalls++;
  return null;
});
assert.strictEqual(missing(), null);
assert.strictEqual(missing(), null);
assert.strictEqual(missCalls, 1);

print('Test 3: the real reader gives a short hash in this repository, or null outside one');
const real = getBuildHash();
assert.ok(real === null || /^[0-9a-f]{4,40}$/.test(real), String(real));

print('Test 4: the version route no longer runs a blocking git command per request');
const route = fs.readFileSync(path.join(process.cwd(), 'app', 'api', 'version', 'route.ts'), 'utf-8');
assert.ok(!/execSync|execFileSync|child_process/.test(route), 'the route must not shell out itself');
assert.ok(/getBuildHash\(\)/.test(route));

print('All tests passed');
