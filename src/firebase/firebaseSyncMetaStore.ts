import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'local-todo.firebase-sync-meta.v2';

export type FirebaseSyncMeta = {
  firebaseUserId: string | null;
  lastLocalChangeAt: number;
  lastLocalSyncedAt: number;
  lastRemoteReadAt: number;
  lastRemoteWriteAt: number;
};

const DEFAULT_SYNC_META: FirebaseSyncMeta = {
  firebaseUserId: null,
  lastLocalChangeAt: 0,
  lastLocalSyncedAt: 0,
  lastRemoteReadAt: 0,
  lastRemoteWriteAt: 0,
};

let syncMetaMutationQueue = Promise.resolve<unknown>(undefined);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizeTimestamp = (value: unknown) => (
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
);

const normalizeFirebaseSyncMeta = (value: unknown): FirebaseSyncMeta => {
  if (!isRecord(value)) {
    return DEFAULT_SYNC_META;
  }

  const lastLocalChangeAt = normalizeTimestamp(value.lastLocalChangeAt);
  const lastRemoteWriteAt = normalizeTimestamp(value.lastRemoteWriteAt);
  const storedLastLocalSyncedAt = normalizeTimestamp(value.lastLocalSyncedAt);

  return {
    firebaseUserId: typeof value.firebaseUserId === 'string' ? value.firebaseUserId : null,
    lastLocalChangeAt,
    // v2 used lastRemoteWriteAt for both remote freshness and local acknowledgement.
    // Preserve that acknowledgement when upgrading existing installations.
    lastLocalSyncedAt: 'lastLocalSyncedAt' in value
      ? storedLastLocalSyncedAt
      : Math.min(lastLocalChangeAt, lastRemoteWriteAt),
    lastRemoteReadAt: normalizeTimestamp(value.lastRemoteReadAt),
    lastRemoteWriteAt,
  };
};

const saveFirebaseSyncMeta = async (meta: FirebaseSyncMeta) => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
};

const loadFirebaseSyncMetaDirect = async () => {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  return stored
    ? normalizeFirebaseSyncMeta(JSON.parse(stored) as unknown)
    : DEFAULT_SYNC_META;
};

export const loadFirebaseSyncMeta = async () => {
  await syncMetaMutationQueue.catch(() => undefined);
  return loadFirebaseSyncMetaDirect();
};

const updateFirebaseSyncMeta = (
  update: (current: FirebaseSyncMeta) => FirebaseSyncMeta,
) => {
  const operation = syncMetaMutationQueue
    .catch(() => undefined)
    .then(async () => {
      const current = await loadFirebaseSyncMetaDirect();
      const next = update(current);

      await saveFirebaseSyncMeta(next);
      return next;
    });

  syncMetaMutationQueue = operation;
  return operation;
};

export const markLocalFirebaseChange = async () => {
  return updateFirebaseSyncMeta((current) => ({
    ...current,
    lastLocalChangeAt: Math.max(Date.now(), current.lastLocalChangeAt + 1),
  }));
};

export const markRemoteFirebaseRead = async (firebaseUserId: string, readAt: number) => {
  return updateFirebaseSyncMeta((current) => ({
    ...current,
    firebaseUserId,
    lastRemoteReadAt: Math.max(current.lastRemoteReadAt, readAt),
  }));
};

export const markRemoteFirebaseWrite = async (
  firebaseUserId: string,
  writeAt: number,
  localChangeSyncedAt = 0,
) => {
  return updateFirebaseSyncMeta((current) => ({
    ...current,
    firebaseUserId,
    lastLocalSyncedAt: Math.max(current.lastLocalSyncedAt, localChangeSyncedAt),
    lastRemoteWriteAt: Math.max(current.lastRemoteWriteAt, writeAt),
  }));
};
