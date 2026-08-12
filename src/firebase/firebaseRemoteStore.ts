import {
  collection,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';

import {
  cloneTodo,
  normalizeTodo,
  type Todo,
} from '../todos';
import {
  cleanDevTestListMenuTree,
  countDevTestListMenuNodes,
  isDevTestMenuPreset,
  isDevTestTodo,
} from '../dev/seedTestTodos';
import {
  normalizeAppSettings,
  type AppSettings,
} from '../storage/appSettingsStore';
import {
  normalizeNotificationLogEntries,
  type NotificationLogEntry,
} from '../storage/notificationLogStore';
import {
  getLocalTodoFirebaseDataUserId,
  getLocalTodoFirestore,
  hasLocalTodoFirebaseDataUserId,
  isFirebaseConfigured,
} from './localTodoFirebase';
import {
  loadFirebaseSyncMeta,
  markLocalFirebaseChange,
  markRemoteFirebaseRead,
  markRemoteFirebaseWrite,
} from './firebaseSyncMetaStore';

const FIREBASE_SCHEMA_VERSION = 2;
const FIREBASE_WRITE_RETRY_BASE_DELAY_MS = 1000;
const FIREBASE_WRITE_RETRY_MAX_DELAY_MS = 30000;

type FirebaseRemoteMeta = {
  schemaVersion: number;
  updatedAt: number;
};

export type FirebaseAppDataSnapshot = {
  notificationLogEntries: NotificationLogEntry[];
  settings: AppSettings;
  todos: Todo[];
};

export type FirebaseAppDataSyncResult =
  | {
      status: 'disabled';
    }
  | {
      firebaseUserId: string;
      remoteUpdatedAt: number;
      reason: 'local-pending' | 'remote-unchanged';
      status: 'skipped';
    }
  | {
      firebaseUserId: string;
      remoteUpdatedAt: number;
      snapshot: FirebaseAppDataSnapshot;
      status: 'loaded-remote' | 'uploaded-local';
    };

export type FirebaseSettingsPullResult =
  | {
      reason: 'firebase-disabled' | 'no-remote-settings';
      status: 'skipped';
    }
  | {
      firebaseUserId: string;
      savedAt: number;
      settings: AppSettings;
      status: 'loaded-remote';
    };

export type FirebaseTodosPullResult =
  | {
      reason?: 'local-pending' | 'no-remote-data';
      status: 'skipped';
    }
  | {
      firebaseUserId: string;
      remoteUpdatedAt: number;
      status: 'loaded-remote';
      todos: Todo[];
    };

let firebaseWriteQueue = Promise.resolve();
let firebaseWritesEnabled = false;

const waitForFirebaseWriteRetry = (attempt: number) => (
  new Promise((resolve) => {
    const delay = Math.min(
      FIREBASE_WRITE_RETRY_MAX_DELAY_MS,
      FIREBASE_WRITE_RETRY_BASE_DELAY_MS * (2 ** Math.min(attempt, 5)),
    );

    setTimeout(resolve, delay);
  })
);

const runFirebaseWriteUntilSynced = async (write: () => Promise<void>) => {
  let attempt = 0;

  for (;;) {
    try {
      await write();
      return;
    } catch {
      await waitForFirebaseWriteRetry(attempt);
      attempt += 1;
    }
  }
};

const toFirestoreJson = <T,>(value: T): T => (
  JSON.parse(JSON.stringify(value)) as T
);

const firebaseHistoryEntryHasDevTestData = (entry: AppSettings['history']['undo'][number]) => (
  entry.snapshot.todos.some(isDevTestTodo) ||
  entry.snapshot.deletedTodos.some(isDevTestTodo) ||
  entry.snapshot.menuPresets.some(isDevTestMenuPreset) ||
  countDevTestListMenuNodes(entry.snapshot.listMenuTree) > 0
);

const sanitizeFirebaseSettings = (settings: AppSettings) => {
  const normalized = normalizeAppSettings(settings);

  return {
    ...normalized,
    deletedTodos: normalized.deletedTodos.filter((todo) => !isDevTestTodo(todo)),
    history: {
      redo: normalized.history.redo.filter((entry) => !firebaseHistoryEntryHasDevTestData(entry)),
      undo: normalized.history.undo.filter((entry) => !firebaseHistoryEntryHasDevTestData(entry)),
    },
    listMenuTree: cleanDevTestListMenuTree(normalized.listMenuTree),
    menuPresets: normalized.menuPresets.filter((preset) => !isDevTestMenuPreset(preset)),
  };
};

const createFirebaseSettingsDocument = (
  settings: AppSettings,
  settingsUpdatedAt = Date.now(),
) => ({
  ...toFirestoreJson(sanitizeFirebaseSettings(settings)),
  schemaVersion: FIREBASE_SCHEMA_VERSION,
  settingsUpdatedAt,
  settingsUpdatedAtIso: new Date(settingsUpdatedAt).toISOString(),
});

const sanitizeFirebaseTodos = (todos: Todo[]) => (
  todos.filter((todo) => !isDevTestTodo(todo))
);

const todoDocumentId = (id: string) => encodeURIComponent(id);

const userDocRef = (database: Firestore, userId: string) =>
  doc(database, 'users', userId);

const todosCollectionRef = (database: Firestore, userId: string) =>
  collection(userDocRef(database, userId), 'todos');

const metaDocRef = (database: Firestore, userId: string, id: string) =>
  doc(userDocRef(database, userId), 'meta', id);

const syncMetaDocRef = (database: Firestore, userId: string) =>
  metaDocRef(database, userId, 'sync');

const settingsDocRef = (database: Firestore, userId: string) =>
  metaDocRef(database, userId, 'settings');

const notificationLogDocRef = (database: Firestore, userId: string) =>
  metaDocRef(database, userId, 'notificationLog');

const todosSnapshotDocRef = (database: Firestore, userId: string) =>
  metaDocRef(database, userId, 'todosSnapshot');

const touchRemoteMeta = async (
  database: Firestore,
  userId: string,
  reason: string,
  localChangeSyncedAt = 0,
) => {
  const updatedAt = Date.now();

  await setDoc(
    syncMetaDocRef(database, userId),
    {
      reason,
      schemaVersion: FIREBASE_SCHEMA_VERSION,
      updatedAt,
      updatedAtIso: new Date(updatedAt).toISOString(),
    },
    { merge: true },
  );
  await markRemoteFirebaseWrite(userId, updatedAt, localChangeSyncedAt);

  return updatedAt;
};

export const setFirebaseRemoteWritesEnabled = (enabled: boolean) => {
  firebaseWritesEnabled = enabled;
};

const enqueueFirebaseWrite = (write: (localChangeAt: number) => Promise<void>) => {
  // Startup hydration also writes the downloaded snapshot into local stores.
  // Ignore those persistence calls while initial sync owns the state; replaying
  // them later can overwrite a newer remote snapshot with stale startup data.
  if (!firebaseWritesEnabled || !isFirebaseConfigured()) {
    return Promise.resolve();
  }

  const localChangeMarked = markLocalFirebaseChange();
  firebaseWriteQueue = firebaseWriteQueue
    .then(async () => {
      const syncMeta = await localChangeMarked;

      await runFirebaseWriteUntilSynced(() => write(syncMeta.lastLocalChangeAt));
    })
    .catch(() => undefined);

  return firebaseWriteQueue;
};

const enqueueFirebaseBackupWrite = (write: () => Promise<void>) => {
  if (!firebaseWritesEnabled || !isFirebaseConfigured()) {
    return Promise.resolve();
  }

  firebaseWriteQueue = firebaseWriteQueue
    .then(() => runFirebaseWriteUntilSynced(write))
    .catch(() => undefined);

  return firebaseWriteQueue;
};

const toTodoSnapshotMap = (todos: Todo[]) => Object.fromEntries(
  todos.map((todo) => [todoDocumentId(todo.id), toFirestoreJson(cloneTodo(todo))]),
);

const normalizeTodosSnapshot = (data: DocumentData | undefined) => {
  if (!data || typeof data.todos !== 'object' || data.todos === null) {
    return null;
  }

  return Object.values(data.todos as Record<string, unknown>)
    .map(normalizeTodo)
    .filter((todo): todo is Todo => Boolean(todo))
    .filter((todo) => !isDevTestTodo(todo));
};

const writeTodosSnapshotForUser = async (
  database: Firestore,
  userId: string,
  todos: Todo[],
) => {
  await setDoc(
    todosSnapshotDocRef(database, userId),
    {
      schemaVersion: FIREBASE_SCHEMA_VERSION,
      todos: toTodoSnapshotMap(todos),
    },
    { merge: false },
  );
};

const writeFirebaseAppDataSnapshotForUser = async (
  userId: string,
  snapshot: FirebaseAppDataSnapshot,
  reason: string,
  localChangeSyncedAt = 0,
) => {
  const database = getLocalTodoFirestore();

  await writeTodosSnapshotForUser(database, userId, sanitizeFirebaseTodos(snapshot.todos));
  await setDoc(
    notificationLogDocRef(database, userId),
    {
      entries: toFirestoreJson(normalizeNotificationLogEntries(snapshot.notificationLogEntries)),
      schemaVersion: FIREBASE_SCHEMA_VERSION,
    },
    { merge: false },
  );
  return touchRemoteMeta(database, userId, reason, localChangeSyncedAt);
};

const normalizeRemoteMeta = (data: DocumentData | undefined): FirebaseRemoteMeta | null => {
  if (!data) {
    return null;
  }

  const updatedAt = typeof data.updatedAt === 'number' && Number.isFinite(data.updatedAt)
    ? data.updatedAt
    : 0;

  return {
    schemaVersion: typeof data.schemaVersion === 'number' ? data.schemaVersion : 0,
    updatedAt,
  };
};

const loadFirebaseRemoteMetaForUser = async (userId: string) => {
  const database = getLocalTodoFirestore();
  const syncMetaSnapshot = await getDoc(syncMetaDocRef(database, userId));
  return normalizeRemoteMeta(syncMetaSnapshot.data());
};

const loadFirebaseAppDataForUser = async (
  userId: string,
  localSettings: AppSettings,
  knownMeta?: FirebaseRemoteMeta | null,
): Promise<{
  meta: FirebaseRemoteMeta | null;
  snapshot: FirebaseAppDataSnapshot;
}> => {
  const database = getLocalTodoFirestore();
  const [
    compactTodosSnapshot,
    notificationLogSnapshot,
  ] = await Promise.all([
    getDoc(todosSnapshotDocRef(database, userId)),
    getDoc(notificationLogDocRef(database, userId)),
  ]);
  const compactTodos = compactTodosSnapshot.exists()
    ? normalizeTodosSnapshot(compactTodosSnapshot.data())
    : null;
  const legacyTodosSnapshot = compactTodos === null
    ? await getDocs(todosCollectionRef(database, userId))
    : null;
  const todos = (compactTodos ?? legacyTodosSnapshot?.docs
    .map((todoSnapshot) => normalizeTodo(todoSnapshot.data()))
    .filter((todo): todo is Todo => Boolean(todo))
    .filter((todo) => !isDevTestTodo(todo)) ?? [])
    .sort((first, second) =>
      Number(second.pinned) - Number(first.pinned) ||
      second.updatedAt - first.updatedAt ||
      second.createdAt - first.createdAt
    );
  const notificationLogData = notificationLogSnapshot.data();

  return {
    meta: knownMeta ?? await loadFirebaseRemoteMetaForUser(userId),
    snapshot: {
      notificationLogEntries: normalizeNotificationLogEntries(notificationLogData?.entries),
      settings: sanitizeFirebaseSettings(localSettings),
      todos,
    },
  };
};

const loadFirebaseTodosForUser = async (
  userId: string,
): Promise<{
  meta: FirebaseRemoteMeta | null;
  todos: Todo[];
}> => {
  const database = getLocalTodoFirestore();
  const [
    compactTodosSnapshot,
    syncMetaSnapshot,
  ] = await Promise.all([
    getDoc(todosSnapshotDocRef(database, userId)),
    getDoc(syncMetaDocRef(database, userId)),
  ]);
  const compactTodos = compactTodosSnapshot.exists()
    ? normalizeTodosSnapshot(compactTodosSnapshot.data())
    : null;
  const legacyTodosSnapshot = compactTodos === null
    ? await getDocs(todosCollectionRef(database, userId))
    : null;
  const todos = compactTodos ?? legacyTodosSnapshot?.docs
    .map((todoSnapshot) => normalizeTodo(todoSnapshot.data()))
    .filter((todo): todo is Todo => Boolean(todo))
    .filter((todo) => !isDevTestTodo(todo)) ?? [];

  return {
    meta: normalizeRemoteMeta(syncMetaSnapshot.data()),
    todos: sortTodos(todos),
  };
};

const localSnapshotHasUserData = (snapshot: FirebaseAppDataSnapshot) => (
  snapshot.todos.length > 0 ||
  snapshot.notificationLogEntries.length > 0
);

const sortTodos = (todos: Todo[]) => (
  todos.sort((first, second) =>
    Number(second.pinned) - Number(first.pinned) ||
    second.updatedAt - first.updatedAt ||
    second.createdAt - first.createdAt
  )
);

const mergeTodos = (remoteTodos: Todo[], localTodos: Todo[]) => {
  const todosById = new Map<string, Todo>();

  remoteTodos.map(cloneTodo).forEach((todo) => {
    todosById.set(todo.id, todo);
  });
  localTodos.map(cloneTodo).forEach((todo) => {
    todosById.set(todo.id, todo);
  });

  return sortTodos(Array.from(todosById.values()));
};

const mergeAppDataSnapshots = (
  remoteSnapshot: FirebaseAppDataSnapshot,
  localSnapshot: FirebaseAppDataSnapshot,
): FirebaseAppDataSnapshot => {
  return {
    notificationLogEntries: normalizeNotificationLogEntries([
      ...localSnapshot.notificationLogEntries,
      ...remoteSnapshot.notificationLogEntries,
    ]),
    settings: normalizeAppSettings(localSnapshot.settings),
    todos: mergeTodos(remoteSnapshot.todos, localSnapshot.todos),
  };
};

const mergeTodosSnapshotFields = async (
  database: Firestore,
  userId: string,
  todos: Record<string, unknown>,
  todoFieldPaths: FieldPath[],
) => {
  await setDoc(
    todosSnapshotDocRef(database, userId),
    {
      schemaVersion: FIREBASE_SCHEMA_VERSION,
      todos,
    },
    {
      mergeFields: [
        'schemaVersion',
        ...todoFieldPaths,
      ],
    },
  );
};

export const queueFirebaseTodoUpsert = (todo: Todo) => {
  if (isDevTestTodo(todo)) {
    return Promise.resolve();
  }

  return enqueueFirebaseWrite(async (localChangeAt) => {
    const userId = await getLocalTodoFirebaseDataUserId();
    const database = getLocalTodoFirestore();
    const todoKey = todoDocumentId(todo.id);

    await updateDoc(
      todosSnapshotDocRef(database, userId),
      new FieldPath('todos', todoKey),
      toFirestoreJson(cloneTodo(todo)),
      'schemaVersion',
      FIREBASE_SCHEMA_VERSION,
    );
    await touchRemoteMeta(database, userId, 'todo-upsert', localChangeAt);
  });
};

export const queueFirebaseTodoDelete = (id: string) => (
  enqueueFirebaseWrite(async (localChangeAt) => {
    const userId = await getLocalTodoFirebaseDataUserId();
    const database = getLocalTodoFirestore();
    const todoKey = todoDocumentId(id);

    await updateDoc(
      todosSnapshotDocRef(database, userId),
      new FieldPath('todos', todoKey),
      deleteField(),
      'schemaVersion',
      FIREBASE_SCHEMA_VERSION,
    );
    await touchRemoteMeta(database, userId, 'todo-delete', localChangeAt);
  })
);

export const queueFirebaseTodoDoneUpdate = (
  id: string,
  done: boolean,
  updatedAt: number,
) => {
  if (id.startsWith('dev-test-')) {
    return Promise.resolve();
  }

  return enqueueFirebaseWrite(async (localChangeAt) => {
    const userId = await getLocalTodoFirebaseDataUserId();
    const database = getLocalTodoFirestore();
    const todoKey = todoDocumentId(id);

    await updateDoc(
      todosSnapshotDocRef(database, userId),
      new FieldPath('todos', todoKey, 'done'),
      done,
      new FieldPath('todos', todoKey, 'updatedAt'),
      updatedAt,
      'schemaVersion',
      FIREBASE_SCHEMA_VERSION,
    );
    await touchRemoteMeta(database, userId, 'todo-done', localChangeAt);
  });
};

export const queueFirebaseTodoFiltersUpdate = (
  id: string,
  filters: Todo['filters'],
  updatedAt: number,
) => {
  if (id.startsWith('dev-test-')) {
    return Promise.resolve();
  }

  return enqueueFirebaseWrite(async (localChangeAt) => {
    const userId = await getLocalTodoFirebaseDataUserId();
    const database = getLocalTodoFirestore();
    const todoKey = todoDocumentId(id);

    await updateDoc(
      todosSnapshotDocRef(database, userId),
      new FieldPath('todos', todoKey, 'filters'),
      toFirestoreJson(filters),
      new FieldPath('todos', todoKey, 'updatedAt'),
      updatedAt,
      'schemaVersion',
      FIREBASE_SCHEMA_VERSION,
    );
    await touchRemoteMeta(database, userId, 'todo-filters', localChangeAt);
  });
};

export const queueFirebaseTodosUpsertMany = (todos: Todo[]) => {
  const sanitizedTodos = sanitizeFirebaseTodos(todos);

  if (sanitizedTodos.length === 0) {
    return Promise.resolve();
  }

  return enqueueFirebaseWrite(async (localChangeAt) => {
    const userId = await getLocalTodoFirebaseDataUserId();
    const database = getLocalTodoFirestore();
    const todos = toTodoSnapshotMap(sanitizedTodos);

    await mergeTodosSnapshotFields(
      database,
      userId,
      todos,
      Object.keys(todos).map((todoKey) => new FieldPath('todos', todoKey)),
    );
    await touchRemoteMeta(database, userId, 'todos-upsert-many', localChangeAt);
  });
};

export const queueFirebaseTodosReplaceAll = (todos: Todo[]) => (
  enqueueFirebaseWrite(async (localChangeAt) => {
    const userId = await getLocalTodoFirebaseDataUserId();
    const database = getLocalTodoFirestore();

    await writeTodosSnapshotForUser(database, userId, sanitizeFirebaseTodos(todos));
    await touchRemoteMeta(database, userId, 'todos-replace-all', localChangeAt);
  })
);

export const queueFirebaseSettingsSave = (settings: AppSettings) => (
  enqueueFirebaseBackupWrite(async () => {
    const userId = await getLocalTodoFirebaseDataUserId();
    const database = getLocalTodoFirestore();

    await setDoc(
      settingsDocRef(database, userId),
      createFirebaseSettingsDocument(settings),
      { merge: false },
    );
  })
);

export const loadFirebaseSettingsFromBackend = async (): Promise<FirebaseSettingsPullResult> => {
  if (!isFirebaseConfigured()) {
    return { reason: 'firebase-disabled', status: 'skipped' };
  }

  const userId = await getLocalTodoFirebaseDataUserId();
  const database = getLocalTodoFirestore();
  const settingsSnapshot = await getDocFromServer(settingsDocRef(database, userId));

  if (!settingsSnapshot.exists()) {
    return { reason: 'no-remote-settings', status: 'skipped' };
  }

  const settingsData = settingsSnapshot.data();
  const settingsUpdatedAt = (
    typeof settingsData.settingsUpdatedAt === 'number' &&
    Number.isFinite(settingsData.settingsUpdatedAt)
  )
    ? settingsData.settingsUpdatedAt
    : 0;

  return {
    firebaseUserId: userId,
    savedAt: settingsUpdatedAt,
    settings: sanitizeFirebaseSettings(normalizeAppSettings(settingsData)),
    status: 'loaded-remote',
  };
};

export const queueFirebaseNotificationLogSave = (entries: NotificationLogEntry[]) => (
  enqueueFirebaseWrite(async (localChangeAt) => {
    const userId = await getLocalTodoFirebaseDataUserId();
    const database = getLocalTodoFirestore();

    await setDoc(
      notificationLogDocRef(database, userId),
      {
        entries: toFirestoreJson(normalizeNotificationLogEntries(entries)),
        schemaVersion: FIREBASE_SCHEMA_VERSION,
      },
      { merge: false },
    );
    await touchRemoteMeta(database, userId, 'notification-log-save', localChangeAt);
  })
);

export const syncFirebaseAppDataFromLocalSnapshot = async (
  localSnapshot: FirebaseAppDataSnapshot,
  options: { forceUploadLocal?: boolean } = {},
): Promise<FirebaseAppDataSyncResult> => {
  if (!isFirebaseConfigured()) {
    return { status: 'disabled' };
  }

  const userId = await getLocalTodoFirebaseDataUserId();
  const syncMeta = await loadFirebaseSyncMeta();
  const usesSharedDataProfile = hasLocalTodoFirebaseDataUserId();
  const remoteMeta = await loadFirebaseRemoteMetaForUser(userId);
  const remoteUpdatedAt = remoteMeta?.updatedAt ?? 0;

  if (options.forceUploadLocal && localSnapshotHasUserData(localSnapshot)) {
    const uploadedAt = await writeFirebaseAppDataSnapshotForUser(
      userId,
      localSnapshot,
      'trusted-local-recovery-sync',
      syncMeta.lastLocalChangeAt,
    );
    return {
      firebaseUserId: userId,
      remoteUpdatedAt: uploadedAt,
      snapshot: localSnapshot,
      status: 'uploaded-local',
    };
  }

  const lastKnownRemoteAt = Math.max(
    syncMeta.lastRemoteReadAt,
    syncMeta.lastRemoteWriteAt,
  );
  const localHasPendingChanges = (
    syncMeta.firebaseUserId === userId &&
    syncMeta.lastLocalChangeAt > syncMeta.lastLocalSyncedAt
  );
  const remoteUnchanged = (
    remoteMeta !== null &&
    remoteMeta.schemaVersion >= FIREBASE_SCHEMA_VERSION &&
    remoteUpdatedAt > 0 &&
    syncMeta.firebaseUserId === userId &&
    remoteUpdatedAt <= lastKnownRemoteAt &&
    !localHasPendingChanges
  );

  if (remoteUnchanged) {
    await markRemoteFirebaseRead(userId, remoteUpdatedAt);
    return {
      firebaseUserId: userId,
      reason: 'remote-unchanged',
      remoteUpdatedAt,
      status: 'skipped',
    };
  }

  if (localHasPendingChanges) {
    const uploadedAt = await writeFirebaseAppDataSnapshotForUser(
      userId,
      localSnapshot,
      'recover-pending-local-sync',
      syncMeta.lastLocalChangeAt,
    );
    return {
      firebaseUserId: userId,
      remoteUpdatedAt: uploadedAt,
      snapshot: localSnapshot,
      status: 'uploaded-local',
    };
  }

  const remote = await loadFirebaseAppDataForUser(
    userId,
    localSnapshot.settings,
    remoteMeta,
  );
  const loadedRemoteUpdatedAt = remote.meta?.updatedAt ?? remoteUpdatedAt;
  const remoteHasData = (
    remote.snapshot.todos.length > 0 ||
    remote.snapshot.notificationLogEntries.length > 0
  );
  const shouldMergeLocalIntoRemote = (
    !usesSharedDataProfile &&
    Boolean(syncMeta.firebaseUserId) &&
    syncMeta.firebaseUserId !== userId &&
    remoteHasData &&
    localSnapshotHasUserData(localSnapshot)
  );
  const shouldMergeSharedLocalIntoRemote = (
    usesSharedDataProfile &&
    remoteHasData &&
    localSnapshot.todos.length > remote.snapshot.todos.length
  );
  const shouldUploadLocal = (
    !remoteHasData &&
    localSnapshotHasUserData(localSnapshot)
  );

  if (shouldMergeLocalIntoRemote || shouldMergeSharedLocalIntoRemote) {
    const mergedSnapshot = mergeAppDataSnapshots(remote.snapshot, localSnapshot);
    const uploadedAt = await writeFirebaseAppDataSnapshotForUser(
      userId,
      mergedSnapshot,
      shouldMergeSharedLocalIntoRemote
        ? 'merge-shared-local-remote-sync'
        : 'merge-local-remote-sync',
      syncMeta.lastLocalChangeAt,
    );
    return {
      firebaseUserId: userId,
      remoteUpdatedAt: uploadedAt,
      snapshot: mergedSnapshot,
      status: 'uploaded-local',
    };
  }

  if (shouldUploadLocal) {
    const uploadedAt = await writeFirebaseAppDataSnapshotForUser(
      userId,
      localSnapshot,
      'initial-local-sync',
      syncMeta.lastLocalChangeAt,
    );
    return {
      firebaseUserId: userId,
      remoteUpdatedAt: uploadedAt,
      snapshot: localSnapshot,
      status: 'uploaded-local',
    };
  }

  if (
    remoteMeta !== null &&
    remoteMeta.schemaVersion < FIREBASE_SCHEMA_VERSION &&
    remoteHasData
  ) {
    const migratedAt = await writeFirebaseAppDataSnapshotForUser(
      userId,
      remote.snapshot,
      'migrate-compact-todo-snapshot',
      syncMeta.lastLocalChangeAt,
    );
    return {
      firebaseUserId: userId,
      remoteUpdatedAt: migratedAt,
      snapshot: remote.snapshot,
      status: 'uploaded-local',
    };
  }

  await markRemoteFirebaseRead(userId, loadedRemoteUpdatedAt);

  return {
    firebaseUserId: userId,
    remoteUpdatedAt: loadedRemoteUpdatedAt,
    snapshot: remote.snapshot,
    status: 'loaded-remote',
  };
};

export const loadFirebaseTodosFromBackend = async (): Promise<FirebaseTodosPullResult> => {
  if (!isFirebaseConfigured()) {
    return { status: 'skipped' };
  }

  const userId = await getLocalTodoFirebaseDataUserId();
  const syncMeta = await loadFirebaseSyncMeta();

  if (
    syncMeta.firebaseUserId === userId &&
    syncMeta.lastLocalChangeAt > syncMeta.lastLocalSyncedAt
  ) {
    return { reason: 'local-pending', status: 'skipped' };
  }

  const remote = await loadFirebaseTodosForUser(userId);
  const remoteUpdatedAt = remote.meta?.updatedAt ?? 0;

  if (!remote.meta && remote.todos.length === 0) {
    return { reason: 'no-remote-data', status: 'skipped' };
  }

  await markRemoteFirebaseRead(userId, remoteUpdatedAt);

  return {
    firebaseUserId: userId,
    remoteUpdatedAt,
    status: 'loaded-remote',
    todos: remote.todos,
  };
};

export const waitForPendingFirebaseWrites = () => firebaseWriteQueue;
