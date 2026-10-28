import assert from 'assert';
import { createLazyPoller } from '../lib/lazy-poller';

function print(msg: string) {
  console.log('[test-lazy-poller] ' + msg);
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  print('Test 1: nothing runs until ensureRunning(), then it polls repeatedly');
  let clients = 0;
  let polls = 0;
  let stops = 0;
  const poller = createLazyPoller({
    intervalMs: 20,
    hasClients: () => clients > 0,
    poll: () => { polls++; },
    onStop: () => { stops++; },
  });
  await wait(60);
  assert.strictEqual(polls, 0);
  assert.strictEqual(poller.isRunning(), false);
  clients = 1;
  poller.ensureRunning();
  poller.ensureRunning(); // a second call must not add a second timer
  await wait(110);
  assert.ok(polls >= 2 && polls <= 7, `expected a single timer's worth of polls, got ${polls}`);
  assert.strictEqual(poller.isRunning(), true);

  print('Test 2: it stops itself once no one is listening');
  clients = 0;
  await wait(60);
  assert.strictEqual(poller.isRunning(), false);
  assert.strictEqual(stops, 1);
  const after = polls;
  await wait(80);
  assert.strictEqual(polls, after, 'no polls after it stopped');

  print('Test 3: it can start again after stopping');
  clients = 1;
  poller.ensureRunning();
  await wait(70);
  assert.ok(polls > after);
  assert.strictEqual(poller.isRunning(), true);
  clients = 0;
  await wait(60);
  assert.strictEqual(stops, 2);

  print('Test 4: a slow poll is never overlapped, including pollNow()');
  let running = 0;
  let maxRunning = 0;
  let slowPolls = 0;
  clients = 1;
  const slow = createLazyPoller({
    intervalMs: 10,
    hasClients: () => clients > 0,
    poll: async () => {
      slowPolls++;
      running++;
      maxRunning = Math.max(maxRunning, running);
      await wait(50);
      running--;
    },
  });
  slow.ensureRunning();
  void slow.pollNow();
  void slow.pollNow();
  await wait(130);
  clients = 0;
  await wait(120);
  assert.strictEqual(maxRunning, 1);
  assert.ok(slowPolls >= 2 && slowPolls <= 5, `slow polls: ${slowPolls}`);

  print('Test 5: a poll that throws does not stop the timer');
  clients = 1;
  let attempts = 0;
  const flaky = createLazyPoller({
    intervalMs: 15,
    hasClients: () => clients > 0,
    poll: () => { attempts++; throw new Error('FPP unreachable'); },
  });
  flaky.ensureRunning();
  await wait(80);
  assert.ok(attempts >= 3, `attempts: ${attempts}`);
  assert.strictEqual(flaky.isRunning(), true);
  clients = 0;
  await wait(50);
  assert.strictEqual(flaky.isRunning(), false);

  print('All tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
