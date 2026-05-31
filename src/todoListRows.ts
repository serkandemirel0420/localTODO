import { StyleSheet } from 'react-native';

import {
  formatCompactDateFilterLabel,
  parseISODateLabel,
} from './dates';
import {
  DATE_MENU_ITEMS,
  getBestOrderedFilterLabel,
  PRIORITY_MENU_ITEMS,
} from './todoOptions';
import { type Todo } from './todos';
import {
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
      isFirstInSection: boolean;
      isLastInSection: boolean;
      sectionLabel: string;
      todo: Todo;
      type: 'groupedTodo';
    };

type TodoGroup = {
  key: string;
  label: string;
  rank: number;
};

const shouldGapBeforeVisibleRow = (
  previous: VisibleTodoListRow | null,
): boolean => {
  if (!previous) {
    return false;
  }

  if (previous.type === 'sectionHeader') {
    return previous.isCollapsed;
  }

  if (previous.type === 'groupedTodo' && !previous.isLastInSection) {
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

    row.todos.forEach((todo, index) => {
      const groupedRow: VisibleTodoListRow = {
        gapBefore: shouldGapBeforeVisibleRow(previous),
        id: `${row.id}::${todo.id}`,
        isFirstInSection: index === 0,
        isLastInSection: index === row.todos.length - 1,
        sectionLabel: row.label,
        todo,
        type: 'groupedTodo',
      };
      visible.push(groupedRow);
      previous = groupedRow;
    });
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

const compareTodosByFallback = (first: Todo, second: Todo) =>
  second.createdAt - first.createdAt ||
  first.text.localeCompare(second.text) ||
  first.id.localeCompare(second.id);

export const compareTodosBySortMode = (
  first: Todo,
  second: Todo,
  sortMode: TodoSortMode,
) => {
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
    return (
      getFilterRank(first.filters.priority, PRIORITY_MENU_ITEMS) -
      getFilterRank(second.filters.priority, PRIORITY_MENU_ITEMS) ||
      compareTodosByFallback(first, second)
    );
  }

  if (sortMode === 'date') {
    return (
      getFilterRank(first.filters.date, DATE_MENU_ITEMS) -
      getFilterRank(second.filters.date, DATE_MENU_ITEMS) ||
      compareTodosByFallback(first, second)
    );
  }

  return compareTodosByFallback(first, second);
};

const getTodoListGroupLabel = (
  todo: Todo,
  orderedListLabels: string[],
  listMenuTree: StoredListMenuNode[],
): TodoGroup => {
  for (const parent of listMenuTree) {
    if (!parent.children?.length) {
      continue;
    }

    const matchedChild = parent.children.find((child) => (
      todo.filters.list.includes(child.label)
    ));
    if (matchedChild) {
      const childRank = orderedListLabels.indexOf(matchedChild.label);
      return {
        key: matchedChild.label,
        label: matchedChild.label,
        rank: childRank >= 0 ? childRank : orderedListLabels.length + 1,
      };
    }

    if (todo.filters.list.includes(parent.label)) {
      const parentRank = orderedListLabels.indexOf(parent.label);
      return {
        key: `${parent.label}::${NOT_SECTIONED_LABEL}`,
        label: NOT_SECTIONED_LABEL,
        rank: parentRank >= 0 ? parentRank : orderedListLabels.length + 1,
      };
    }
  }

  const label = getBestOrderedFilterLabel(todo.filters.list, orderedListLabels, 'No list');
  const rank = orderedListLabels.indexOf(label);

  return {
    key: label,
    label,
    rank: rank >= 0 ? rank : orderedListLabels.length + 1,
  };
};

const getTodoGroup = (
  todo: Todo,
  groupMode: Exclude<TodoGroupMode, 'none'>,
  orderedListLabels: string[],
  listMenuTree: StoredListMenuNode[],
): TodoGroup => {
  if (groupMode === 'status') {
    const label = todo.done ? 'Done' : 'Active';
    return {
      key: label,
      label,
      rank: todo.done ? 1 : 0,
    };
  }

  if (groupMode === 'list') {
    return getTodoListGroupLabel(todo, orderedListLabels, listMenuTree);
  }

  if (groupMode === 'priority') {
    const label = getBestOrderedFilterLabel(todo.filters.priority, PRIORITY_MENU_ITEMS, 'No priority');
    const rank = PRIORITY_MENU_ITEMS.indexOf(label);

    return {
      key: label,
      label,
      rank: rank >= 0 ? rank : PRIORITY_MENU_ITEMS.length + 1,
    };
  }

  const rawLabel = getBestOrderedFilterLabel(todo.filters.date, DATE_MENU_ITEMS, 'No date');
  const presetRank = DATE_MENU_ITEMS.indexOf(rawLabel);
  const customDate = parseISODateLabel(rawLabel);

  return {
    key: rawLabel,
    label: formatCompactDateFilterLabel(rawLabel),
    rank: presetRank >= 0
      ? presetRank
      : customDate
        ? DATE_MENU_ITEMS.length + customDate.getTime() / 1e12
        : DATE_MENU_ITEMS.length + 1,
  };
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

const getTodoSubsectionLabel = (
  todo: Todo,
  context: ListSubsectionContext,
) => {
  const matchedSubsection = context.subsectionLabels.find((label) => (
    todo.filters.list.includes(label)
  ));

  return matchedSubsection ?? NOT_SECTIONED_LABEL;
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
    const bucket = buckets.get(getTodoSubsectionLabel(todo, context)) ?? buckets.get(NOT_SECTIONED_LABEL);
    bucket?.push(todo);
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
  orderedListLabels: string[],
  listMenuTree: StoredListMenuNode[],
): TodoListRow[] => {
  const groups = new Map<string, { key: string; label: string; rank: number; todos: Todo[] }>();

  todos.forEach((todo) => {
    const group = getTodoGroup(todo, groupMode, orderedListLabels, listMenuTree);
    const existingGroup = groups.get(group.key);

    if (existingGroup) {
      existingGroup.todos.push(todo);
      return;
    }

    groups.set(group.key, {
      key: group.key,
      label: group.label,
      rank: group.rank,
      todos: [todo],
    });
  });
  const rows: TodoListRow[] = [];

  [...groups.values()]
    .sort((first, second) => first.rank - second.rank || first.label.localeCompare(second.label))
    .forEach((group) => {
      const groupId = `group-${groupMode}-${group.key}`;

      appendSectionRows(rows, groupId, group.label, group.todos);
    });

  return rows;
};

export const buildTodoListRows = (
  todos: Todo[],
  groupMode: TodoGroupMode,
  orderedListLabels: string[],
  listMenuTree: StoredListMenuNode[],
  selectedListFilters: string[],
  useSubsectionLayout: boolean,
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
    orderedListLabels,
    listMenuTree,
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

      offset += TODO_STANDALONE_ROW_ESTIMATE;
      continue;
    }

    const collapsed = collapsedGroupIds.has(row.id);
    const todoIndex = row.todos.findIndex((todo) => todo.id === id);

    if (todoIndex >= 0) {
      offset += TODO_SECTION_HEADER_ESTIMATE;

      if (!collapsed) {
        for (let index = 0; index < todoIndex; index += 1) {
          if (index > 0) {
            offset += TODO_ROW_DIVIDER_HEIGHT;
          }

          offset += TODO_GROUPED_ROW_ESTIMATE;
        }
      }

      return offset;
    }

    offset += TODO_SECTION_HEADER_ESTIMATE;

    if (!collapsed && row.todos.length > 0) {
      for (let index = 0; index < row.todos.length; index += 1) {
        if (index > 0) {
          offset += TODO_ROW_DIVIDER_HEIGHT;
        }

        offset += TODO_GROUPED_ROW_ESTIMATE;
      }

      offset += TODO_SECTION_BODY_BOTTOM_PADDING;
    }
  }

  return null;
};
