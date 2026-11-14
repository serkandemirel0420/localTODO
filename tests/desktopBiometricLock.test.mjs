import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import path from 'node:path';

const fixture = (prompt = async () => {}) => {
  const handlers = new Map();
  const files = new Map();
  const frame = { url: 'http://127.0.0.1:17873/' };
  const sender = { mainFrame: frame, send() {} };
  const electron = {
    app: { setName() {}, on() {}, getPath: () => '/test/user-data', whenReady: () => new Promise(() => {}) },
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    systemPreferences: { canPromptTouchID: () => true, promptTouchID: prompt },
  };
  const context = vm.createContext({
    require: (name) => {
      if (name === 'electron') return electron;
      if (name === 'path') return path;
      if (name === 'http') return {};
      if (name === 'fs') return {
        readFileSync: (filename) => {
          if (!files.has(filename)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
          return files.get(filename);
        },
        writeFileSync: (filename, data) => files.set(filename, data),
        renameSync: (from, to) => { files.set(to, files.get(from)); files.delete(from); },
      };
      throw new Error(`Unexpected module ${name}`);
    },
    process: { platform: 'darwin', env: {} },
    __dirname: '/test/desktop', console, URL, URLSearchParams, setTimeout,
    testWindow: { webContents: sender, isDestroyed: () => false },
  });
  vm.runInContext(readFileSync('desktop/main.cjs', 'utf8'), context);
  vm.runInContext('mainWindow = testWindow; serverUrl = "http://127.0.0.1:17873/";', context);
  const event = { sender, senderFrame: frame };
  return {
    call: (action, ...args) => handlers.get(`biometric-lock:${action}`)(event, ...args),
    untrusted: () => handlers.get('biometric-lock:load')({ sender, senderFrame: { ...frame } }),
    background: () => vm.runInContext('sendLockActivity("background")', context),
    files,
  };
};

test('desktop setting requires authentication and consumes its grant once', async () => {
  const f = fixture();
  assert.equal(f.call('load'), false);
  assert.throws(() => f.call('save', true), /Authenticate/);
  assert.equal((await f.call('authenticate')).success, true);
  f.call('save', true);
  assert.equal(f.call('load'), true);
  assert.throws(() => f.call('save', false), /Authenticate/);
});

test('cancelled Touch ID cannot enable or disable the lock', async () => {
  const f = fixture(async () => { throw new Error('cancelled'); });
  assert.equal((await f.call('authenticate')).success, false);
  assert.throws(() => f.call('save', true), /Authenticate/);
});

test('subframes cannot access biometric IPC', () => {
  const f = fixture();
  assert.throws(f.untrusted, /Untrusted/);
});

test('backgrounding invalidates a pending native authentication', async () => {
  let finish;
  const f = fixture(() => new Promise((resolve) => { finish = resolve; }));
  const authenticating = f.call('authenticate');
  assert.equal((await f.call('authenticate')).error, 'busy');
  f.background();
  finish();
  assert.equal((await authenticating).success, false);
  assert.throws(() => f.call('save', true), /Authenticate/);
});

test('corrupt desktop settings fail closed instead of silently disabling', () => {
  const f = fixture();
  f.files.set('/test/user-data/biometric-lock.json', '{"enabled":"false"}');
  assert.throws(() => f.call('load'), /Invalid/);
});
