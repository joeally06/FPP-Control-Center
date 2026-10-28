import assert from 'assert';
import { singleFlight } from '../lib/single-flight';

function print(msg: string) {
  console.log('[test-jukebox-queue-processor] ' + msg);
}

async function main() {
  print('Test 1: overlapping calls run the body once');
  let runs = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const guarded = singleFlight(async () => {
    runs++;
    await gate;
    return 'done';
  });
  const first = guarded();
  const second = guarded();
  const third = guarded();
  assert.strictEqual(await second, undefined);
  assert.strictEqual(await third, undefined);
  release();
  assert.strictEqual(await first, 'done');
  assert.strictEqual(runs, 1);

  print('Test 2: a later call runs again');
  assert.strictEqual(await guarded(), 'done');
  assert.strictEqual(runs, 2);

  print('Test 3: a throw releases the guard');
  let attempts = 0;
  const failing = singleFlight(async () => {
    attempts++;
    if (attempts === 1) throw new Error('boom');
    return 'ok';
  });
  await assert.rejects(failing(), /boom/);
  assert.strictEqual(await failing(), 'ok');

  print('All tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
