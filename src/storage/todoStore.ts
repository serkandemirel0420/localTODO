import { type Todo } from '../todos';
import {
  deleteTodoFromDatabase,
  hasInitialSeededTodos,
  loadTodosFromDatabase,
  markInitialTodosSeeded,
  replaceAllTodosInDatabase,
  searchTodosInDatabase,
  updateTodoDoneInDatabase,
  updateTodoFiltersInDatabase,
  upsertTodoInDatabase,
  upsertTodosInDatabase,
} from './todoDatabase';

export type TodoStore = {
  delete: (id: string) => Promise<void>;
  hasInitialSeeded: () => Promise<boolean>;
  load: () => Promise<Todo[]>;
  markInitialSeeded: () => Promise<void>;
  replaceAll: (todos: Todo[]) => Promise<void>;
  search: (query: string) => Promise<Todo[]>;
  updateDone: (id: string, done: boolean) => Promise<void>;
  updateFilters: (id: string, filters: Todo['filters']) => Promise<void>;
  upsert: (todo: Todo) => Promise<void>;
  upsertMany: (todos: Todo[]) => Promise<void>;
};

export const localTodoStore: TodoStore = {
  delete: deleteTodoFromDatabase,
  hasInitialSeeded: hasInitialSeededTodos,
  load: loadTodosFromDatabase,
  markInitialSeeded: markInitialTodosSeeded,
  replaceAll: replaceAllTodosInDatabase,
  search: searchTodosInDatabase,
  updateDone: updateTodoDoneInDatabase,
  updateFilters: updateTodoFiltersInDatabase,
  upsert: upsertTodoInDatabase,
  upsertMany: upsertTodosInDatabase,
};
