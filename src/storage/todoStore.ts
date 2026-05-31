import { type Todo } from '../todos';
import { loadTodosFromDatabase, saveTodosToDatabase } from './todoDatabase';

export type TodoStore = {
  load: () => Promise<Todo[]>;
  save: (todos: Todo[]) => Promise<void>;
};

export const localTodoStore: TodoStore = {
  load: loadTodosFromDatabase,
  save: saveTodosToDatabase,
};
