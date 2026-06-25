import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'local-todo.notification-log.v1';
const NOTIFICATION_LOG_LIMIT = 100;

export type NotificationLogEntry = {
  body: string;
  id: string;
  receivedAt: number;
  requestIdentifier: string;
  subtitle: string;
  title: string;
  todoId: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizeNotificationText = (value: unknown) => (
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
);

const normalizeNotificationLogEntry = (
  value: unknown,
): NotificationLogEntry | null => {
  if (!isRecord(value)) {
    return null;
  }

  const requestIdentifier = normalizeNotificationText(value.requestIdentifier);
  const receivedAt = typeof value.receivedAt === 'number' && Number.isFinite(value.receivedAt)
    ? value.receivedAt
    : 0;
  const id = normalizeNotificationText(value.id) || (
    requestIdentifier && receivedAt > 0 ? `${requestIdentifier}:${receivedAt}` : ''
  );

  if (!id || !requestIdentifier || receivedAt <= 0) {
    return null;
  }

  const todoId = normalizeNotificationText(value.todoId);

  return {
    body: normalizeNotificationText(value.body),
    id,
    receivedAt,
    requestIdentifier,
    subtitle: normalizeNotificationText(value.subtitle),
    title: normalizeNotificationText(value.title) || 'Notification',
    todoId: todoId || null,
  };
};

export const normalizeNotificationLogEntries = (
  value: unknown,
): NotificationLogEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const entriesById = new Map<string, NotificationLogEntry>();

  value.forEach((item) => {
    const entry = normalizeNotificationLogEntry(item);
    if (entry) {
      entriesById.set(entry.id, entry);
    }
  });

  return Array.from(entriesById.values())
    .sort((first, second) => second.receivedAt - first.receivedAt)
    .slice(0, NOTIFICATION_LOG_LIMIT);
};

const saveNotificationLogEntries = async (entries: NotificationLogEntry[]) => {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(normalizeNotificationLogEntries(entries)),
  );
};

export const notificationLogStore = {
  async append(entry: NotificationLogEntry) {
    const current = await this.load();
    await saveNotificationLogEntries([entry, ...current]);
    return this.load();
  },

  async delete(id: string) {
    const current = await this.load();
    const nextEntries = current.filter((entry) => entry.id !== id);
    await saveNotificationLogEntries(nextEntries);
    return nextEntries;
  },

  async load() {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }

    return normalizeNotificationLogEntries(JSON.parse(stored) as unknown);
  },

  async merge(entries: NotificationLogEntry[]) {
    const current = await this.load();
    await saveNotificationLogEntries([...entries, ...current]);
    return this.load();
  },
};
