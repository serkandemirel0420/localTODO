import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoutineLogTapGate } from '../src/routineLogTapGate.ts';

test('only the fourth quick tap opens logs, and the next opening needs four more', () => {
  const gate = createRoutineLogTapGate();
  assert.deepEqual([0, 1, 2, 3].map(n => gate.tap('one', 1000 + n * 200)), [false, false, false, true]);
  assert.deepEqual([0, 1, 2, 3].map(n => gate.tap('one', 2000 + n * 200)), [false, false, false, true]);
});

test('switching routines, waiting, changing screens or backgrounding resets the sequence', () => {
  const gate = createRoutineLogTapGate();
  gate.tap('one', 1000); gate.tap('one', 1200); gate.tap('one', 1400);
  assert.equal(gate.tap('two', 1600), false);
  assert.equal(gate.tap('one', 1800), false);
  gate.tap('one', 2000); gate.tap('one', 2200);
  assert.equal(gate.tap('one', 4000), false);
  gate.tap('one', 4200); gate.tap('one', 4400);
  gate.reset();
  assert.equal(gate.tap('one', 4600), false);
});
