import { StyleSheet } from 'react-native';

import {
  formatDateDisplayLabel,
  getDateFilterSortRank,
  type DateLabelDisplayMode,
} from './dates';
import {
  DATE_MENU_ITEMS,
  getBestOrderedFilterLabel,
  PRIORITY_MENU_ITEMS,
} from './todoOptions';
import { getEffectiveTodoDateLabels } from './todoDates';
import { type Todo } from './todos';
import {
  findListMenuNode,
  getListSubsectionContext,
  type ListSubsectionContext,
  type StoredListMenuNode,
  type TodoGroupMode,
  type TodoSortMode,
} from './storage/appSettingsStore';

export const TODO_LIST_ROW_GAP = 12;
export const TODO_LIST_CONTENT_TOP_PADDING = 8;
export const TODO_STANDALONE_ROW_ESTIMATE = 76;
export const TODO_GROUPED_ROW_ESTIMATE = 64;
export const TODO_SECTION_HEADER_ESTIMATE = 52;
export const TODO_SECTION_BODY_BOTTOM_PADDING = 12;
export const TODO_ROW_DIVIDER_HEIGHT = StyleSheet.hairlineWidth;
const TODO_GROUPED_ROW_BATCH_SIZE = 8;
const TODO_CONTENT_ROW_ESTIMATE = 22;

const NOT_SECTIONED_LABEL = 'Not Sectioned';

export type TodoListRow =
  | {
      id: string;
      todo: Todo;
      type: 'todo';
    }
  | {
      count: number;
      id: string;
      label: string;
      todos: Todo[];
      type: 'section';
    };

export type VisibleTodoListRow =
  | {
      gapBefore: boolean;
      id: string;
      todo: Todo;
      type: 'todo';
    }
  | {
      count: number;
      gapBefore: boolean;
      id: string;
      isCollapsed: boolean;
      label: string;
      type: 'sectionHeader';
    }
  | {
      gapBefore: boolean;
      id: string;
      isLastBatch: boolean;
      sectionLabel: string;
      sectionStartIndex: number;
      sectionTodoCount: number;
      todos: Todo[];
      type: 'groupedTodoBatch';
    };

type TodoGroup = {
  key: string;
  label: string;
  rank: number;
};

type TodoGroupBucket = TodoGroup & {
  firstTodoIndex: number;
  todos: Todo[];
};

const getListGroupRank = (label: string, orderedListLabels: string[]) => {
  const rank = orderedListLabels.indexOf(label);
  return rank >= 0 ? rank : orderedListLabels.length + 1;
};

const createListGroup = (
  key: string,
  label: string,
  orderedListLabels: string[],
  rankLabel = label,
): TodoGroup => ({
  key,
  label,
  rank: getListGroupRank(rankLabel, orderedListLabels),
});

const getTodoListGroupForLabel = (
  label: string,
  orderedListLabels: string[],
  listMenuTree: StoredListMenuNode[],
): TodoGroup => {
  const normalizedLabel = label.toLocaleLowerCase();

  for (const parent of listMenuTree) {
    if (parent.label.toLocaleLowerCase() === normalizedLabel) {
      return parent.children?.length
        ? createListGroup(
          `${parent.label}::${NOT_SECTIONED_LABEL}`,
          NOT_SECTIONED_LABEL,
          orderedListLabels,
          parent.label,
        )
        : createListGroup(parent.label, parent.label, orderedListLabels);
    }

    const child = parent.children?.find((item) => (
      item.label.toLocaleLowerCase() === normalizedLabel
    ));
    if (child) {
      return createListGroup(child.label, child.label, orderedListLabels);
    }
  }

  return createListGroup(label, label, orderedListLabels);
};

export const collectListGroupsFromMenuTree = (
  listMenuTree: StoredListMenuNode[],
  orderedListLabels: string[],
): TodoGroup[] => {
  const groups: TodoGroup[] = [];
  const seenKeys = new Set<string>();

  const addGroup = (group: TodoGroup) => {
    if (seenKeys.has(group.key)) {
      return;
    }

    seenKeys.add(group.key);
    groups.push(group);
  };

  for (const parent of listMenuTree) {
    if (!parent.children?.length) {
      addGroup(createListGroup(parent.label, parent.label, orderedListLabels));
      continue;
    }

    parent.children.forEach((child) => {
      addGroup(createListGroup(child.label, child.label, orderedListLabels));
    });

    addGroup(createListGroup(
      `${parent.label}::${NOT_SECTIONED_LABEL}`,
      NOT_SECTIONED_LABEL,
      orderedListLabels,
      parent.label,
    ));
  }

  addGroup(createListGroup('No list', 'No list', orderedListLabels));

  return groups;
};

