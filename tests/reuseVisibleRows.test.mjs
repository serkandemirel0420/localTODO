import assert from 'node:assert/strict';
import test from 'node:test';
import { reuseVisibleRows } from '../src/reuseVisibleRows.ts';

test('section toggles preserve unrelated rows and update the changed header', () => {
  const todo = { id: 'todo' };
  const header = { type: 'sectionHeader', id: 'one', isCollapsed: false, count: 1 };
  const batch = { type: 'groupedTodoBatch', id: 'two', todos: [todo], isLastBatch: true };
  const next = reuseVisibleRows([header, batch], [
    { ...header, isCollapsed: true },
    { ...batch, todos: [todo] },
  ]);
  assert.notStrictEqual(next[0], header);
  assert.equal(next[0].isCollapsed, true);
  assert.strictEqual(next[1], batch);
  assert.notStrictEqual(reuseVisibleRows([batch], [{ ...batch, todos: [{ id: 'todo' }] }])[0], batch);
});
