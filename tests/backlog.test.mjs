import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync('src/backlog.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = vm.createContext({ exports: {} });
vm.runInContext(code, context);
const { emptyBacklog, nextBacklog, previousBacklog, normalizeBacklog } = context.exports;

test('review advances randomly without repeats, goes back, and resumes saved history', () => {
  const ids = ['a', 'b', 'c'];
  let state = nextBacklog(emptyBacklog(), ids, () => 0.5);
  assert.equal(state.history[state.cursor], 'b');
  state = nextBacklog(state, ids, () => 0);
  assert.equal(state.history[state.cursor], 'a');
  state = previousBacklog(state, ids);
  assert.equal(state.history[state.cursor], 'b');
  state = nextBacklog(normalizeBacklog(JSON.parse(JSON.stringify(state))), ids);
  assert.equal(state.history[state.cursor], 'a');
  state = nextBacklog(state, ids, () => 0);
  assert.equal(state.history[state.cursor], 'c');
  state = nextBacklog(state, ids);
  assert.equal(state.cursor, 3);
  state = nextBacklog(state, [...ids, 'd']);
  assert.equal(state.history[state.cursor], 'd');
});

test('ratings and progress survive restoring and invalid ratings are discarded', () => {
  const restored = normalizeBacklog({ history: ['a', 'b'], cursor: 1, ratings: { a: 10, b: 1, c: 11 } });
  assert.equal(restored.cursor, 1);
  assert.equal(restored.ratings.a, 10);
  assert.equal(restored.ratings.b, 1);
  assert.equal(restored.ratings.c, undefined);
  assert.equal(previousBacklog(restored, ['b']).cursor, 1);
});