const collectListGroupsForLabels = (
  labels: string[],
  listMenuTree: StoredListMenuNode[],
  orderedListLabels: string[],
): TodoGroup[] => {
  const groups: TodoGroup[] = [];
  const seenKeys = new Set<string>();

  const addGroup = (group: TodoGroup) => {
    if (seenKeys.has(group.key)) {
      return;
    }

    seenKeys.add(group.key);
    groups.push(group);
  };

  labels.forEach((label) => {
    const node = findListMenuNode(listMenuTree, label);

    if (!node) {
      return;
    }

    if (!node.children?.length) {
      addGroup(getTodoListGroupForLabel(node.label, orderedListLabels, listMenuTree));
      return;
    }

    node.children.forEach((child) => {
      addGroup(createListGroup(child.label, child.label, orderedListLabels));
    });

    addGroup(createListGroup(
      `${node.label}::${NOT_SECTIONED_LABEL}`,
      NOT_SECTIONED_LABEL,
      orderedListLabels,
      node.label,
    ));
  });

  return groups;
};

const shouldGapBeforeVisibleRow = (
  previous: VisibleTodoListRow | null,
): boolean => {
  if (!previous) {
    return false;
  }

  if (previous.type === 'sectionHeader') {
    return previous.isCollapsed || previous.count === 0;
  }

  if (previous.type === 'groupedTodoBatch' && !previous.isLastBatch) {
    return false;
  }

  return true;
};

export const flattenTodoListRows = (
  rows: TodoListRow[],
  collapsedGroupIds: Set<string>,
): VisibleTodoListRow[] => {
  const visible: VisibleTodoListRow[] = [];
  let previous: VisibleTodoListRow | null = null;

  rows.forEach((row) => {
    if (row.type === 'todo') {
      const nextRow: VisibleTodoListRow = {
        gapBefore: shouldGapBeforeVisibleRow(previous),
        id: row.id,
        todo: row.todo,
        type: 'todo',
      };
      visible.push(nextRow);
      previous = nextRow;
      return;
    }

    const isCollapsed = collapsedGroupIds.has(row.id);
    const sectionHeader: VisibleTodoListRow = {
      count: row.count,
      gapBefore: shouldGapBeforeVisibleRow(previous),
      id: row.id,
      isCollapsed,
      label: row.label,
      type: 'sectionHeader',
    };
    visible.push(sectionHeader);
    previous = sectionHeader;

    if (isCollapsed) {
      return;
    }

    for (
      let startIndex = 0;
      startIndex < row.todos.length;
      startIndex += TODO_GROUPED_ROW_BATCH_SIZE
    ) {
      const todos = row.todos.slice(
        startIndex,
        startIndex + TODO_GROUPED_ROW_BATCH_SIZE,
      );
      const groupedBatch: VisibleTodoListRow = {
        gapBefore: shouldGapBeforeVisibleRow(previous),
        id: `${row.id}::batch:${startIndex}`,
        isLastBatch: startIndex + todos.length === row.todos.length,
        sectionLabel: row.label,
        sectionStartIndex: startIndex,
        sectionTodoCount: row.todos.length,
        todos,
        type: 'groupedTodoBatch',
      };
      visible.push(groupedBatch);
      previous = groupedBatch;
    }
  });

  return visible;
};

const appendSectionRows = (
  rows: TodoListRow[],
  sectionId: string,
  label: string,
  sectionTodos: Todo[],
): void => {
  rows.push({
    count: sectionTodos.length,
    id: sectionId,
    label,
    todos: sectionTodos,
    type: 'section',
  });
};

const getFilterRank = (values: string[], orderedLabels: string[]) =>
  values.reduce((bestRank, value) => {
    const rank = orderedLabels.indexOf(value);
    return rank >= 0 ? Math.min(bestRank, rank) : bestRank;
  }, orderedLabels.length);

const getDateLabelMenuRank = (label: string, index: number) => {
  const rank = DATE_MENU_ITEMS.indexOf(label);
  return rank >= 0 ? rank : DATE_MENU_ITEMS.length + index;
};

