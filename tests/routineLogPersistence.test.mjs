import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

// Exercise the production storage functions against SQLite, with Expo's async
// interface adapted to Node and an isolated database (no Firebase or user data).
function loadStorage(db) {
  const cache = new Map();
  const adapter = {
    execAsync: async sql => db.exec(sql),
    runAsync: async (sql, params = []) => db.prepare(sql).run(...params),
    getAllAsync: async (sql, params = []) => db.prepare(sql).all(...params),
    getFirstAsync: async (sql, params = []) => db.prepare(sql).get(...params),
    withTransactionAsync: async action => {
      db.exec('BEGIN');
      try { await action(); db.exec('COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
  function load(path) {
    if (cache.has(path)) return cache.get(path);
    const module = { exports: {} };
    cache.set(path, module.exports);
    const code = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const require = name => {
      if (name === 'expo-sqlite') return { openDatabaseAsync: async () => adapter };
      if (name === '@react-native-async-storage/async-storage') return { getItem: async () => null, removeItem: async () => {} };
      if (name.startsWith('.')) return load(resolve(dirname(path), `${name}.ts`));
      throw new Error(`Unexpected dependency: ${name}`);
    };
    new Function('require', 'module', 'exports', code)(require, module, module.exports);
    return module.exports;
  }
  return { storage: load(resolve('src/storage/todoDatabase.ts')), todos: load(resolve('src/todos.ts')) };
}

test('existing database migration, save, reload, search and backup restore preserve routine logs', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE todos (
    id TEXT PRIMARY KEY NOT NULL, content TEXT NOT NULL DEFAULT '', content_search TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]', tags_search TEXT NOT NULL DEFAULT '', text TEXT NOT NULL,
    text_search TEXT NOT NULL DEFAULT '', done INTEGER NOT NULL, pinned INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0, filters_json TEXT NOT NULL
  );`);
  const { storage, todos } = loadStorage(db);
  assert.deepEqual(await storage.loadTodosFromDatabase(), []);
  const routine = todos.normalizeTodo({ id: 'test-routine', text: 'Test routine', done: false, createdAt: 1, filters: {},
    routineLogs: [{ id: 'first', text: 'First entry', createdAt: 10 }, { id: 'second', text: 'Second entry', createdAt: 20 }] });
  await storage.upsertTodoInDatabase(routine);
  assert.deepEqual((await storage.loadTodosFromDatabase())[0].routineLogs, routine.routineLogs);
  assert.deepEqual((await storage.searchTodosInDatabase('Test routine'))[0].routineLogs, routine.routineLogs);
  await storage.updateTodoFiltersInDatabase(routine.id, routine.filters, 30);
  await storage.updateTodoDoneInDatabase(routine.id, true, 40);
  assert.deepEqual((await storage.loadTodosFromDatabase())[0].routineLogs, routine.routineLogs);
  const restored = todos.normalizeTodo(JSON.parse(JSON.stringify(todos.cloneTodo(routine))));
  await storage.replaceAllTodosInDatabase([restored]);
  assert.deepEqual((await storage.loadTodosFromDatabase())[0].routineLogs, routine.routineLogs);
  await storage.upsertTodosInDatabase([{ ...restored, text: 'Renamed routine' }]);
  assert.deepEqual((await storage.loadTodosFromDatabase())[0].routineLogs, routine.routineLogs);
  const afterDelete = { ...restored, routineLogs: restored.routineLogs.filter(log => log.id !== 'first') };
  await storage.upsertTodoInDatabase(afterDelete);
  assert.deepEqual((await storage.loadTodosFromDatabase())[0].routineLogs.map(log => log.id), ['second']);
  // Undo/restore can recover a swiped-away log from the original snapshot.
  await storage.replaceAllTodosInDatabase([restored]);
  assert.deepEqual((await storage.loadTodosFromDatabase())[0].routineLogs, routine.routineLogs);
  // Editing a historical note preserves its identity, timestamp and position;
  // reload and backup import retain the change, and undo restores the old text.
  const edited = todos.touchTodo({
    ...restored,
    routineLogs: restored.routineLogs.map(log => log.id === 'first'
      ? { ...log, text: 'Edited first note\nwith a second line' }
      : log),
  });
  await storage.upsertTodoInDatabase(edited);
  const reloadedEdit = (await storage.loadTodosFromDatabase())[0];
  assert.deepEqual(reloadedEdit.routineLogs.map(log => [log.id, log.createdAt]), [['second', 20], ['first', 10]]);
  assert.equal(reloadedEdit.routineLogs[1].text, 'Edited first note\nwith a second line');
  assert.equal(reloadedEdit.routineLogs[0].text, 'Second entry');
  await storage.replaceAllTodosInDatabase([todos.normalizeTodo(JSON.parse(JSON.stringify(edited)))]);
  assert.deepEqual((await storage.loadTodosFromDatabase())[0].routineLogs, edited.routineLogs);
  await storage.replaceAllTodosInDatabase([restored]);
  assert.deepEqual((await storage.loadTodosFromDatabase())[0].routineLogs, restored.routineLogs);
  db.close();
});
