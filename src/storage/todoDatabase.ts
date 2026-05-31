import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';

import { normalizeTodo, type Todo } from '../todos';

const LEGACY_STORAGE_KEY = 'local-todo.items.v1';
const INITIAL_SEED_STORAGE_KEY = 'local-todo.initial-seed.v1';
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

      await ensureTodoSearchTable(database);
      await rebuildTodoSearchIndexIfNeeded(database);

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

const ensureTodoSearchTable = async (database: SQLite.SQLiteDatabase) => {
  const existing = await database.getFirstAsync<{ sql: string | null }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'todos_fts'",
  );

  if (existing) {
    return;
  }

  try {
    await database.execAsync(`
      CREATE VIRTUAL TABLE todos_fts USING fts5(
        id UNINDEXED,
        text,
        content,
        tokenize = 'unicode61 remove_diacritics 2'
      );
    `);
  } catch {
    await database.execAsync(`
      CREATE VIRTUAL TABLE todos_fts USING fts4(
        id,
        text,
        content,
        tokenize=unicode61,
        notindexed=id
      );
    `);
  }
};

const rebuildTodoSearchIndex = async (database: SQLite.SQLiteDatabase) => {
  await database.withTransactionAsync(async () => {
    await database.runAsync('DELETE FROM todos_fts');
    await database.runAsync(
      'INSERT INTO todos_fts (id, text, content) SELECT id, text, content FROM todos',
    );
  });
};

const rebuildTodoSearchIndexIfNeeded = async (database: SQLite.SQLiteDatabase) => {
  const todoCountRow = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM todos',
  );
  const searchCountRow = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM todos_fts',
  );

  if ((todoCountRow?.count ?? 0) !== (searchCountRow?.count ?? 0)) {
    await rebuildTodoSearchIndex(database);
  }
};

const replaceTodoSearchRow = async (
  database: SQLite.SQLiteDatabase,
  todo: Todo,
) => {
  await database.runAsync('DELETE FROM todos_fts WHERE id = ?', [todo.id]);
  await database.runAsync(
    'INSERT INTO todos_fts (id, text, content) VALUES (?, ?, ?)',
    [todo.id, todo.text, todo.content],
  );
};

const createFtsQuery = (query: string) => {
  const normalizedQuery = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();
  const terms = normalizedQuery.match(/[\p{L}\p{N}_]+/gu) ?? [];

  if (terms.length === 0) {
    return '';
  }

  return terms.map((term) => `${term}*`).join(' ');
};

export const loadTodosFromDatabase = async (): Promise<Todo[]> => {
  const database = await getDatabase();
  await migrateLegacyAsyncStorage(database);
  await rebuildTodoSearchIndexIfNeeded(database);

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

export const searchTodosInDatabase = async (query: string): Promise<Todo[]> => {
  const database = await getDatabase();
  await migrateLegacyAsyncStorage(database);
  await rebuildTodoSearchIndexIfNeeded(database);

  const ftsQuery = createFtsQuery(query);

  if (!ftsQuery) {
    return loadTodosFromDatabase();
  }

  const rows = await database.getAllAsync<{
    content: string;
    id: string;
    text: string;
    done: number;
    created_at: number;
    filters_json: string;
  }>(
    `SELECT todos.id, todos.content, todos.text, todos.done, todos.created_at, todos.filters_json
     FROM todos_fts
     JOIN todos ON todos.id = todos_fts.id
     WHERE todos_fts MATCH ?
     ORDER BY todos.created_at DESC`,
    [ftsQuery],
  );

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
    await database.runAsync('DELETE FROM todos_fts');

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
      await database.runAsync(
        'INSERT INTO todos_fts (id, text, content) VALUES (?, ?, ?)',
        [todo.id, todo.text, todo.content],
      );
    }
  });
};

export const saveTodosToDatabase = async (todos: Todo[]) => {
  const database = await getDatabase();
  await replaceAllTodos(database, todos);
};

export const replaceAllTodosInDatabase = saveTodosToDatabase;

export const upsertTodoInDatabase = async (todo: Todo) => {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `INSERT INTO todos (id, content, text, done, created_at, filters_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         content = excluded.content,
         text = excluded.text,
         done = excluded.done,
         created_at = excluded.created_at,
         filters_json = excluded.filters_json`,
      [
        todo.id,
        todo.content,
        todo.text,
        todo.done ? 1 : 0,
        todo.createdAt,
        JSON.stringify(todo.filters),
      ],
    );
    await replaceTodoSearchRow(database, todo);
  });
};

export const upsertTodosInDatabase = async (todos: Todo[]) => {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    for (const todo of todos) {
      await database.runAsync(
        `INSERT INTO todos (id, content, text, done, created_at, filters_json)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           content = excluded.content,
           text = excluded.text,
           done = excluded.done,
           created_at = excluded.created_at,
           filters_json = excluded.filters_json`,
        [
          todo.id,
          todo.content,
          todo.text,
          todo.done ? 1 : 0,
          todo.createdAt,
          JSON.stringify(todo.filters),
        ],
      );
      await replaceTodoSearchRow(database, todo);
    }
  });
};

export const updateTodoDoneInDatabase = async (id: string, done: boolean) => {
  const database = await getDatabase();
  await database.runAsync('UPDATE todos SET done = ? WHERE id = ?', [done ? 1 : 0, id]);
};

export const updateTodoFiltersInDatabase = async (
  id: string,
  filters: Todo['filters'],
) => {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE todos SET filters_json = ? WHERE id = ?',
    [JSON.stringify(filters), id],
  );
};

export const deleteTodoFromDatabase = async (id: string) => {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.runAsync('DELETE FROM todos_fts WHERE id = ?', [id]);
    await database.runAsync('DELETE FROM todos WHERE id = ?', [id]);
  });
};

export const hasInitialSeededTodos = async () =>
  (await AsyncStorage.getItem(INITIAL_SEED_STORAGE_KEY)) === 'true';

export const markInitialTodosSeeded = async () => {
  await AsyncStorage.setItem(INITIAL_SEED_STORAGE_KEY, 'true');
};