const getBestDateFilterLabel = (
  values: string[],
  fallbackLabel: string,
  now = new Date(),
  anchor?: number,
) => {
  let bestLabel = fallbackLabel;
  let bestSortRank = getDateFilterSortRank(fallbackLabel, now, anchor);
  let bestMenuRank = DATE_MENU_ITEMS.length + values.length;

  values.forEach((value, index) => {
    const sortRank = getDateFilterSortRank(value, now, anchor);
    const menuRank = getDateLabelMenuRank(value, index);

    if (sortRank < bestSortRank || (sortRank === bestSortRank && menuRank < bestMenuRank)) {
      bestLabel = value;
      bestSortRank = sortRank;
      bestMenuRank = menuRank;
    }
  });

  return bestLabel;
};

const getTodoDateSortRank = (todo: Todo, now = new Date()) =>
  getDateFilterSortRank(
    getBestDateFilterLabel(
      getEffectiveTodoDateLabels(todo, now),
      'No date',
      now,
      todo.createdAt,
    ),
    now,
    todo.createdAt,
  );

const EXACT_RELATIVE_DATE_GROUP_LABELS = new Set(['Today', 'Tomorrow']);

const getDateGroupKey = (rawLabel: string, displayLabel: string) => (
  EXACT_RELATIVE_DATE_GROUP_LABELS.has(displayLabel) ? displayLabel : rawLabel
);

const compareTodosByFallback = (first: Todo, second: Todo) =>
  second.createdAt - first.createdAt ||
  first.text.localeCompare(second.text) ||
  first.id.localeCompare(second.id);

const compareTodosByPinned = (first: Todo, second: Todo) =>
  Number(second.pinned) - Number(first.pinned);

const getTodoRowEstimate = (todo: Todo, baseEstimate: number) =>
  todo.content.trim() ? baseEstimate + TODO_CONTENT_ROW_ESTIMATE : baseEstimate;

const compareTodosByPriorityRank = (first: Todo, second: Todo) =>
  getFilterRank(first.filters.priority, PRIORITY_MENU_ITEMS) -
  getFilterRank(second.filters.priority, PRIORITY_MENU_ITEMS);

const compareTodosByDateRank = (first: Todo, second: Todo, now = new Date()) =>
  getTodoDateSortRank(first, now) - getTodoDateSortRank(second, now);

export const compareTodosBySortMode = (
  first: Todo,
  second: Todo,
  sortMode: TodoSortMode,
  now = new Date(),
) => {
  const pinnedCompare = compareTodosByPinned(first, second);

  if (pinnedCompare !== 0) {
    return pinnedCompare;
  }

  if (sortMode === 'oldest') {
    return (
      first.createdAt - second.createdAt ||
      first.text.localeCompare(second.text) ||
      first.id.localeCompare(second.id)
    );
  }

  if (sortMode === 'alphabetical') {
    return first.text.localeCompare(second.text) || compareTodosByFallback(first, second);
  }

  if (sortMode === 'priority') {
    return compareTodosByPriorityRank(first, second) || compareTodosByFallback(first, second);
  }

  if (sortMode === 'priorityDate') {
    return (
      compareTodosByPriorityRank(first, second) ||
      compareTodosByDateRank(first, second, now) ||
      compareTodosByFallback(first, second)
    );
  }

  if (sortMode === 'date') {
    return (
      compareTodosByDateRank(first, second, now) ||
      compareTodosByFallback(first, second)
    );
  }

  return compareTodosByFallback(first, second);
};

export const createTodoSortComparator = (
  sortMode: TodoSortMode,
  now = new Date(),
) => {
  if (sortMode !== 'date' && sortMode !== 'priorityDate') {
    return (first: Todo, second: Todo) => (
      compareTodosBySortMode(first, second, sortMode, now)
    );
  }

  const dateRankByTodo = new WeakMap<Todo, number>();
  const getCachedDateRank = (todo: Todo) => {
    const cachedRank = dateRankByTodo.get(todo);
    if (cachedRank !== undefined) {
      return cachedRank;
    }

    const rank = getTodoDateSortRank(todo, now);
    dateRankByTodo.set(todo, rank);
    return rank;
  };

  return (first: Todo, second: Todo) => {
    const pinnedCompare = compareTodosByPinned(first, second);

    const dateCompare = getCachedDateRank(first) - getCachedDateRank(second);

    if (sortMode === 'priorityDate') {
      return (
        pinnedCompare ||
        compareTodosByPriorityRank(first, second) ||
        dateCompare ||
        compareTodosByFallback(first, second)
      );
    }

    return pinnedCompare || dateCompare || compareTodosByFallback(first, second);
  };
};

