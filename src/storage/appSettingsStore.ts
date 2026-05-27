import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  cloneFilterColors,
  normalizeFilterColors,
  type FilterColorSettings,
} from '../filterColors';
import { cloneTodoFilters, normalizeTodoFilters, type TodoFilters } from '../todos';

const STORAGE_KEY = 'local-todo.settings.v1';

export type ListOrderMode = 'alphabetical' | 'manual';
export type TodoGroupMode = 'date' | 'list' | 'none' | 'priority' | 'status';
export type TodoSortMode = 'alphabetical' | 'date' | 'newest' | 'oldest' | 'priority';

export type StoredListMenuNode = {
  label: string;
  children?: StoredListMenuNode[];
};

export type StoredMenuPreset = {
  id: string;
  label: string;
  filters: TodoFilters;
  listOrderMode: ListOrderMode;
  todoGroupMode: TodoGroupMode;
  todoSortMode: TodoSortMode;
  createdAt: number;
};

export const DEFAULT_LIST_MENU_TREE: StoredListMenuNode[] = [
  { label: 'Inbox' },
  { label: 'Today' },
  { label: 'Upcoming' },
  { label: 'Priority' },
  { label: 'Work' },
  { label: 'Personal' },
  { label: 'Home' },
  { label: 'Errands' },
  { label: 'Shopping' },
  { label: 'Ideas' },
  { label: 'Reading' },
  { label: 'Calls' },
  { label: 'Waiting' },
  { label: 'Someday' },
  { label: 'Projects' },
  { label: 'Health' },
  { label: 'Finance' },
  { label: 'Travel' },
  { label: 'Archive' },
];

export type AppSettings = {
  collapsedTodoGroupIds: string[];
  filterColors: FilterColorSettings;
  googleDriveBackupEnabled: boolean;
  googleDriveLastBackupAt: string | null;
  googleDriveLastRestoreAt: string | null;
  listMenuTree: StoredListMenuNode[];
  listOrderMode: ListOrderMode;
  menuPresets: StoredMenuPreset[];
  selectedFilters: TodoFilters;
  todoGroupMode: TodoGroupMode;
  todoSortMode: TodoSortMode;
};

export const cloneListMenuTree = (nodes: StoredListMenuNode[]): StoredListMenuNode[] =>
  nodes.map((node) => ({
    label: node.label,
    children: node.children ? cloneListMenuTree(node.children) : undefined,
  }));

export const cloneMenuPresets = (presets: StoredMenuPreset[]): StoredMenuPreset[] =>
  presets.map((preset) => ({
    id: preset.id,
    label: preset.label,
    filters: cloneTodoFilters(preset.filters),
    listOrderMode: preset.listOrderMode,
    todoGroupMode: preset.todoGroupMode,
    todoSortMode: preset.todoSortMode,
    createdAt: preset.createdAt,
  }));

export const DEFAULT_APP_SETTINGS: AppSettings = {
  collapsedTodoGroupIds: [],
  filterColors: cloneFilterColors(),
  googleDriveBackupEnabled: false,
  googleDriveLastBackupAt: null,
  googleDriveLastRestoreAt: null,
  listMenuTree: cloneListMenuTree(DEFAULT_LIST_MENU_TREE),
  listOrderMode: 'alphabetical',
  menuPresets: [],
  selectedFilters: cloneTodoFilters(),
  todoGroupMode: 'none',
  todoSortMode: 'newest',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizeTodoGroupMode = (value: unknown): TodoGroupMode => {
  if (
    value === 'date' ||
    value === 'list' ||
    value === 'priority' ||
    value === 'status'
  ) {
    return value;
  }

  return 'none';
};

const normalizeCollapsedTodoGroupIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
};

const normalizeTodoSortMode = (value: unknown): TodoSortMode => {
  if (
    value === 'alphabetical' ||
    value === 'date' ||
    value === 'newest' ||
    value === 'oldest' ||
    value === 'priority'
  ) {
    return value;
  }

  return 'newest';
};

