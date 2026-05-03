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

export const normalizeTodoText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();

export const makeTodo = (text: string): Todo => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  text,
  done: false,
  createdAt: Date.now(),
  filters: cloneTodoFilters(),
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
