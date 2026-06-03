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

/** Matches `styles.todoText` and list row layout in App.tsx */
export const TODO_TEXT_FONT_SIZE = 16;
export const TODO_TEXT_LINE_COUNT = 2;
const TODO_TEXT_AVERAGE_CHAR_WIDTH_RATIO = 0.53;
const TODO_LIST_HORIZONTAL_PADDING = 16;
const TODO_ROW_HORIZONTAL_PADDING = 16;
const TODO_COLOR_RAIL_WIDTH = 5;
const TODO_COLOR_RAIL_MARGIN = 12;

export const getTodoTextCharsPerLine = (windowWidth: number) => {
  const textWidth = Math.max(
    120,
    windowWidth
      - TODO_LIST_HORIZONTAL_PADDING * 2
      - TODO_ROW_HORIZONTAL_PADDING * 2
      - TODO_COLOR_RAIL_WIDTH
      - TODO_COLOR_RAIL_MARGIN,
  );
  const averageCharWidth = TODO_TEXT_FONT_SIZE * TODO_TEXT_AVERAGE_CHAR_WIDTH_RATIO;

  return Math.max(12, Math.floor(textWidth / averageCharWidth));
};

export const getTodoTextMaxLength = (windowWidth: number) =>
  getTodoTextCharsPerLine(windowWidth) * TODO_TEXT_LINE_COUNT;

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
): Todo => ({
  id: `${createdAt}-${Math.random().toString(36).slice(2)}`,
  content: normalizeTodoContent(content),
  text,
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
