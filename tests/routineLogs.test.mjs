import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRoutineLogs } from '../src/routineLogs.ts';

test('restored logs show newest first without mutating the source', () => {
  const logs = [{ id: 'old', text: ' First ', createdAt: 10 }, { id: 'new', text: 'Second\nline', createdAt: 20 }];
  assert.deepEqual(normalizeRoutineLogs(JSON.parse(JSON.stringify(logs))), [
    { id: 'new', text: 'Second\nline', createdAt: 20 }, { id: 'old', text: 'First', createdAt: 10 },
  ]);
  assert.equal(logs[0].text, ' First ');
});
test('old backups and malformed entries are handled safely', () => {
  assert.deepEqual(normalizeRoutineLogs(undefined), []);
  assert.deepEqual(normalizeRoutineLogs({}), []);
  const good = { id: 'one', text: 'Completed', createdAt: 20 };
  assert.deepEqual(normalizeRoutineLogs([null, {}, { ...good, text: ' ' }, { ...good, createdAt: NaN }, good, good]), [good]);
});
test('logs with equal timestamps retain stable ordering', () => {
  const logs = [{ id: 'a', text: 'A', createdAt: 1 }, { id: 'b', text: 'B', createdAt: 1 }];
  assert.deepEqual(normalizeRoutineLogs(logs), normalizeRoutineLogs([...logs].reverse()));
});
