import {
  freezeDateFilterValue,
  formatDateFilterValue,
  type DateLabelAnchor,
} from './dates';
import { normalizeReminderFilterValues } from './reminders';

export type TodoFilters = {
  date: string[];
  list: string[];
  priority: string[];
  reminder: string[];
};

export type Todo = {
  id: string;
  content: string;
  text: string;
  pinned: boolean;
  done: boolean;
  createdAt: number;
  filters: TodoFilters;
};

export type DeletedTodo = Todo & {
  deletedAt: number;
};

export const EMPTY_TODO_FILTERS: TodoFilters = {
  date: [],
  list: [],
  priority: [],
  reminder: [],
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

export const cloneTodoFilters = (filters: TodoFilters = EMPTY_TODO_FILTERS): TodoFilters => ({
  date: [...filters.date],
  list: [...filters.list],
  priority: [...filters.priority],
  reminder: [...filters.reminder],
});

const normalizeDateFilterValues = (
  values: string[],
  dateAnchor?: DateLabelAnchor,
) => (
  values
    .map((label) => (
      dateAnchor === undefined
        ? formatDateFilterValue(label)
        : freezeDateFilterValue(label, dateAnchor)
    ))
    .filter(Boolean)
);

export const normalizeTodoFilters = (
  value: unknown,
  dateAnchor?: DateLabelAnchor,
): TodoFilters => {
  if (typeof value !== 'object' || value === null) {
    return cloneTodoFilters();
  }

  const filters = value as Partial<TodoFilters>;
  return {
    date: isStringArray(filters.date)
      ? normalizeDateFilterValues(filters.date, dateAnchor)
      : [],
    list: isStringArray(filters.list)
      ? filters.list.map(formatListLabel).filter(Boolean)
      : [],
    priority: isStringArray(filters.priority) ? [...filters.priority] : [],
    reminder: isStringArray(filters.reminder)
      ? normalizeReminderFilterValues(filters.reminder)
      : [],
  };
};

const keepSelectedFilterValues = (values: string[], selectedValues: string[]) => {
  const selectedSet = new Set(selectedValues);
  return values.filter((value) => selectedSet.has(value));
};

export const pruneTodoFilters = (
  filters: TodoFilters,
  selectedFilters: TodoFilters,
): TodoFilters => {
  const normalizedFilters = normalizeTodoFilters(filters);
  const normalizedSelectedFilters = normalizeTodoFilters(selectedFilters);

  return {
    date: keepSelectedFilterValues(normalizedFilters.date, normalizedSelectedFilters.date),
    list: keepSelectedFilterValues(normalizedFilters.list, normalizedSelectedFilters.list),
    priority: keepSelectedFilterValues(normalizedFilters.priority, normalizedSelectedFilters.priority),
    reminder: keepSelectedFilterValues(normalizedFilters.reminder, normalizedSelectedFilters.reminder),
  };
};

/** Matches `styles.todoText` and list row layout in App.tsx */
export const TODO_TEXT_FONT_SIZE = 16;
export const TODO_TEXT_LINE_COUNT = 2;
export const TODO_ROW_TITLE_MAX_CHARS = 60;
const TODO_TEXT_AVERAGE_CHAR_WIDTH_RATIO = 0.53;
const TODO_LIST_HORIZONTAL_PADDING = 16;
const TODO_ROW_HORIZONTAL_PADDING = 14;
const TODO_ROW_GROUPED_SHELL_PADDING = 16;
const TODO_ROW_CHECKBOX_SIZE = 22;
const TODO_ROW_CHECKBOX_MARGIN = 12;
const TODO_ROW_TEXT_RIGHT_INSET = 36;
const TODO_ROW_GROUPED_TEXT_RIGHT_INSET = 44;
const TODO_COLOR_RAIL_WIDTH = 5;
const TODO_COLOR_RAIL_MARGIN = 12;
const TODO_ROW_PINNED_ICON_SIZE = 14;
const TODO_ROW_PINNED_ICON_MARGIN = 8;

export const getTodoRowTitleAreaWidth = (
  windowWidth: number,
  options: {
    grouped?: boolean;
    hasPriorityRail?: boolean;
    pinned?: boolean;
  } = {},
) => {
  const { grouped = false, hasPriorityRail = false, pinned = false } = options;
  const safeWindowWidth = Number.isFinite(windowWidth) && windowWidth > 0
    ? windowWidth
    : 390;
  let width = safeWindowWidth - (TODO_LIST_HORIZONTAL_PADDING * 2);

  if (grouped) {
    width -= TODO_ROW_GROUPED_SHELL_PADDING * 2;
  }

  width -= TODO_ROW_HORIZONTAL_PADDING * 2;
  width -= TODO_ROW_CHECKBOX_SIZE + TODO_ROW_CHECKBOX_MARGIN;
  width -= grouped ? TODO_ROW_GROUPED_TEXT_RIGHT_INSET : TODO_ROW_TEXT_RIGHT_INSET;

  if (hasPriorityRail) {
    width -= TODO_COLOR_RAIL_WIDTH + TODO_COLOR_RAIL_MARGIN;
  }

  if (pinned) {
    width -= TODO_ROW_PINNED_ICON_SIZE + TODO_ROW_PINNED_ICON_MARGIN;
  }

  return Math.max(120, Math.floor(width));
};

export const getTodoTextCharsPerLine = (windowWidth: number) => {
  const textWidth = getTodoRowTitleAreaWidth(windowWidth, { hasPriorityRail: true });
  const averageCharWidth = TODO_TEXT_FONT_SIZE * TODO_TEXT_AVERAGE_CHAR_WIDTH_RATIO;

  return Math.max(12, Math.floor(textWidth / averageCharWidth));
};

export const getTodoTextMaxLength = (windowWidth: number) =>
  Math.max(
    TODO_ROW_TITLE_MAX_CHARS,
    getTodoTextCharsPerLine(windowWidth) * TODO_TEXT_LINE_COUNT,
  );

export const truncateTodoText = (text: string, maxLength: number) => {
  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength).trimEnd();
};

