import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createAsyncMutationQueue } from '../src/asyncMutationQueue.ts';

function load(path, require) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(require, module, module.exports);
  return module.exports;
}
const { createUiMemoryStore } = load('src/uiMemory.ts', () => ({ createAsyncMutationQueue }));
const draft = { text: 'Unsubmitted title', content: 'Two\nlines', pinned: true, tags: ['work'], filters: { list: ['Inbox'] } };

test('independent screens and a complete unsubmitted draft survive a fresh store', async () => {
  let saved = null;
  const storage = { getItem: async () => saved, setItem: async (_key, value) => { saved = value; } };
  const first = createUiMemoryStore(storage);
  await first.ready();
  first.rememberOffset('navbar:1', 620);
  first.rememberOffset('navbar:2', 175);
  first.rememberOffset('routine-logs:one', 812);
  first.rememberOffset('settings', 0);
  first.rememberDraft(draft);
  await first.flush();
  const second = createUiMemoryStore(storage);
  await second.ready();
  assert.equal(second.offset('navbar:1'), 620);
  assert.equal(second.offset('navbar:2'), 175);
  assert.equal(second.offset('routine-logs:one'), 812);
  assert.equal(second.offset('settings'), 0);
  assert.deepEqual(second.draft(), draft);
  const copy = second.draft();
  copy.filters.list.push('Other');
  assert.deepEqual(second.draft(), draft);
  second.rememberDraft({ ...draft, text: 'Next unsaved item' });
  second.clearSubmittedDraft(draft);
  assert.equal(second.draft().text, 'Next unsaved item');
  second.clearSubmittedDraft(second.draft());
  await second.flush();
  const third = createUiMemoryStore(storage);
  await third.ready();
  assert.equal(third.draft(), null);
});

test('malformed stored positions do not cause invalid scrolling', async () => {
  const store = createUiMemoryStore({ getItem: async () => JSON.stringify({ offsets: { valid: 20, bad: -1, string: '50' }, draft: {} }), setItem: async () => {} });
  await store.ready();
  assert.equal(store.offset('valid'), 20);
  assert.equal(store.offset('bad'), undefined);
  assert.equal(store.offset('string'), undefined);
  assert.equal(store.draft(), null);
});

test('scroll restoration waits for content and restores again after reopening a screen', async () => {
  const offsets = { one: 600, two: 150 };
  const memory = { ready: async () => {}, offset: key => offsets[key], rememberOffset: (key, value) => { offsets[key] = value; } };
  const cells = [];
  let cursor = 0;
  let effects = [];
  const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
  const react = {
    useRef(value) { const i = cursor++; return cells[i] ??= { current: value }; },
    useCallback(fn, deps) { const i = cursor++; if (!equal(cells[i]?.deps, deps)) cells[i] = { fn, deps }; return cells[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!equal(cells[i]?.deps, deps)) { cells[i]?.cleanup?.(); cells[i] = { deps }; effects.push(() => { cells[i].cleanup = fn(); }); } },
  };
  const frames = new Map();
  let sequence = 0;
  const code = ts.transpileModule(readFileSync('src/useRememberedScroll.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'requestAnimationFrame', 'cancelAnimationFrame', code)(
    name => name === 'react' ? react : { uiMemoryStore: memory }, module, module.exports,
    fn => { frames.set(++sequence, fn); return sequence; }, id => frames.delete(id),
  );
  const scrolled = [];
  const ref = { current: { scrollToOffset: ({ offset }) => scrolled.push(offset) } };
  async function render(key, active = true) {
    cursor = 0; effects = [];
    const handlers = module.exports.useRememberedScroll(key, ref, { active });
    effects.forEach(fn => fn());
    await Promise.resolve();
    while (frames.size) { const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn()); }
    return handlers;
  }
  let handlers = await render('one');
  handlers.onLayout({ nativeEvent: { layout: { height: 400 } } });
  handlers.onContentSizeChange(100, 450);
  handlers.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
  assert.equal(offsets.one, 600); // Initial/clamped events cannot erase the saved position.
  handlers.onContentSizeChange(100, 1600);
  assert.equal(scrolled.at(-1), 600);
  handlers.onScrollBeginDrag();
  handlers.onScroll({ nativeEvent: { contentOffset: { y: 710 } } });
  assert.equal(offsets.one, 710);
  handlers = await render('two');
  handlers.onContentSizeChange(100, 1000);
  assert.equal(scrolled.at(-1), 150);
  await render('two', false);
  handlers = await render('two', true);
  handlers.onContentSizeChange(100, 1000);
  assert.equal(scrolled.at(-1), 150);
  handlers = await render('one');
  handlers.onContentSizeChange(100, 1600);
  assert.equal(scrolled.at(-1), 710);
});
