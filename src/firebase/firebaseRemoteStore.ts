import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
  type WriteBatch,
} from 'firebase/firestore';

import {
  cloneDeletedTodos,
  cloneTodo,
  normalizeTodo,
  type Todo,
} from '../todos';
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

const FIREBASE_SCHEMA_VERSION = 1;
const FIRESTORE_BATCH_LIMIT = 450;
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

export type FirebaseAppDataPullResult =
  | {
      reason?: 'local-pending' | 'no-remote-data' | 'remote-unchanged';
      status: 'skipped';
    }
  | {
      firebaseUserId: string;
      remoteUpdatedAt: number;
      snapshot: FirebaseAppDataSnapshot;
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

const todoDocumentId = (id: string) => encodeURIComponent(id);

const userDocRef = (database: Firestore, userId: string) =>
  doc(database, 'users', userId);

const todosCollectionRef = (database: Firestore, userId: string) =>
  collection(userDocRef(database, userId), 'todos');

const todoDocRef = (database: Firestore, userId: string, id: string) =>
  doc(todosCollectionRef(database, userId), todoDocumentId(id));

const metaDocRef = (database: Firestore, userId: string, id: string) =>
  doc(userDocRef(database, userId), 'meta', id);

const syncMetaDocRef = (database: Firestore, userId: string) =>
  metaDocRef(database, userId, 'sync');

const settingsDocRef = (database: Firestore, userId: string) =>
  metaDocRef(database, userId, 'settings');

const notificationLogDocRef = (database: Firestore, userId: string) =>
  metaDocRef(database, userId, 'notificationLog');

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

const commitBatchIfNeeded = async (
  batchState: {
    batch: WriteBatch;
    count: number;
  },
  database: Firestore,
) => {
  if (batchState.count < FIRESTORE_BATCH_LIMIT) {
    return;
  }

  await batchState.batch.commit();
  batchState.batch = writeBatch(database);
  batchState.count = 0;
};

const commitBatch = async (batchState: { batch: WriteBatch; count: number }) => {
  if (batchState.count > 0) {
    await batchState.batch.commit();
  }
};

const writeTodosSnapshotForUser = async (
  database: Firestore,
  userId: string,
  todos: Todo[],
) => {
  const existingTodos = await getDocs(todosCollectionRef(database, userId));
  const batchState = {
    batch: writeBatch(database),
    count: 0,
  };

  existingTodos.forEach((todoSnapshot) => {
    batchState.batch.delete(todoSnapshot.ref);
    batchState.count += 1;
  });

  for (const todo of todos.map(cloneTodo)) {
    await commitBatchIfNeeded(batchState, database);
    batchState.batch.set(
      todoDocRef(database, userId, todo.id),
      {
        ...toFirestoreJson(todo),
        schemaVersion: FIREBASE_SCHEMA_VERSION,
      },
      { merge: false },
    );
    batchState.count += 1;
  }

  await commitBatch(batchState);
};

const writeFirebaseAppDataSnapshotForUser = async (
  userId: string,
  snapshot: FirebaseAppDataSnapshot,
  reason: string,
  localChangeSyncedAt = 0,
) => {
  const database = getLocalTodoFirestore();
  const normalizedSettings = normalizeAppSettings({
    ...snapshot.settings,
    deletedTodos: cloneDeletedTodos(snapshot.settings.deletedTodos),
  });

  await writeTodosSnapshotForUser(database, userId, snapshot.todos);
  await Promise.all([
    setDoc(
      settingsDocRef(database, userId),
      {
        ...toFirestoreJson(normalizedSettings),
        schemaVersion: FIREBASE_SCHEMA_VERSION,
      },
      { merge: false },
    ),
    setDoc(
      notificationLogDocRef(database, userId),
      {
        entries: toFirestoreJson(normalizeNotificationLogEntries(snapshot.notificationLogEntries)),
        schemaVersion: FIREBASE_SCHEMA_VERSION,
      },
      { merge: false },
    ),
  ]);
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
): Promise<{
  meta: FirebaseRemoteMeta | null;
  snapshot: FirebaseAppDataSnapshot;
}> => {
  const database = getLocalTodoFirestore();
  const [
    todosSnapshot,
    settingsSnapshot,
    notificationLogSnapshot,
    syncMetaSnapshot,
  ] = await Promise.all([
    getDocs(todosCollectionRef(database, userId)),
    getDoc(settingsDocRef(database, userId)),
    getDoc(notificationLogDocRef(database, userId)),
    getDoc(syncMetaDocRef(database, userId)),
  ]);
  const todos = todosSnapshot.docs
    .map((todoSnapshot) => normalizeTodo(todoSnapshot.data()))
    .filter((todo): todo is Todo => Boolean(todo))
    .sort((first, second) =>
      Number(second.pinned) - Number(first.pinned) || second.createdAt - first.createdAt
    );
  const notificationLogData = notificationLogSnapshot.data();

  return {
    meta: normalizeRemoteMeta(syncMetaSnapshot.data()),
    snapshot: {
      notificationLogEntries: normalizeNotificationLogEntries(notificationLogData?.entries),
      settings: normalizeAppSettings(settingsSnapshot.data()),
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
    todosSnapshot,
    syncMetaSnapshot,
  ] = await Promise.all([
    getDocs(todosCollectionRef(database, userId)),
    getDoc(syncMetaDocRef(database, userId)),
  ]);
  const todos = todosSnapshot.docs
    .map((todoSnapshot) => normalizeTodo(todoSnapshot.data()))
    .filter((todo): todo is Todo => Boolean(todo));

  return {
    meta: normalizeRemoteMeta(syncMetaSnapshot.data()),
    todos: sortTodos(todos),
  };
};

const localSnapshotHasUserData = (snapshot: FirebaseAppDataSnapshot) => (
  snapshot.todos.length > 0 ||
  snapshot.notificationLogEntries.length > 0 ||
  snapshot.settings.deletedTodos.length > 0 ||
  snapshot.settings.customTags.length > 0 ||
  snapshot.settings.history.undo.length > 0 ||
  snapshot.settings.history.redo.length > 0
);

const settingsHistoryHasEntries = (settings: AppSettings) => (
  settings.history.undo.length > 0 ||
  settings.history.redo.length > 0
);

const sortTodos = (todos: Todo[]) => (
  todos.sort((first, second) =>
    Number(second.pinned) - Number(first.pinned) || second.createdAt - first.createdAt
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
  const remoteSettings = normalizeAppSettings(remoteSnapshot.settings);
  const localSettings = normalizeAppSettings(localSnapshot.settings);

  return {
    notificationLogEntries: normalizeNotificationLogEntries([
      ...localSnapshot.notificationLogEntries,
      ...remoteSnapshot.notificationLogEntries,
    ]),
    settings: normalizeAppSettings({
      ...remoteSettings,
      ...localSettings,
      customTags: Array.from(new Set([
        ...remoteSettings.customTags,
        ...localSettings.customTags,
      ])),
      deletedTodos: [
        ...cloneDeletedTodos(remoteSettings.deletedTodos),
        ...cloneDeletedTodos(localSettings.deletedTodos),
      ],
      history: settingsHistoryHasEntries(localSettings)
        ? localSettings.history
        : remoteSettings.history,
    }),
    todos: mergeTodos(remoteSnapshot.todos, localSnapshot.todos),
  };
};

export const queueFirebaseTodoUpsert = (todo: Todo) => (
  enqueueFirebaseWrite(async (localChangeAt) => {
    const userId = await getLocalTodoFirebaseDataUserId();
    const database = getLocalTodoFirestore();

    await setDoc(
      todoDocRef(database, userId, todo.id),
      {
        ...toFirestoreJson(cloneTodo(todo)),
        schemaVersion: FIREBASE_SCHEMA_VERSION,
      },
      { merge: false },
    );
    await touchRemoteMeta(database, userId, 'todo-upsert', localChangeAt);
  })
);

export const queueFirebaseTodoDelete = (id: string) => (
  enqueueFirebaseWrite(async (localChangeAt) => {
    const userId = await getLocalTodoFirebaseDataUserId();
    const database = getLocalTodoFirestore();

    await deleteDoc(todoDocRef(database, userId, id));
    await touchRemoteMeta(database, userId, 'todo-delete', localChangeAt);
  })
);

export const queueFirebaseTodoDoneUpdate = (id: string, done: boolean) => (
  enqueueFirebaseWrite(async (localChangeAt) => {
    const userId = await getLocalTodoFirebaseDataUserId();
    const database = getLocalTodoFirestore();

    await setDoc(
      todoDocRef(database, userId, id),
      { done, schemaVersion: FIREBASE_SCHEMA_VERSION },
      { merge: true },
    );
    await touchRemoteMeta(database, userId, 'todo-done', localChangeAt);
  })
);

export const queueFirebaseTodoFiltersUpdate = (id: string, filters: Todo['filters']) => (
  enqueueFirebaseWrite(async (localChangeAt) => {
    const userId = await getLocalTodoFirebaseDataUserId();
    const database = getLocalTodoFirestore();

    await setDoc(
      todoDocRef(database, userId, id),
      {
        filters: toFirestoreJson(filters),
        schemaVersion: FIREBASE_SCHEMA_VERSION,
      },
      { merge: true },
    );
    await touchRemoteMeta(database, userId, 'todo-filters', localChangeAt);
  })
);

export const queueFirebaseTodosUpsertMany = (todos: Todo[]) => (
  enqueueFirebaseWrite(async (localChangeAt) => {
    if (todos.length === 0) {
      return;
    }

    const userId = await getLocalTodoFirebaseDataUserId();
    const database = getLocalTodoFirestore();
    const batchState = {
      batch: writeBatch(database),
      count: 0,
    };

    for (const todo of todos.map(cloneTodo)) {
      await commitBatchIfNeeded(batchState, database);
      batchState.batch.set(
        todoDocRef(database, userId, todo.id),
        {
          ...toFirestoreJson(todo),
          schemaVersion: FIREBASE_SCHEMA_VERSION,
        },
        { merge: false },
      );
      batchState.count += 1;
    }

    await commitBatch(batchState);
    await touchRemoteMeta(database, userId, 'todos-upsert-many', localChangeAt);
  })
);

export const queueFirebaseTodosReplaceAll = (todos: Todo[]) => (
  enqueueFirebaseWrite(async (localChangeAt) => {
    const userId = await getLocalTodoFirebaseDataUserId();
    const database = getLocalTodoFirestore();

    await writeTodosSnapshotForUser(database, userId, todos);
    await touchRemoteMeta(database, userId, 'todos-replace-all', localChangeAt);
  })
);

export const queueFirebaseSettingsSave = (settings: AppSettings) => (
  enqueueFirebaseWrite(async (localChangeAt) => {
    const userId = await getLocalTodoFirebaseDataUserId();
    const database = getLocalTodoFirestore();

    await setDoc(
      settingsDocRef(database, userId),
      {
        ...toFirestoreJson(normalizeAppSettings(settings)),
        schemaVersion: FIREBASE_SCHEMA_VERSION,
      },
      { merge: false },
    );
    await touchRemoteMeta(database, userId, 'settings-save', localChangeAt);
  })
);

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

  const remote = await loadFirebaseAppDataForUser(userId);
  const loadedRemoteUpdatedAt = remote.meta?.updatedAt ?? remoteUpdatedAt;
  const remoteHasData = (
    remote.snapshot.todos.length > 0 ||
    remote.snapshot.notificationLogEntries.length > 0 ||
    remote.snapshot.settings.deletedTodos.length > 0 ||
    remote.snapshot.settings.customTags.length > 0 ||
    remote.snapshot.settings.history.undo.length > 0 ||
    remote.snapshot.settings.history.redo.length > 0
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

  await markRemoteFirebaseRead(userId, loadedRemoteUpdatedAt);

  return {
    firebaseUserId: userId,
    remoteUpdatedAt: loadedRemoteUpdatedAt,
    snapshot: remote.snapshot,
    status: 'loaded-remote',
  };
};

export const loadFirebaseAppDataFromBackend = async (): Promise<FirebaseAppDataPullResult> => {
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

  const remoteMeta = await loadFirebaseRemoteMetaForUser(userId);
  const remoteUpdatedAt = remoteMeta?.updatedAt ?? 0;
  const lastKnownRemoteAt = Math.max(
    syncMeta.lastRemoteReadAt,
    syncMeta.lastRemoteWriteAt,
  );

  if (
    remoteMeta !== null &&
    remoteUpdatedAt > 0 &&
    syncMeta.firebaseUserId === userId &&
    remoteUpdatedAt <= lastKnownRemoteAt
  ) {
    await markRemoteFirebaseRead(userId, remoteUpdatedAt);
    return { reason: 'remote-unchanged', status: 'skipped' };
  }

  const remote = await loadFirebaseAppDataForUser(userId);
  const loadedRemoteUpdatedAt = remote.meta?.updatedAt ?? remoteUpdatedAt;

  if (!remote.meta && !localSnapshotHasUserData(remote.snapshot)) {
    return { reason: 'no-remote-data', status: 'skipped' };
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
