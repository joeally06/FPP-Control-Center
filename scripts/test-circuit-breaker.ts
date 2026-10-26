import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import assert from 'assert';
import { CircuitState, FPPCircuitBreaker } from '../lib/circuit-breaker';

// The poller and the web server each hold a breaker; the database row is the shared state.
// Before the fix the web server kept the state it loaded at startup and never saw FPP come back.

function print(msg: string) {
  console.log('[test-circuit-breaker] ' + msg);
}

const tmpDir = path.join(process.cwd(), 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
const dbPath = path.join(tmpDir, 'test-circuit-breaker.db');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

const config = { failureThreshold: 3, resetTimeout: 10000, successThreshold: 2 };
const instances: FPPCircuitBreaker[] = [];
const create = () => {
  const breaker = new FPPCircuitBreaker(config, dbPath);
  instances.push(breaker);
  return breaker;
};

// Pretend the last failure happened long enough ago for a recovery attempt
function ageLastFailure(ms: number) {
  const db = new Database(dbPath);
  db.prepare('UPDATE fpp_circuit_breaker SET last_failure_time = ? WHERE id = 1').run(Date.now() - ms);
  db.close();
}

function persistedState(): string {
  const db = new Database(dbPath, { readonly: true });
  const row = db.prepare('SELECT state FROM fpp_circuit_breaker WHERE id = 1').get() as { state: string };
  db.close();
  return row.state;
}

try {
  // Test 1: FPP goes offline - the poller opens the circuit, a web server started now sees it
  print('Test 1: offline state is shared');
  const poller = create();
  for (let i = 0; i < 3; i++) poller.recordFailure('ECONNREFUSED');
  assert.strictEqual(poller.getState(), CircuitState.OPEN);
  const web = create();
  assert.strictEqual(web.isFPPOffline(), true);
  print('Test 1 OK');

  // Test 2: a web server starting after the retry time doesn't overwrite the poller's state
  print('Test 2: startup does not write');
  ageLastFailure(20000);
  create();
  assert.strictEqual(persistedState(), CircuitState.OPEN);
  print('Test 2 OK');

  // Test 3: FPP comes back - the running web server sees it without being recreated
  print('Test 3: recovery reaches the running web server');
  assert.strictEqual(poller.allowRequest(), true);
  assert.strictEqual(web.isTestingRecovery(), true);
  assert.strictEqual(web.isFPPOffline(), false);
  poller.recordSuccess();
  poller.recordSuccess();
  assert.strictEqual(poller.getState(), CircuitState.CLOSED);
  assert.strictEqual(web.isFPPOnline(), true);
  assert.strictEqual(web.getStats().state, CircuitState.CLOSED);
  print('Test 3 OK');

  // Test 4: an admin reset in the web server reaches the poller
  print('Test 4: admin reset reaches the poller');
  for (let i = 0; i < 3; i++) poller.recordFailure('timeout');
  assert.strictEqual(web.isFPPOffline(), true);
  web.reset();
  assert.strictEqual(poller.allowRequest(), true);
  assert.strictEqual(poller.getState(), CircuitState.CLOSED);
  print('Test 4 OK');

  print('All tests passed');
} catch (err) {
  console.error('[test-circuit-breaker] ❌', err);
  process.exitCode = 1;
} finally {
  for (const breaker of instances) breaker.close();
}