export const flattenListMenuTree = (nodes: StoredListMenuNode[]): StoredListMenuNode[] => {
  const seen = new Set<string>();
  const flattened: StoredListMenuNode[] = [];

  const walk = (items: StoredListMenuNode[]) => {
    for (const item of items) {
      const key = item.label.toLocaleLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        flattened.push({ label: item.label });
      }

      if (item.children?.length) {
        walk(item.children);
      }
    }
  };

  walk(nodes);
  return flattened;
};

export const normalizeListMenuTree = (
  value: unknown,
  fallback: StoredListMenuNode[] = DEFAULT_LIST_MENU_TREE,
): StoredListMenuNode[] => {
  if (!Array.isArray(value)) {
    return cloneListMenuTree(fallback);
  }

  const nodes = value
    .map((item): StoredListMenuNode | null => {
      if (!isRecord(item) || typeof item.label !== 'string') {
        return null;
      }

      const label = item.label.trim();
      if (!label) {
        return null;
      }

      const children = Array.isArray(item.children)
        ? item.children
            .map((child): StoredListMenuNode | null => {
              if (!isRecord(child) || typeof child.label !== 'string') {
                return null;
              }

              const childLabel = child.label.trim();
              return childLabel ? { label: childLabel } : null;
            })
            .filter((child): child is StoredListMenuNode => Boolean(child))
        : [];

      return {
        label,
        children: children.length > 0 ? children : undefined,
      };
    })
    .filter((item): item is StoredListMenuNode => Boolean(item));

  const flattened = flattenListMenuTree(nodes);
  return flattened.length > 0 ? flattened : cloneListMenuTree(fallback);
};

export const normalizeMenuPresets = (value: unknown): StoredMenuPreset[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index): StoredMenuPreset | null => {
      if (!isRecord(item)) {
        return null;
      }

      const id = typeof item.id === 'string' && item.id.trim()
        ? item.id.trim()
        : `preset-${index + 1}`;
      const label = typeof item.label === 'string' && item.label.trim()
        ? item.label.trim()
        : `Preset ${index + 1}`;
      const createdAt = typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
        ? item.createdAt
        : 0;

      return {
        id,
        label,
        filters: normalizeTodoFilters(item.filters),
        listOrderMode: item.listOrderMode === 'manual' ? 'manual' : 'alphabetical',
        todoGroupMode: normalizeTodoGroupMode(item.todoGroupMode),
        todoSortMode: normalizeTodoSortMode(item.todoSortMode),
        createdAt,
      };
    })
    .filter((item): item is StoredMenuPreset => Boolean(item));
};

export const normalizeAppSettings = (value: unknown): AppSettings => {
  if (!isRecord(value)) {
    return {
      ...DEFAULT_APP_SETTINGS,
      filterColors: cloneFilterColors(),
      listMenuTree: cloneListMenuTree(DEFAULT_LIST_MENU_TREE),
      menuPresets: [],
      selectedFilters: cloneTodoFilters(),
      todoGroupMode: 'none',
      todoSortMode: 'newest',
    };
  }

  return {
    collapsedTodoGroupIds: normalizeCollapsedTodoGroupIds(value.collapsedTodoGroupIds),
    filterColors: normalizeFilterColors(value.filterColors),
    googleDriveBackupEnabled: value.googleDriveBackupEnabled === true,
    googleDriveLastBackupAt:
      typeof value.googleDriveLastBackupAt === 'string' ? value.googleDriveLastBackupAt : null,
    googleDriveLastRestoreAt:
      typeof value.googleDriveLastRestoreAt === 'string' ? value.googleDriveLastRestoreAt : null,
    listMenuTree: normalizeListMenuTree(value.listMenuTree),
    listOrderMode: value.listOrderMode === 'manual' ? 'manual' : 'alphabetical',
    menuPresets: normalizeMenuPresets(value.menuPresets),
    selectedFilters: normalizeTodoFilters(value.selectedFilters),
    todoGroupMode: normalizeTodoGroupMode(value.todoGroupMode),
    todoSortMode: normalizeTodoSortMode(value.todoSortMode),
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
