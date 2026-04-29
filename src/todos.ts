export type Todo = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
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
    typeof todo.createdAt === 'number'
  );
};