export const normalizeTodoText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();

export const normalizeTodoContent = (value: string) =>
  value
    .replace(/\r\n?/g, '\n')
    .trim();

export const formatListLabel = (value: string) => {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  return trimmed
    .split(/\s+/)
    .map((word) => (
      word ? word.charAt(0).toLocaleUpperCase() + word.slice(1) : word
    ))
    .join(' ');
};

export const makeTodo = (
  text: string,
  filters: TodoFilters = EMPTY_TODO_FILTERS,
  content = '',
  createdAt = Date.now(),
  pinned = false,
): Todo => ({
  id: `${createdAt}-${Math.random().toString(36).slice(2)}`,
  content: normalizeTodoContent(content),
  text,
  pinned,
  done: false,
  createdAt,
  filters: normalizeTodoFilters(filters, createdAt),
});

export const isTodo = (value: unknown): value is Todo => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const todo = value as Partial<Todo>;
  return (
    typeof todo.id === 'string' &&
    (typeof todo.content === 'undefined' || typeof todo.content === 'string') &&
    typeof todo.text === 'string' &&
    (typeof todo.pinned === 'undefined' || typeof todo.pinned === 'boolean') &&
    typeof todo.done === 'boolean' &&
    typeof todo.createdAt === 'number' &&
    typeof todo.filters === 'object' &&
    todo.filters !== null
  );
};

export const normalizeTodo = (value: unknown): Todo | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const todo = value as Partial<Todo>;
  if (
    typeof todo.id !== 'string' ||
    typeof todo.text !== 'string' ||
    typeof todo.done !== 'boolean' ||
    typeof todo.createdAt !== 'number'
  ) {
    return null;
  }

  return {
    id: todo.id,
    content: typeof todo.content === 'string' ? normalizeTodoContent(todo.content) : '',
    text: todo.text,
    pinned: todo.pinned === true,
    done: todo.done,
    createdAt: todo.createdAt,
    filters: normalizeTodoFilters(todo.filters, todo.createdAt),
  };
};

export const cloneTodo = (todo: Todo): Todo => ({
  ...todo,
  filters: cloneTodoFilters(todo.filters),
});

export const cloneDeletedTodos = (todos: DeletedTodo[]): DeletedTodo[] =>
  todos.map((todo) => ({
    ...cloneTodo(todo),
    deletedAt: todo.deletedAt,
  }));

export const normalizeDeletedTodo = (value: unknown): DeletedTodo | null => {
  const todo = normalizeTodo(value);
  if (!todo || typeof value !== 'object' || value === null) {
    return null;
  }

  const deletedAt = (value as Partial<DeletedTodo>).deletedAt;

  return {
    ...todo,
    deletedAt: typeof deletedAt === 'number' && Number.isFinite(deletedAt)
      ? deletedAt
      : 0,
  };
};

export const normalizeDeletedTodos = (value: unknown): DeletedTodo[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenIds = new Set<string>();

  return value
    .map(normalizeDeletedTodo)
    .filter((todo): todo is DeletedTodo => Boolean(todo))
    .filter((todo) => {
      if (seenIds.has(todo.id)) {
        return false;
      }

      seenIds.add(todo.id);
      return true;
    })
    .sort((first, second) =>
      second.deletedAt - first.deletedAt || second.createdAt - first.createdAt
    );
};
