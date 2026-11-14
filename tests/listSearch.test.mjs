import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the production selectors without mounting the native app shell.
const declarations = new Map();
for (const filename of ['App.tsx', 'src/todos.ts', 'src/storage/appSettingsStore.ts']) {
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      declarations.set(node.name.text, node.initializer.getText(source));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const selectors = [
  'normalizeTodoText', 'collectListNodeLabels', 'PRESET_SEARCH_NO_MATCH_SCORE',
  'normalizePresetSearchInput', 'isOrderedSubsequence', 'getOrderedSubsequenceScore',
  'getPresetSearchWordScore', 'getSearchTextScore', 'getPresetSearchScore',
  'getListMenuSearchScore', 'getSearchCollapsedIds', 'buildSearchListRows', 'buildSearchListMenuRows',
  'searchListTodos', 'searchListMenuSources', 'searchListMenuItems',
  'searchPresetItems', 'searchListMenuTodosByLabel', 'searchPresetIdsCollapsedForRender',
  'searchListLabelsCollapsedForRender', 'searchListRows', 'toggleAllSearchResultsCollapsed',
  'handleSearchDoubleTap', 'handleSearchNavPress', 'handleSearchInputPressIn',
];
const code = ts.transpileModule(selectors.map((name) => {
  assert.ok(declarations.has(name), `Missing production selector ${name}`);
  return `var ${name} = ${declarations.get(name)};`;
}).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

const todo = (id, list, done = false) => ({ id, filters: { list: [list] }, done });
const run = (query, overrides = {}) => {
  const context = vm.createContext({
    useMemo: (factory) => factory(),
    useCallback: (callback) => callback,
    showSearchPresetSections: true,
    searchPresetQuery: query,
    listMenuTree: [{ label: 'Babamın Hapları' }, { label: 'Finance' }, { label: 'Empty' }],
    todos: [todo('medicine', 'Babamın Hapları'), todo('bill', 'Finance')],
    // A navbar scope that must not hide Finance in global List Search.
    sortedTodos: [todo('medicine', 'Babamın Hapları')],
    pendingDeleteIds: new Set(),
    hideDoneTodos: true,
    todoSortComparator: (a, b) => a.id.localeCompare(b.id),
    searchPresetSources: Array.from({ length: 100 }, (_, i) => ({
      kind: 'property', count: 1,
      preset: { id: `date-${i}`, label: `Created ${i} days ago`, searchKeywords: 'date created' },
    })),
    collapsedSearchListLabels: new Set(),
    collapsedSearchPresetIds: new Set(),
    knownSearchListLabelsRef: { current: new Set() },
    knownSearchPresetIdsRef: { current: new Set() },
    searchPresetTodosByPresetId: new Map(),
    pendingSearchPresetScrollOffsetRef: { current: null },
    actualScrollOffsetY: { current: 80 },
    todoListRef: { current: { clearLayoutCacheOnUpdate() {} } },
    searchQueryValueRef: { current: query },
    triggerSubtleHaptic() {},
    todoSelectMode: false,
    lastSearchNavTapRef: { current: 0 },
    lastSearchInputTapRef: { current: 0 },
    DOUBLE_TAP_DELAY: 300,
    handleNavTabPress() {},
    ...overrides,
  });
  context.setCollapsedSearchPresetIds = (value) => { context.collapsedSearchPresetIds = value; };
  context.setCollapsedSearchListLabels = (value) => { context.collapsedSearchListLabels = value; };
  context.handleSearchQueryChange = (value) => { context.searchQueryValueRef.current = value; };
  vm.runInContext(code, context);
  return context;
};
const labels = (result) => Array.from(result.searchListMenuItems, (item) => item.node.label);

test('partial Turkish list names match without hidden keywords or unrelated date groups', () => {
  const result = run('babam hap');
  assert.deepEqual(labels(result), ['Babamın Hapları']);
  assert.equal(result.searchPresetItems.length, 0);
  assert.equal(result.searchListRows[0].node.label, 'Babamın Hapları');
});

test('Finance is searchable outside the active navbar list', () => {
  const result = run('finance');
  assert.deepEqual(labels(result), ['Finance']);
  assert.equal(result.searchListMenuItems[0].count, 1);
});

test('empty lists remain searchable while done and pending-delete items stay hidden', () => {
  const result = run('finance', {
    todos: [todo('done', 'Finance', true), todo('deleted', 'Finance')],
    pendingDeleteIds: new Set(['deleted']),
  });
  assert.deepEqual(labels(result), ['Finance']);
  assert.equal(result.searchListMenuItems[0].count, 0);
  assert.deepEqual(labels(run('empty')), ['Empty']);
});

test('nested list names match their parent and include items at every depth', () => {
  const result = run('babam hap', {
    listMenuTree: [{ label: 'Finance', children: [
      { label: 'Family', children: [{ label: 'Babamın Hapları' }] },
    ] }],
  });
  assert.deepEqual(labels(result), ['Finance']);
  assert.equal(result.searchListMenuItems[0].count, 2);
});

test('saved preset names and hidden keywords remain searchable', () => {
  const result = run('finance', { searchPresetSources: [
    { kind: 'saved', preset: { id: 'finance', label: 'Finance' } },
    { kind: 'saved', preset: { id: 'other', label: 'Other' } },
  ] });
  assert.equal(result.searchPresetItems.length, 1);
  assert.equal(result.searchPresetItems[0].preset.id, 'finance');
  assert.ok(Number.isFinite(result.getListMenuSearchScore({ label: 'Finance', searchKeywords: 'bills' }, 'bills')));
  assert.ok(Number.isFinite(result.getPresetSearchScore({ label: 'Family', sections: [{ label: 'Babamın Hapları' }] }, 'babam hap')));
});

test('clearing the query restores all groups with lists ahead of date groups', () => {
  const result = run('');
  assert.deepEqual(labels(result), ['Babamın Hapları', 'Finance', 'Empty']);
  assert.equal(result.searchPresetItems.length, 100);
  assert.equal(result.searchListRows[0].type, 'searchListHeader');
});

test('unmatched queries return an empty result and date queries still find date groups', () => {
  assert.equal(run('zzzzzzzz').searchListRows.length, 0);
  assert.equal(run('created').searchPresetItems.length, 100);
});

test('all lists, saved presets, and date groups render collapsed on first opening', () => {
  const result = run('');
  const headers = result.searchListRows.filter((row) => row.type.endsWith('Header'));
  assert.equal(headers.length, 103);
  assert.ok(headers.every((row) => row.isCollapsed));
  assert.ok(result.searchListRows.every((row) => !row.type.endsWith('Todo')));
  assert.ok(run('babam hap').searchListRows[0].isCollapsed);
});

const commitAndRender = (result) => {
  result.knownSearchListLabelsRef.current = new Set(result.searchListMenuItems.map((item) => item.node.label));
  result.knownSearchPresetIdsRef.current = new Set(result.searchPresetItems.map((item) => item.preset.id));
  vm.runInContext(code, result);
};

test('empty-field double taps expand all results and then collapse them again', () => {
  let timestamp = 1000;
  const result = run('', { Date: { now: () => (timestamp += 100) } });
  result.handleSearchInputPressIn();
  result.handleSearchInputPressIn();
  commitAndRender(result);
  assert.ok(result.searchListRows.filter((row) => row.type.endsWith('Header')).every((row) => !row.isCollapsed));
  assert.ok(result.searchListRows.some((row) => row.type === 'searchListTodo'));
  result.handleSearchInputPressIn();
  result.handleSearchInputPressIn();
  commitAndRender(result);
  assert.ok(result.searchListRows.filter((row) => row.type.endsWith('Header')).every((row) => row.isCollapsed));
  assert.equal(result.pendingSearchPresetScrollOffsetRef.current, 80);
});

test('empty Search navigation double tap collapses a mixture of open and closed results', () => {
  let timestamp = 1000;
  const result = run('', { Date: { now: () => (timestamp += 100) } });
  result.collapsedSearchListLabels = new Set(['Finance', 'Empty']);
  result.collapsedSearchPresetIds = result.searchPresetIdsCollapsedForRender;
  commitAndRender(result);
  result.handleSearchNavPress();
  result.handleSearchNavPress();
  commitAndRender(result);
  assert.ok(result.searchListRows.filter((row) => row.type.endsWith('Header')).every((row) => row.isCollapsed));
});

test('nonempty double tap still clears text without expanding results', () => {
  const result = run('finance');
  result.handleSearchDoubleTap();
  assert.equal(result.searchQueryValueRef.current, '');
  assert.ok(result.searchListLabelsCollapsedForRender.has('Finance'));
});

test('newly appearing results collapse while manually expanded known results stay expanded', () => {
  const result = run('');
  assert.deepEqual(Array.from(result.getSearchCollapsedIds(
    ['Finance', 'New list'], new Set(['Finance']), new Set(),
  )), ['New list']);
  // Leaving List Search clears its known IDs, so re-entry starts collapsed.
  assert.deepEqual(Array.from(result.getSearchCollapsedIds(
    ['Finance'], new Set(), new Set(),
  )), ['Finance']);
});
