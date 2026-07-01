import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
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
      snapshot: FirebaseAppDataSnapshot;
      status: 'loaded-remote' | 'uploaded-local';
    };

export type FirebaseAppDataChangeResult = {
  firebaseUserId: string;
  remoteUpdatedAt: number;
  snapshot: FirebaseAppDataSnapshot;
  status: 'loaded-remote';
};

let firebaseWriteQueue = Promise.resolve();
let firebaseWritesEnabled = false;

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
  await markRemoteFirebaseWrite(userId, updatedAt);

  return updatedAt;
};

export const setFirebaseRemoteWritesEnabled = (enabled: boolean) => {
  firebaseWritesEnabled = enabled;
};

const enqueueFirebaseWrite = (write: () => Promise<void>) => {
  if (!firebaseWritesEnabled) {
    return Promise.resolve();
  }

  markLocalFirebaseChange().catch(() => undefined);
  firebaseWriteQueue = firebaseWriteQueue
    .then(async () => {
      if (!isFirebaseConfigured()) {
        return;
      }

      await write();
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
  await touchRemoteMeta(database, userId, reason);
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

const localSnapshotHasUserData = (snapshot: FirebaseAppDataSnapshot) => (
  snapshot.todos.length > 0 ||
  snapshot.notificationLogEntries.length > 0 ||
  snapshot.settings.deletedTodos.length > 0 ||
  snapshot.settings.customTags.length > 0
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
    }),
    todos: mergeTodos(remoteSnapshot.todos, localSnapshot.todos),
  };
};

export const queueFirebaseTodoUpsert = (todo: Todo) => (
  enqueueFirebaseWrite(async () => {
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
    await touchRemoteMeta(database, userId, 'todo-upsert');
  })
);

export const queueFirebaseTodoDelete = (id: string) => (
  enqueueFirebaseWrite(async () => {
    const userId = await getLocalTodoFirebaseDataUserId();
    const database = getLocalTodoFirestore();

    await deleteDoc(todoDocRef(database, userId, id));
    await touchRemoteMeta(database, userId, 'todo-delete');
  })
);

export const queueFirebaseTodoDoneUpdate = (id: string, done: boolean) => (
  enqueueFirebaseWrite(async () => {
    const userId = await getLocalTodoFirebaseDataUserId();
    const database = getLocalTodoFirestore();

    await setDoc(
      todoDocRef(database, userId, id),
      { done, schemaVersion: FIREBASE_SCHEMA_VERSION },
      { merge: true },
    );
    await touchRemoteMeta(database, userId, 'todo-done');
  })
);

export const queueFirebaseTodoFiltersUpdate = (id: string, filters: Todo['filters']) => (
  enqueueFirebaseWrite(async () => {
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
    await touchRemoteMeta(database, userId, 'todo-filters');
  })
);

export const queueFirebaseTodosUpsertMany = (todos: Todo[]) => (
  enqueueFirebaseWrite(async () => {
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
    await touchRemoteMeta(database, userId, 'todos-upsert-many');
  })
);

export const queueFirebaseTodosReplaceAll = (todos: Todo[]) => (
  enqueueFirebaseWrite(async () => {
    const userId = await getLocalTodoFirebaseDataUserId();
    const database = getLocalTodoFirestore();

    await writeTodosSnapshotForUser(database, userId, todos);
    await touchRemoteMeta(database, userId, 'todos-replace-all');
  })
);

export const queueFirebaseSettingsSave = (settings: AppSettings) => (
  enqueueFirebaseWrite(async () => {
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
    await touchRemoteMeta(database, userId, 'settings-save');
  })
);

export const queueFirebaseNotificationLogSave = (entries: NotificationLogEntry[]) => (
  enqueueFirebaseWrite(async () => {
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
    await touchRemoteMeta(database, userId, 'notification-log-save');
  })
);

