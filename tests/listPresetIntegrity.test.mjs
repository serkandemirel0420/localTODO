import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureListMenuTreeCoversPresetLists } from '../src/listPresetIntegrity.ts';

const makePreset = (list, sections = []) => ({
  filters: { list },
  requiredFilters: { list: [] },
  sections,
});

test('repairs an orphaned list preset without replacing existing lists', () => {
  const listMenuTree = [{ label: 'INDEX' }, { label: 'Inbox' }];
  const repaired = ensureListMenuTreeCoversPresetLists(
    listMenuTree,
    [makePreset(['Babamın Hapları'])],
    (label) => ({ label }),
  );

  assert.deepEqual(repaired, [
    { label: 'INDEX' },
    { label: 'Inbox' },
    { label: 'Babamın Hapları' },
  ]);
  assert.deepEqual(listMenuTree, [{ label: 'INDEX' }, { label: 'Inbox' }]);
});

test('does not create duplicates for existing nested or differently cased lists', () => {
  const listMenuTree = [{
    label: 'Family',
    children: [{ label: 'Babamın Hapları' }],
  }];
  const repaired = ensureListMenuTreeCoversPresetLists(
    listMenuTree,
    [makePreset(['BABAMIN HAPLARI', 'Family'])],
    (label) => ({ label }),
  );

  assert.strictEqual(repaired, listMenuTree);
});

test('repairs list references owned by preset sections', () => {
  const repaired = ensureListMenuTreeCoversPresetLists(
    [{ label: 'INDEX' }],
    [makePreset([], [makePreset(['Medication'])])],
    (label) => ({ label }),
  );

  assert.deepEqual(repaired.map((node) => node.label), ['INDEX', 'Medication']);
});
