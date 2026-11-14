import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createAsyncMutationQueue } from '../src/asyncMutationQueue.ts';

function loadStore() {
  let saved = null;
  const storage = {
    getItem: async () => saved,
    setItem: async (_key, value) => { saved = value; },
  };
  const code = ts.transpileModule(readFileSync('src/storage/notificationLogStore.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (name === '@react-native-async-storage/async-storage') return storage;
    if (name === '../asyncMutationQueue') return { createAsyncMutationQueue };
    throw new Error(`Unexpected dependency: ${name}`);
  }, module, module.exports);
  return module.exports.notificationLogStore;
}

const entry = (id, requestIdentifier, receivedAt) => ({
  id, requestIdentifier, receivedAt, title: id, subtitle: '', body: '', todoId: null,
});

test('section clearing persists only selected deletions and preserves concurrent arrivals', async () => {
  const store = loadStore();
  await store.replaceAll([
    entry('routine-1', 'todo:habit:1', 1),
    entry('normal', 'todo:normal:1', 2),
    entry('routine-2', 'todo:habit:2', 3),
    entry('repeating', 'todo:daily:1', 4),
  ]);
  // An arrival queued before the clear must survive even though it was not
  // present in the UI when the user selected the section's entries.
  const arrivingBefore = store.append(entry('new-normal', 'todo:normal:2', 5));
  const clear = store.deleteMany(['routine-1', 'routine-2']);
  const arrivingAfter = store.append(entry('new-routine', 'todo:habit:3', 6));
  await Promise.all([arrivingBefore, clear, arrivingAfter]);
  assert.deepEqual((await store.load()).map(item => item.id), [
    'new-routine', 'new-normal', 'repeating', 'normal',
  ]);
  await store.deleteMany([]);
  assert.equal((await store.load()).length, 4);
});
