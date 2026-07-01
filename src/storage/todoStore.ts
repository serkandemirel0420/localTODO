import { type Todo } from '../todos';
import {
  queueFirebaseTodoDelete,
  queueFirebaseTodoDoneUpdate,
  queueFirebaseTodoFiltersUpdate,
  queueFirebaseTodoUpsert,
  queueFirebaseTodosReplaceAll,
  queueFirebaseTodosUpsertMany,
} from '../firebase/firebaseRemoteStore';
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
  replaceAllLocal: (todos: Todo[]) => Promise<void>;
  search: (query: string) => Promise<Todo[]>;
  updateDone: (id: string, done: boolean) => Promise<void>;
  updateFilters: (id: string, filters: Todo['filters']) => Promise<void>;
  upsert: (todo: Todo) => Promise<void>;
  upsertMany: (todos: Todo[]) => Promise<void>;
};

export const localTodoStore: TodoStore = {
  async delete(id) {
    await deleteTodoFromDatabase(id);
    queueFirebaseTodoDelete(id).catch(() => undefined);
  },
  load: loadTodosFromDatabase,
  async replaceAll(todos) {
    await replaceAllTodosInDatabase(todos);
    queueFirebaseTodosReplaceAll(todos).catch(() => undefined);
  },
  replaceAllLocal: replaceAllTodosInDatabase,
  search: searchTodosInDatabase,
  async updateDone(id, done) {
    await updateTodoDoneInDatabase(id, done);
    queueFirebaseTodoDoneUpdate(id, done).catch(() => undefined);
  },
  async updateFilters(id, filters) {
    await updateTodoFiltersInDatabase(id, filters);
    queueFirebaseTodoFiltersUpdate(id, filters).catch(() => undefined);
  },
  async upsert(todo) {
    await upsertTodoInDatabase(todo);
    queueFirebaseTodoUpsert(todo).catch(() => undefined);
  },
  async upsertMany(todos) {
    await upsertTodosInDatabase(todos);
    queueFirebaseTodosUpsertMany(todos).catch(() => undefined);
  },
};
