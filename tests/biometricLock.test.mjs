import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync('src/biometricLockController.ts', 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const context = vm.createContext({ exports: {} });
vm.runInContext(outputText, context);
const { BiometricLockController } = context.exports;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
const fixture = (overrides = {}) => {
  const saves = [];
  let authCount = 0;
  const controller = new BiometricLockController({
    load: async () => false,
    save: async (enabled) => { saves.push(enabled); },
    available: async () => true,
    authenticate: async () => { authCount += 1; return { success: true }; },
    ...overrides,
  });
  return { controller, saves, authCount: () => authCount };
};

test('default stays off; enabling verifies and saves a device-local preference', async () => {
  const f = fixture();
  await f.controller.load();
  assert.equal(f.controller.state.locked, false);
  assert.equal(f.authCount(), 0);
  await f.controller.toggle();
  assert.equal(f.authCount(), 1);
  assert.deepEqual(f.saves, [true]);
  assert.equal(f.controller.state.enabled, true);
  assert.equal(f.controller.state.locked, false);
});

test('cold launch is locked until authentication completes', async () => {
  const auth = deferred();
  const f = fixture({ load: async () => true, authenticate: () => auth.promise });
  const loading = f.controller.load();
  await Promise.resolve();
  assert.equal(f.controller.state.locked, true);
  auth.resolve({ success: true });
  await loading;
  assert.equal(f.controller.state.locked, false);
});

test('cancellation retains the lock, retry succeeds, and only one prompt runs', async () => {
  const auth = deferred();
  let calls = 0;
  const f = fixture({ load: async () => true, authenticate: () => {
    calls += 1;
    return calls === 1 ? auth.promise : Promise.resolve({ success: true });
  } });
  const loading = f.controller.load();
  await Promise.resolve();
  await f.controller.unlock();
  assert.equal(calls, 1);
  auth.resolve({ success: false, error: 'user_cancel' });
  await loading;
  assert.equal(f.controller.state.locked, true);
  assert.match(f.controller.state.message, /cancelled/);
  await f.controller.unlock();
  assert.equal(f.controller.state.locked, false);
  assert.equal(calls, 2);
});

test('zero delay prompts again after backgrounding', async () => {
  const f = fixture({ load: async () => true, loadGrace: async () => 0 });
  await f.controller.load();
  f.controller.setActivity('background');
  assert.equal(f.controller.state.locked, true);
  f.controller.setActivity('active');
  await flush();
  assert.equal(f.authCount(), 2);
  assert.equal(f.controller.state.locked, false);
});

test('grace period skips authentication only before the configured delay', async () => {
  let now = 1000;
  const f = fixture({ load: async () => true, now: () => now });
  await f.controller.load();
  f.controller.setActivity('background');
  now += 4 * 60000;
  f.controller.setActivity('active');
  await flush();
  assert.equal(f.controller.state.locked, false);
  assert.equal(f.authCount(), 1);
  f.controller.setActivity('background');
  now += 5 * 60000;
  f.controller.setActivity('active');
  await flush();
  assert.equal(f.authCount(), 2);
});

test('custom delay is saved and invalid values are rejected', async () => {
  const saved = [];
  const f = fixture({ saveGrace: async (minutes) => saved.push(minutes) });
  await f.controller.load();
  assert.equal(await f.controller.setGraceMinutes(12), true);
  assert.equal(await f.controller.setGraceMinutes(1441), false);
  assert.equal(f.controller.state.graceMinutes, 12);
  assert.deepEqual(saved, [12]);
});

test('system prompt inactivity does not cause an authentication loop', async () => {
  const auth = deferred();
  const f = fixture({ load: async () => true, authenticate: () => auth.promise });
  const loading = f.controller.load();
  await Promise.resolve();
  f.controller.setActivity('inactive');
  f.controller.setActivity('active');
  auth.resolve({ success: true });
  await loading;
  assert.equal(f.controller.state.locked, false);
  assert.equal(f.controller.state.busy, false);
});

test('success while backgrounded cannot unlock the app', async () => {
  const auth = deferred();
  const f = fixture({ load: async () => true, authenticate: () => auth.promise });
  const loading = f.controller.load();
  await Promise.resolve();
  f.controller.setActivity('background');
  auth.resolve({ success: true });
  await loading;
  assert.equal(f.controller.state.locked, true);
});

test('Android credential activity can return authenticated to foreground', async () => {
  const auth = deferred();
  const f = fixture({ load: async () => true, authenticate: () => auth.promise });
  const loading = f.controller.load();
  await Promise.resolve();
  f.controller.setActivity('background');
  assert.equal(f.controller.state.locked, true);
  f.controller.setActivity('active');
  auth.resolve({ success: true });
  await loading;
  assert.equal(f.controller.state.locked, false);
});

test('missing biometrics does not enable lock or show a prompt', async () => {
  const f = fixture({ available: async () => false });
  await f.controller.load();
  await f.controller.toggle();
  assert.equal(f.controller.state.enabled, false);
  assert.equal(f.authCount(), 0);
  assert.deepEqual(f.saves, []);
});

test('failed setting reads remain blocked; retry reloads without bypass', async () => {
  let reads = 0;
  const f = fixture({ load: async () => { if (++reads === 1) throw new Error('read failed'); return true; } });
  await f.controller.load();
  assert.equal(f.controller.state.ready, false);
  assert.equal(f.controller.state.locked, true);
  await f.controller.load();
  assert.equal(f.controller.state.ready, true);
  assert.equal(f.controller.state.enabled, true);
  assert.equal(f.authCount(), 1);
});

test('failed persistence does not report lock as enabled', async () => {
  const f = fixture({ save: async () => { throw new Error('disk full'); } });
  await f.controller.load();
  await f.controller.toggle();
  assert.equal(f.controller.state.enabled, false);
  assert.equal(f.controller.state.busy, false);
  assert.match(f.controller.state.message, /try again/);
});

test('disabling requires a new successful authentication', async () => {
  let calls = 0;
  const f = fixture({ load: async () => true, authenticate: async () => ({ success: ++calls !== 2 }) });
  await f.controller.load();
  await f.controller.toggle();
  assert.equal(f.controller.state.enabled, true);
  assert.deepEqual(f.saves, []);
  await f.controller.toggle();
  assert.equal(f.controller.state.enabled, false);
  assert.deepEqual(f.saves, [false]);
});

test('backgrounding while enabling is being saved takes effect locked', async () => {
  const saved = deferred();
  const f = fixture({ save: () => saved.promise });
  await f.controller.load();
  const enabling = f.controller.toggle();
  await flush();
  f.controller.setActivity('background');
  saved.resolve();
  await enabling;
  assert.equal(f.controller.state.enabled, true);
  assert.equal(f.controller.state.locked, true);
});
