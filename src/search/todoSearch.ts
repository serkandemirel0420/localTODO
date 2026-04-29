import MiniSearch from 'minisearch';

import { normalizeTodoText, type Todo } from '../todos';

export const createTodoSearchIndex = (todos: Todo[]) => {
  const index = new MiniSearch<Todo>({
    fields: ['text'],
    idField: 'id',
    processTerm: (term) => normalizeTodoText(term) || null,
    searchOptions: {
      combineWith: 'AND',
      fuzzy: 0.2,
      prefix: true,
    },
    storeFields: ['id'],
  });

  index.addAll(todos);
  return index;
};

export const searchTodos = (
  todos: Todo[],
  index: MiniSearch<Todo>,
  query: string,
) => {
  const normalizedQuery = normalizeTodoText(query);

  if (!normalizedQuery) {
    return todos;
  }

  const todosById = new Map(todos.map((todo) => [todo.id, todo]));

  return index
    .search(normalizedQuery)
    .map((result) => todosById.get(String(result.id)))
    .filter((todo): todo is Todo => Boolean(todo));
};
