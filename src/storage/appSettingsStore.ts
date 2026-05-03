import AsyncStorage from '@react-native-async-storage/async-storage';

import { cloneTodoFilters, normalizeTodoFilters, type TodoFilters } from '../todos';

const STORAGE_KEY = 'local-todo.settings.v1';

export type AppSettings = {
  googleDriveBackupEnabled: boolean;
  googleDriveLastBackupAt: string | null;
  googleDriveLastRestoreAt: string | null;
  selectedFilters: TodoFilters;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  googleDriveBackupEnabled: false,
  googleDriveLastBackupAt: null,
  googleDriveLastRestoreAt: null,
  selectedFilters: cloneTodoFilters(),
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const normalizeAppSettings = (value: unknown): AppSettings => {
  if (!isRecord(value)) {
    return { ...DEFAULT_APP_SETTINGS, selectedFilters: cloneTodoFilters() };
  }

  return {
    googleDriveBackupEnabled: value.googleDriveBackupEnabled === true,
    googleDriveLastBackupAt:
      typeof value.googleDriveLastBackupAt === 'string' ? value.googleDriveLastBackupAt : null,
    googleDriveLastRestoreAt:
      typeof value.googleDriveLastRestoreAt === 'string' ? value.googleDriveLastRestoreAt : null,
    selectedFilters: normalizeTodoFilters(value.selectedFilters),
  };
};

export const appSettingsStore = {
  async load() {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored ? normalizeAppSettings(JSON.parse(stored) as unknown) : DEFAULT_APP_SETTINGS;
  },

  async save(settings: AppSettings) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeAppSettings(settings)));
  },
};
