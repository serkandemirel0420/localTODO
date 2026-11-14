import assert from 'node:assert/strict';
import test from 'node:test';

import { reconcileAlarmRequests } from '../src/alarmReconciliation.ts';
import { createAsyncMutationQueue } from '../src/asyncMutationQueue.ts';
import { getClockAlignedHabitHours } from '../src/habitAlarmSchedule.ts';

test('equal routine intervals share the same clock-aligned notification slots', () => {
  assert.deepEqual(
    getClockAlignedHabitHours(3, true, 0, 7),
    [9, 12, 15, 18, 21],
  );
});

test('one failed routine alarm does not prevent the other routines from scheduling', async () => {
  const scheduled = [];
  const cancelled = [];
  const result = await reconcileAlarmRequests(
    ['routine-a', 'obsolete-routine'],
    [
      { identifier: 'routine-a' },
      { identifier: 'routine-b' },
      { identifier: 'routine-c' },
    ],
    async ({ identifier }) => {
      scheduled.push(identifier);
      if (identifier === 'routine-a') {
        throw new Error('simulated Android scheduling error');
      }
    },
    async (identifier) => {
      cancelled.push(identifier);
    },
  );

  assert.deepEqual(scheduled, ['routine-a', 'routine-b', 'routine-c']);
  assert.deepEqual(cancelled, ['obsolete-routine']);
  assert.deepEqual(
    result.schedulingFailures.map(({ identifier }) => identifier),
    ['routine-a'],
  );
  assert.equal(result.cancellationFailures.length, 0);
});

test('desired alarms are retained while obsolete alarms are removed', async () => {
  const cancelled = [];
  await reconcileAlarmRequests(
    ['routine-a', 'routine-b', 'obsolete-routine'],
    [{ identifier: 'routine-a' }, { identifier: 'routine-b' }],
    async () => undefined,
    async (identifier) => {
      cancelled.push(identifier);
    },
  );

  assert.deepEqual(cancelled, ['obsolete-routine']);
});

test('serialized notification-log writes keep simultaneous deliveries', async () => {
  const enqueue = createAsyncMutationQueue();
  let storedEntries = [];

  const append = (entry) => enqueue(async () => {
    const current = [...storedEntries];
    await Promise.resolve();
    storedEntries = [entry, ...current];
  });

  await Promise.all([append('routine-a'), append('routine-b')]);

  assert.deepEqual(storedEntries, ['routine-b', 'routine-a']);
});
