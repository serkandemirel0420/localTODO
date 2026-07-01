import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'local-todo.firebase-sync-meta.v2';

export type FirebaseSyncMeta = {
  firebaseUserId: string | null;
  lastLocalChangeAt: number;
  lastRemoteReadAt: number;
  lastRemoteWriteAt: number;
};

const DEFAULT_SYNC_META: FirebaseSyncMeta = {
  firebaseUserId: null,
  lastLocalChangeAt: 0,
  lastRemoteReadAt: 0,
  lastRemoteWriteAt: 0,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizeTimestamp = (value: unknown) => (
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
);

const normalizeFirebaseSyncMeta = (value: unknown): FirebaseSyncMeta => {
  if (!isRecord(value)) {
    return DEFAULT_SYNC_META;
  }

  return {
    firebaseUserId: typeof value.firebaseUserId === 'string' ? value.firebaseUserId : null,
    lastLocalChangeAt: normalizeTimestamp(value.lastLocalChangeAt),
    lastRemoteReadAt: normalizeTimestamp(value.lastRemoteReadAt),
    lastRemoteWriteAt: normalizeTimestamp(value.lastRemoteWriteAt),
  };
};

const saveFirebaseSyncMeta = async (meta: FirebaseSyncMeta) => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
};

export const loadFirebaseSyncMeta = async () => {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  return stored
    ? normalizeFirebaseSyncMeta(JSON.parse(stored) as unknown)
    : DEFAULT_SYNC_META;
};

export const markLocalFirebaseChange = async () => {
  const current = await loadFirebaseSyncMeta();
  const next = {
    ...current,
    lastLocalChangeAt: Date.now(),
  };

  await saveFirebaseSyncMeta(next);
  return next;
};

export const markRemoteFirebaseRead = async (firebaseUserId: string, readAt: number) => {
  const current = await loadFirebaseSyncMeta();
  const next = {
    ...current,
    firebaseUserId,
    lastRemoteReadAt: Math.max(current.lastRemoteReadAt, readAt),
  };

  await saveFirebaseSyncMeta(next);
  return next;
};

export const markRemoteFirebaseWrite = async (firebaseUserId: string, writeAt: number) => {
  const current = await loadFirebaseSyncMeta();
  const next = {
    ...current,
    firebaseUserId,
    lastRemoteWriteAt: Math.max(current.lastRemoteWriteAt, writeAt),
  };

  await saveFirebaseSyncMeta(next);
  return next;
};
