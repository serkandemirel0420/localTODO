import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';

import { normalizeTodo, type Todo } from '../todos';

const LEGACY_STORAGE_KEY = 'local-todo.items.v1';
const DATABASE_NAME = 'local-todo.db';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

const getDatabase = () => {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (database) => {
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;

        CREATE TABLE IF NOT EXISTS todos (
          id TEXT PRIMARY KEY NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          text TEXT NOT NULL,
          done INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          filters_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_todos_done ON todos(done);
      `);

      const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(todos)');
      const hasContentColumn = columns.some((column) => column.name === 'content');

      if (!hasContentColumn) {
        await database.execAsync("ALTER TABLE todos ADD COLUMN content TEXT NOT NULL DEFAULT '';");
      }

      return database;
    });
  }

  return databasePromise;
};

const rowToTodo = (row: {
  content: string;
  id: string;
  text: string;
  done: number;
  created_at: number;
  filters_json: string;
}): Todo | null => {
  let filters: unknown = {};

  try {
    filters = JSON.parse(row.filters_json);
  } catch {
    filters = {};
  }

  return normalizeTodo({
    id: row.id,
    content: row.content,
    text: row.text,
    done: Boolean(row.done),
    createdAt: row.created_at,
    filters,
  });
};

const migrateLegacyAsyncStorage = async (database: SQLite.SQLiteDatabase) => {
  const countRow = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM todos',
  );

  if ((countRow?.count ?? 0) > 0) {
    return;
  }

  const legacyPayload = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);

  if (!legacyPayload) {
    return;
  }

  const parsed = JSON.parse(legacyPayload) as unknown;
  const todos = Array.isArray(parsed)
    ? parsed.map(normalizeTodo).filter((todo): todo is Todo => Boolean(todo))
    : [];

  if (todos.length === 0) {
    return;
  }

  await replaceAllTodos(database, todos);
  await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
};

export const loadTodosFromDatabase = async (): Promise<Todo[]> => {
  const database = await getDatabase();
  await migrateLegacyAsyncStorage(database);

  const rows = await database.getAllAsync<{
    content: string;
    id: string;
    text: string;
    done: number;
    created_at: number;
    filters_json: string;
  }>('SELECT id, content, text, done, created_at, filters_json FROM todos ORDER BY created_at DESC');

  return rows
    .map(rowToTodo)
    .filter((todo): todo is Todo => Boolean(todo));
};

const replaceAllTodos = async (
  database: SQLite.SQLiteDatabase,
  todos: Todo[],
) => {
  await database.withTransactionAsync(async () => {
    await database.runAsync('DELETE FROM todos');

    for (const todo of todos) {
      await database.runAsync(
        `INSERT INTO todos (id, content, text, done, created_at, filters_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          todo.id,
          todo.content,
          todo.text,
          todo.done ? 1 : 0,
          todo.createdAt,
          JSON.stringify(todo.filters),
        ],
      );
    }
  });
};

export const saveTodosToDatabase = async (todos: Todo[]) => {
  const database = await getDatabase();
  await replaceAllTodos(database, todos);
};
