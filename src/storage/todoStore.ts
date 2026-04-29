import AsyncStorage from '@react-native-async-storage/async-storage';

import { isTodo, type Todo } from '../todos';

const STORAGE_KEY = 'local-todo.items.v1';

export type TodoStore = {
  load: () => Promise<Todo[]>;
  save: (todos: Todo[]) => Promise<void>;
};

export const localTodoStore: TodoStore = {
  async load() {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isTodo) : [];
  },

  async save(todos) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  },
};