const getTodoListGroupLabels = (
  todo: Todo,
  orderedListLabels: string[],
  listMenuTree: StoredListMenuNode[],
): TodoGroup[] => {
  const groups: TodoGroup[] = [];
  const seenKeys = new Set<string>();

  todo.filters.list.forEach((label) => {
    const node = findListMenuNode(listMenuTree, label);
    if (!node) {
      return;
    }

    const group = getTodoListGroupForLabel(node.label, orderedListLabels, listMenuTree);
    if (seenKeys.has(group.key)) {
      return;
    }

    seenKeys.add(group.key);
    groups.push(group);
  });

  if (groups.length === 0) {
    groups.push(createListGroup('No list', 'No list', orderedListLabels));
  }

  return groups;
};

const getTodoGroups = (
  todo: Todo,
  groupMode: Exclude<TodoGroupMode, 'none'>,
  orderedListLabels: string[],
  listMenuTree: StoredListMenuNode[],
  dateLabelDisplayMode: DateLabelDisplayMode,
  now = new Date(),
): TodoGroup[] => {
  if (groupMode === 'status') {
    const label = todo.done ? 'Done' : 'Active';
    return [{
      key: label,
      label,
      rank: todo.done ? 1 : 0,
    }];
  }

  if (groupMode === 'list') {
    return getTodoListGroupLabels(todo, orderedListLabels, listMenuTree);
  }

  if (groupMode === 'priority') {
    const label = getBestOrderedFilterLabel(todo.filters.priority, PRIORITY_MENU_ITEMS, 'No priority');
    const rank = PRIORITY_MENU_ITEMS.indexOf(label);

    return [{
      key: label,
      label,
      rank: rank >= 0 ? rank : PRIORITY_MENU_ITEMS.length + 1,
    }];
  }

  const rawLabel = getBestDateFilterLabel(
    getEffectiveTodoDateLabels(todo, now),
    'No date',
    now,
    todo.createdAt,
  );
  const displayLabel = formatDateDisplayLabel(
    rawLabel,
    dateLabelDisplayMode,
    now,
    todo.createdAt,
  );

  return [{
    key: getDateGroupKey(rawLabel, displayLabel),
    label: displayLabel,
    rank: getDateFilterSortRank(rawLabel, now, todo.createdAt),
  }];
};

const todoBelongsToListParent = (
  todo: Todo,
  parentLabel: string,
  subsectionLabels: string[],
) => {
  if (todo.filters.list.includes(parentLabel)) {
    return true;
  }

  return subsectionLabels.some((label) => todo.filters.list.includes(label));
};

const getTodoSubsectionLabels = (
  todo: Todo,
  context: ListSubsectionContext,
): string[] => {
  const labels: string[] = [];

  if (todo.filters.list.includes(context.parentLabel)) {
    labels.push(NOT_SECTIONED_LABEL);
  }

  context.subsectionLabels.forEach((label) => {
    if (todo.filters.list.includes(label)) {
      labels.push(label);
    }
  });

  return labels.length > 0 ? labels : [NOT_SECTIONED_LABEL];
};

const buildSubsectionRows = (
  todos: Todo[],
  context: ListSubsectionContext,
): TodoListRow[] => {
  const scopedTodos = todos.filter((todo) => (
    todoBelongsToListParent(todo, context.parentLabel, context.subsectionLabels)
  ));
  const buckets = new Map<string, Todo[]>(
    [NOT_SECTIONED_LABEL, ...context.subsectionLabels].map((label) => [label, []]),
  );

  scopedTodos.forEach((todo) => {
    getTodoSubsectionLabels(todo, context).forEach((label) => {
      const bucket = buckets.get(label) ?? buckets.get(NOT_SECTIONED_LABEL);
      bucket?.push(todo);
    });
  });

  const sectionOrder = [NOT_SECTIONED_LABEL, ...context.subsectionLabels];
  const rows: TodoListRow[] = [];

  sectionOrder.forEach((label) => {
    const sectionTodos = buckets.get(label) ?? [];
    const sectionId = `subsection-${context.parentLabel}-${label}`;

    appendSectionRows(rows, sectionId, label, sectionTodos);
  });

  return rows;
};

