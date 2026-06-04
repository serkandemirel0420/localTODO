import { type Todo } from '../todos';
import {
  deleteTodoFromDatabase,
  loadTodosFromDatabase,
  replaceAllTodosInDatabase,
  searchTodosInDatabase,
  updateTodoDoneInDatabase,
  updateTodoFiltersInDatabase,
  upsertTodoInDatabase,
  upsertTodosInDatabase,
} from './todoDatabase';

export type TodoStore = {
  delete: (id: string) => Promise<void>;
  load: () => Promise<Todo[]>;
  replaceAll: (todos: Todo[]) => Promise<void>;
  search: (query: string) => Promise<Todo[]>;
  updateDone: (id: string, done: boolean) => Promise<void>;
  updateFilters: (id: string, filters: Todo['filters']) => Promise<void>;
  upsert: (todo: Todo) => Promise<void>;
  upsertMany: (todos: Todo[]) => Promise<void>;
};

export const localTodoStore: TodoStore = {
  delete: deleteTodoFromDatabase,
  load: loadTodosFromDatabase,
  replaceAll: replaceAllTodosInDatabase,
  search: searchTodosInDatabase,
  updateDone: updateTodoDoneInDatabase,
  updateFilters: updateTodoFiltersInDatabase,
  upsert: upsertTodoInDatabase,
  upsertMany: upsertTodosInDatabase,
};
