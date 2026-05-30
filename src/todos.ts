export type TodoFilters = {
  date: string[];
  list: string[];
  priority: string[];
};

export type Todo = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  filters: TodoFilters;
};

export const EMPTY_TODO_FILTERS: TodoFilters = {
  date: [],
  list: [],
  priority: [],
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

export const cloneTodoFilters = (filters: TodoFilters = EMPTY_TODO_FILTERS): TodoFilters => ({
  date: [...filters.date],
  list: [...filters.list],
  priority: [...filters.priority],
});

export const normalizeTodoFilters = (value: unknown): TodoFilters => {
  if (typeof value !== 'object' || value === null) {
    return cloneTodoFilters();
  }

  const filters = value as Partial<TodoFilters>;
  return {
    date: isStringArray(filters.date) ? [...filters.date] : [],
    list: isStringArray(filters.list) ? [...filters.list] : [],
    priority: isStringArray(filters.priority) ? [...filters.priority] : [],
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

export const makeTodo = (
  text: string,
  filters: TodoFilters = EMPTY_TODO_FILTERS,
): Todo => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  text,
  done: false,
  createdAt: Date.now(),
  filters: cloneTodoFilters(filters),
});

export const isTodo = (value: unknown): value is Todo => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const todo = value as Partial<Todo>;
  return (
    typeof todo.id === 'string' &&
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
    text: todo.text,
    done: todo.done,
    createdAt: todo.createdAt,
    filters: normalizeTodoFilters(todo.filters),
  };
};