const buildGroupedSectionRows = (
  todos: Todo[],
  groupMode: Exclude<TodoGroupMode, 'none'>,
  sortMode: TodoSortMode,
  orderedListLabels: string[],
  listMenuTree: StoredListMenuNode[],
  dateLabelDisplayMode: DateLabelDisplayMode,
  seedListGroupLabels: string[] = [],
  now = new Date(),
): TodoListRow[] => {
  const groups = new Map<string, TodoGroupBucket>();
  const ensureGroup = (group: TodoGroup) => {
    if (groups.has(group.key)) {
      return;
    }

    groups.set(group.key, {
      key: group.key,
      label: group.label,
      rank: group.rank,
      firstTodoIndex: Number.POSITIVE_INFINITY,
      todos: [],
    });
  };

  if (groupMode === 'list' && seedListGroupLabels.length > 0) {
    collectListGroupsForLabels(
      seedListGroupLabels,
      listMenuTree,
      orderedListLabels,
    ).forEach(ensureGroup);
  }

  todos.forEach((todo, todoIndex) => {
    getTodoGroups(
      todo,
      groupMode,
      orderedListLabels,
      listMenuTree,
      dateLabelDisplayMode,
      now,
    ).forEach((group) => {
      const existingGroup = groups.get(group.key);

      if (existingGroup) {
        existingGroup.todos.push(todo);
        existingGroup.firstTodoIndex = Math.min(existingGroup.firstTodoIndex, todoIndex);
        return;
      }

      groups.set(group.key, {
        key: group.key,
        label: group.label,
        rank: group.rank,
        firstTodoIndex: todoIndex,
        todos: [todo],
      });
    });
  });
  const rows: TodoListRow[] = [];
  const sortDateGroupsByTodoOrder =
    groupMode === 'date' && (sortMode === 'newest' || sortMode === 'oldest');

  [...groups.values()]
    .sort((first, second) => {
      if (sortDateGroupsByTodoOrder) {
        return (
          first.firstTodoIndex - second.firstTodoIndex ||
          first.rank - second.rank ||
          first.label.localeCompare(second.label)
        );
      }

      return first.rank - second.rank || first.label.localeCompare(second.label);
    })
    .forEach((group) => {
      const groupId = `group-${groupMode}-${group.key}`;

      appendSectionRows(rows, groupId, group.label, group.todos);
    });

  return rows;
};

export const buildTodoListRows = (
  todos: Todo[],
  groupMode: TodoGroupMode,
  sortMode: TodoSortMode,
  orderedListLabels: string[],
  listMenuTree: StoredListMenuNode[],
  selectedListFilters: string[],
  useSubsectionLayout: boolean,
  dateLabelDisplayMode: DateLabelDisplayMode = 'exact',
  seedListGroupLabels: string[] = [],
  now = new Date(),
): TodoListRow[] => {
  const subsectionContext = useSubsectionLayout
    ? getListSubsectionContext(listMenuTree, selectedListFilters)
    : null;

  if (subsectionContext) {
    return buildSubsectionRows(todos, subsectionContext);
  }

  if (groupMode === 'none') {
    return todos.map((todo) => ({
      id: todo.id,
      todo,
      type: 'todo',
    }));
  }

  return buildGroupedSectionRows(
    todos,
    groupMode,
    sortMode,
    orderedListLabels,
    listMenuTree,
    dateLabelDisplayMode,
    seedListGroupLabels,
    now,
  );
};

export const estimateTodoListOffsetForId = (
  rows: TodoListRow[],
  id: string,
  collapsedGroupIds: Set<string>,
): number | null => {
  let offset = TODO_LIST_CONTENT_TOP_PADDING;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];

    if (rowIndex > 0) {
      offset += TODO_LIST_ROW_GAP;
    }

    if (row.type === 'todo') {
      if (row.todo.id === id) {
        return offset;
      }

      offset += getTodoRowEstimate(row.todo, TODO_STANDALONE_ROW_ESTIMATE);
      continue;
    }

    const collapsed = collapsedGroupIds.has(row.id);
    const todoIndex = row.todos.findIndex((todo) => todo.id === id);

    offset += TODO_SECTION_HEADER_ESTIMATE;

    if (todoIndex >= 0) {
      if (collapsed) {
        continue;
      }

      for (let index = 0; index < todoIndex; index += 1) {
        if (index > 0) {
          offset += TODO_ROW_DIVIDER_HEIGHT;
        }

        offset += getTodoRowEstimate(row.todos[index], TODO_GROUPED_ROW_ESTIMATE);
      }

      return offset;
    }

    if (!collapsed && row.todos.length > 0) {
      for (let index = 0; index < row.todos.length; index += 1) {
        if (index > 0) {
          offset += TODO_ROW_DIVIDER_HEIGHT;
        }

        offset += getTodoRowEstimate(row.todos[index], TODO_GROUPED_ROW_ESTIMATE);
      }

      offset += TODO_SECTION_BODY_BOTTOM_PADDING;
    }
  }

  return null;
};
