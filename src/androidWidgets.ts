import { NativeModules, Platform } from 'react-native';

import { resolveDateFilterValueDate, toISODateString } from './dates';
import { getEffectiveTodoDateLabels } from './todoDates';
import { type Todo } from './todos';

export type AndroidWidgetItem = {
  id: string;
  title: string;
  dateKeys: string[];
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
};

type LocalTodoWidgetNativeModule = {
  syncItems: (items: AndroidWidgetItem[]) => Promise<boolean>;
};

const localTodoWidget = NativeModules.LocalTodoWidget as
  | LocalTodoWidgetNativeModule
  | undefined;

export const buildAndroidWidgetItems = (
  todos: Todo[],
  pendingDeleteIds: Set<string>,
  now = new Date(),
): AndroidWidgetItem[] => (
  todos
    .filter((todo) => !todo.done && !pendingDeleteIds.has(todo.id))
    .map((todo) => {
      const dateKeys = Array.from(new Set(
        getEffectiveTodoDateLabels(todo, now)
          .map((label) => resolveDateFilterValueDate(label, now, todo.createdAt))
          .filter((date): date is Date => Boolean(date))
          .map(toISODateString),
      ));

      return {
        id: todo.id,
        title: todo.text,
        dateKeys,
        pinned: todo.pinned,
        createdAt: todo.createdAt,
        updatedAt: todo.updatedAt,
      };
    })
    .sort((first, second) => (
      Number(second.pinned) - Number(first.pinned)
      || second.updatedAt - first.updatedAt
      || second.createdAt - first.createdAt
    ))
);

export const syncAndroidWidgets = async (items: AndroidWidgetItem[]) => {
  if (Platform.OS !== 'android' || !localTodoWidget) {
    return false;
  }

  return localTodoWidget.syncItems(items);
};

export type AndroidWidgetRoute =
  | { kind: 'new-item' }
  | { kind: 'latest'; todoId: string }
  | { kind: 'today'; todoId: string | null };

export const parseAndroidWidgetRoute = (url: string): AndroidWidgetRoute | null => {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname !== 'widget') {
      return null;
    }

    if (parsedUrl.pathname === '/new-item') {
      return { kind: 'new-item' };
    }

    if (parsedUrl.pathname === '/latest') {
      const todoId = parsedUrl.searchParams.get('id');
      if (!todoId) {
        return null;
      }

      return {
        kind: 'latest',
        todoId,
      };
    }

    if (parsedUrl.pathname === '/today') {
      return {
        kind: 'today',
        todoId: parsedUrl.searchParams.get('id'),
      };
    }
  } catch {
    return null;
  }

  return null;
};