export const syncFirebaseAppDataFromLocalSnapshot = async (
  localSnapshot: FirebaseAppDataSnapshot,
): Promise<FirebaseAppDataSyncResult> => {
  if (!isFirebaseConfigured()) {
    return { status: 'disabled' };
  }

  const userId = await getLocalTodoFirebaseDataUserId();
  const remote = await loadFirebaseAppDataForUser(userId);
  const remoteUpdatedAt = remote.meta?.updatedAt ?? 0;
  const remoteHasData = (
    remote.snapshot.todos.length > 0 ||
    remote.snapshot.notificationLogEntries.length > 0 ||
    remote.snapshot.settings.deletedTodos.length > 0 ||
    remote.snapshot.settings.customTags.length > 0
  );
  const syncMeta = await loadFirebaseSyncMeta();
  const usesSharedDataProfile = hasLocalTodoFirebaseDataUserId();
  const shouldMergeLocalIntoRemote = (
    !usesSharedDataProfile &&
    Boolean(syncMeta.firebaseUserId) &&
    syncMeta.firebaseUserId !== userId &&
    remoteHasData &&
    localSnapshotHasUserData(localSnapshot)
  );
  const shouldUploadLocal = (
    !usesSharedDataProfile &&
    !remoteHasData &&
    localSnapshotHasUserData(localSnapshot)
  );

  if (shouldMergeLocalIntoRemote) {
    const mergedSnapshot = mergeAppDataSnapshots(remote.snapshot, localSnapshot);
    await writeFirebaseAppDataSnapshotForUser(userId, mergedSnapshot, 'merge-local-remote-sync');
    return {
      firebaseUserId: userId,
      remoteUpdatedAt: Date.now(),
      snapshot: mergedSnapshot,
      status: 'uploaded-local',
    };
  }

  if (shouldUploadLocal) {
    await writeFirebaseAppDataSnapshotForUser(userId, localSnapshot, 'initial-local-sync');
    return {
      firebaseUserId: userId,
      remoteUpdatedAt: Date.now(),
      snapshot: localSnapshot,
      status: 'uploaded-local',
    };
  }

  await markRemoteFirebaseRead(userId, remoteUpdatedAt);

  return {
    firebaseUserId: userId,
    remoteUpdatedAt,
    snapshot: remote.snapshot,
    status: 'loaded-remote',
  };
};

export const subscribeFirebaseAppDataChanges = async (
  onChange: (result: FirebaseAppDataChangeResult) => void,
  onError: (error: unknown) => void = () => undefined,
  initialRemoteUpdatedAt = 0,
): Promise<Unsubscribe> => {
  if (!isFirebaseConfigured()) {
    return () => undefined;
  }

  const userId = await getLocalTodoFirebaseDataUserId();
  const database = getLocalTodoFirestore();
  let active = true;
  let lastDeliveredUpdatedAt = initialRemoteUpdatedAt;

  const unsubscribe = onSnapshot(
    syncMetaDocRef(database, userId),
    (syncSnapshot) => {
      const remoteMeta = normalizeRemoteMeta(syncSnapshot.data());
      const remoteUpdatedAt = remoteMeta?.updatedAt ?? 0;

      if (!active || remoteUpdatedAt <= lastDeliveredUpdatedAt) {
        return;
      }

      lastDeliveredUpdatedAt = remoteUpdatedAt;
      loadFirebaseAppDataForUser(userId)
        .then((remote) => {
          if (!active) {
            return;
          }

          markRemoteFirebaseRead(userId, remoteUpdatedAt).catch(() => undefined);
          onChange({
            firebaseUserId: userId,
            remoteUpdatedAt,
            snapshot: remote.snapshot,
            status: 'loaded-remote',
          });
        })
        .catch(onError);
    },
    onError,
  );

  return () => {
    active = false;
    unsubscribe();
  };
};

export const waitForPendingFirebaseWrites = () => firebaseWriteQueue;
