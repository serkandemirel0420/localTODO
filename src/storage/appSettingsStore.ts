import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  cloneFilterColors,
  normalizeFilterColors,
  type FilterColorSettings,
} from '../filterColors';
import {
  type DateLabelDisplayMode,
} from '../dates';
import {
  cloneMetaTagVisibility,
  normalizeMetaTagVisibility,
  type MetaTagVisibility,
} from '../metaTags';
import { REPEATING_ITEMS_FILTER_VALUE } from '../reminders';
import {
  cloneDeletedTodos,
  cloneTodoFilters,
  formatListLabel,
  normalizeDeletedTodos,
  normalizeTodoFilters,
  type DeletedTodo,
  type TodoFilters,
} from '../todos';

const STORAGE_KEY = 'local-todo.settings.v1';

export type ListOrderMode = 'alphabetical' | 'manual';
export type TodoGroupMode = 'date' | 'list' | 'none' | 'priority' | 'status';
export type TodoSortMode = 'alphabetical' | 'date' | 'newest' | 'oldest' | 'priority';

export type StoredListMenuNode = {
  label: string;
  iconName?: string;
  searchKeywords?: string;
  children?: StoredListMenuNode[];
  sortMode?: TodoSortMode;
  groupMode?: TodoGroupMode;
  subsectionSortMode?: TodoSortMode;
  subsectionGroupMode?: TodoGroupMode;
};

export type ActiveListDisplaySettings = {
  listLabel: string | null;
  isSubsectionView: boolean;
  sortMode: TodoSortMode;
  groupMode: TodoGroupMode;
};

export type StoredMenuPreset = {
  id: string;
  label: string;
  searchKeywords?: string;
  filters: TodoFilters;
  listOrderMode: ListOrderMode;
  todoGroupMode: TodoGroupMode;
  todoSortMode: TodoSortMode;
  createdAt: number;
};

export const QUICK_PRESET_NAV_SLOT_COUNT = 10;
export const QUICK_PRESET_NAV_MAX_SLOT_COUNT = 50;
export const QUICK_PRESET_DEFAULTS_VERSION = 2;
export type QuickPresetNavPresetIds = Array<string | null>;
export type QuickPresetNavIconNames = string[];
export type NavbarHiddenPresetIds = string[];

export const DEFAULT_QUICK_PRESET_NAV_ICON_NAMES: QuickPresetNavIconNames = [
  'penguin',
  'rabbit-variant',
  'turtle',
  'cat',
  'owl',
  'butterfly-outline',
  'bee',
  'ladybug',
  'dog-side',
  'star-four-points',
];

const DEFAULT_QUICK_MENU_PRESETS: StoredMenuPreset[] = [
  {
    id: 'starter-status',
    label: 'Status',
    filters: { date: [], list: [], priority: [], reminder: [] },
    listOrderMode: 'alphabetical',
    todoGroupMode: 'status',
    todoSortMode: 'newest',
    createdAt: 1,
  },
  {
    id: 'starter-priority',
    label: 'Priority',
    filters: { date: [], list: [], priority: [], reminder: [] },
    listOrderMode: 'alphabetical',
    todoGroupMode: 'priority',
    todoSortMode: 'priority',
    createdAt: 2,
  },
  {
    id: 'starter-repeating',
    label: 'Repeating',
    filters: {
      date: [],
      list: [],
      priority: [],
      reminder: [REPEATING_ITEMS_FILTER_VALUE],
    },
    listOrderMode: 'alphabetical',
    todoGroupMode: 'date',
    todoSortMode: 'date',
    createdAt: 3,
  },
  {
    id: 'starter-lists',
    label: 'Lists',
    filters: { date: [], list: [], priority: [], reminder: [] },
    listOrderMode: 'alphabetical',
    todoGroupMode: 'list',
    todoSortMode: 'date',
    createdAt: 4,
  },
  {
    id: 'starter-date',
    label: 'Date',
    filters: { date: [], list: [], priority: [], reminder: [] },
    listOrderMode: 'alphabetical',
    todoGroupMode: 'date',
    todoSortMode: 'date',
    createdAt: 5,
  },
  {
    id: 'starter-today',
    label: 'Today',
    filters: { date: ['Today'], list: [], priority: [], reminder: [] },
    listOrderMode: 'alphabetical',
    todoGroupMode: 'date',
    todoSortMode: 'date',
    createdAt: 6,
  },
  {
    id: 'starter-tomorrow',
    label: 'Tomorrow',
    filters: { date: ['Tomorrow'], list: [], priority: [], reminder: [] },
    listOrderMode: 'alphabetical',
    todoGroupMode: 'date',
    todoSortMode: 'date',
    createdAt: 7,
  },
  {
    id: 'starter-high',
    label: 'High',
    filters: { date: [], list: [], priority: ['High'], reminder: [] },
    listOrderMode: 'alphabetical',
    todoGroupMode: 'priority',
    todoSortMode: 'priority',
    createdAt: 8,
  },
  {
    id: 'starter-later',
    label: 'Later',
    filters: { date: ['Later'], list: [], priority: [], reminder: [] },
    listOrderMode: 'alphabetical',
    todoGroupMode: 'date',
    todoSortMode: 'date',
    createdAt: 9,
  },
  {
    id: 'starter-newest',
    label: 'Newest',
    filters: { date: [], list: [], priority: [], reminder: [] },
    listOrderMode: 'alphabetical',
    todoGroupMode: 'none',
    todoSortMode: 'newest',
    createdAt: 10,
  },
];

export const DEFAULT_QUICK_PRESET_NAV_PRESET_IDS: QuickPresetNavPresetIds =
  DEFAULT_QUICK_MENU_PRESETS.map((preset) => preset.id);

export type FilterConfigExpandedSections = {
  lists: boolean;
  priority: boolean;
  date: boolean;
  sort: boolean;
  group: boolean;
  metaTags: boolean;
};

export type FilterConfigUiState = {
  expandedSections: FilterConfigExpandedSections;
  scrollOffsetY: number | null;
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

export const DEFAULT_FILTER_CONFIG_UI_STATE: FilterConfigUiState = {
  expandedSections: {
    lists: true,
    priority: false,
    date: true,
    sort: false,
    group: false,
    metaTags: false,
  },
  scrollOffsetY: null,
};

export type { DateLabelDisplayMode };

export type AppSettings = {
  collapsedTodoGroupIds: string[];
  dateLabelDisplayMode: DateLabelDisplayMode;
  deletedTodos: DeletedTodo[];
  filterConfigUiState: FilterConfigUiState;
  filterColors: FilterColorSettings;
  googleDriveBackupEnabled: boolean;
  googleDriveLastBackupAt: string | null;
  googleDriveLastRestoreAt: string | null;
  hideDoneTodos: boolean;
  lastCreateTodoFilters: TodoFilters;
  listMenuTree: StoredListMenuNode[];
  listOrderMode: ListOrderMode;
  menuPresets: StoredMenuPreset[];
  navbarHiddenPresetIds: NavbarHiddenPresetIds;
  metaTagVisibility: MetaTagVisibility;
  quickPresetDefaultsVersion: number;
  quickPresetNavIconNames: QuickPresetNavIconNames;
  quickPresetNavPresetIds: QuickPresetNavPresetIds;
  selectedFilters: TodoFilters;
  showOverdueMetaTags: boolean;
  todoGroupMode: TodoGroupMode;
  todoSortMode: TodoSortMode;
};

export const cloneListMenuTree = (nodes: StoredListMenuNode[]): StoredListMenuNode[] =>
  nodes.map((node) => ({
    label: node.label,
    ...(node.iconName ? { iconName: node.iconName } : {}),
    ...(node.searchKeywords ? { searchKeywords: node.searchKeywords } : {}),
    sortMode: node.sortMode,
    groupMode: node.groupMode,
    subsectionSortMode: node.subsectionSortMode,
    subsectionGroupMode: node.subsectionGroupMode,
    children: node.children ? cloneListMenuTree(node.children) : undefined,
  }));

export const cloneMenuPresets = (presets: StoredMenuPreset[]): StoredMenuPreset[] =>
  presets.map((preset) => ({
    id: preset.id,
    label: preset.label,
    ...(preset.searchKeywords ? { searchKeywords: preset.searchKeywords } : {}),
    filters: cloneTodoFilters(preset.filters),
    listOrderMode: preset.listOrderMode,
    todoGroupMode: preset.todoGroupMode,
    todoSortMode: preset.todoSortMode,
    createdAt: preset.createdAt,
  }));

export const normalizeQuickPresetNavPresetIds = (value: unknown): QuickPresetNavPresetIds => {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }

  const slotCount = Math.min(value.length, QUICK_PRESET_NAV_MAX_SLOT_COUNT);

  return Array.from({ length: slotCount }, (_, index) => {
    const presetId = value[index];
    return typeof presetId === 'string' && presetId.trim() ? presetId.trim() : null;
  });
};

export const cloneQuickPresetNavPresetIds = (
  presetIds: QuickPresetNavPresetIds,
): QuickPresetNavPresetIds => normalizeQuickPresetNavPresetIds(presetIds);

export const normalizeNavbarHiddenPresetIds = (value: unknown): NavbarHiddenPresetIds => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value.filter((presetId): presetId is string => {
    if (typeof presetId !== 'string') {
      return false;
    }

    const trimmed = presetId.trim();
    if (!trimmed || seen.has(trimmed)) {
      return false;
    }

    seen.add(trimmed);
    return true;
  });
};

export const cloneNavbarHiddenPresetIds = (
  presetIds: NavbarHiddenPresetIds,
): NavbarHiddenPresetIds => normalizeNavbarHiddenPresetIds(presetIds);

const QUICK_PRESET_NAV_ICON_NAME_PATTERN = /^[a-z0-9-]+$/i;

const normalizeQuickPresetNavIconName = (value: unknown, index: number): string => {
  if (
    typeof value === 'string' &&
    QUICK_PRESET_NAV_ICON_NAME_PATTERN.test(value.trim())
  ) {
    return value.trim();
  }

  return DEFAULT_QUICK_PRESET_NAV_ICON_NAMES[
    index % DEFAULT_QUICK_PRESET_NAV_ICON_NAMES.length
  ] ?? 'star-four-points';
};

export const normalizeQuickPresetNavIconNames = (
  value: unknown,
  expectedLength?: number,
): QuickPresetNavIconNames => {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }

  const slotCount = Math.min(
    expectedLength ?? value.length,
    QUICK_PRESET_NAV_MAX_SLOT_COUNT,
  );

  return Array.from({ length: slotCount }, (_, index) => (
    normalizeQuickPresetNavIconName(value[index], index)
  ));
};

export const cloneQuickPresetNavIconNames = (
  iconNames: QuickPresetNavIconNames,
  expectedLength?: number,
): QuickPresetNavIconNames => normalizeQuickPresetNavIconNames(iconNames, expectedLength);

const normalizeQuickPresetDefaultsVersion = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0
);

export const ensureQuickPresetDefaults = (
  menuPresets: StoredMenuPreset[],
  quickPresetNavPresetIds: QuickPresetNavPresetIds,
  quickPresetNavIconNames: QuickPresetNavIconNames,
  quickPresetDefaultsVersion: number,
) => {
  const normalizedVersion = normalizeQuickPresetDefaultsVersion(quickPresetDefaultsVersion);
  if (normalizedVersion >= QUICK_PRESET_DEFAULTS_VERSION) {
    return {
      menuPresets: cloneMenuPresets(menuPresets),
      quickPresetDefaultsVersion: normalizedVersion,
      quickPresetNavIconNames: cloneQuickPresetNavIconNames(
        quickPresetNavIconNames,
        quickPresetNavPresetIds.length || undefined,
      ),
      quickPresetNavPresetIds: cloneQuickPresetNavPresetIds(quickPresetNavPresetIds),
    };
  }

  const existingPresetIds = new Set(menuPresets.map((preset) => preset.id));
  const missingDefaults = DEFAULT_QUICK_MENU_PRESETS.filter(
    (preset) => !existingPresetIds.has(preset.id),
  );
  const existingAssignments = cloneQuickPresetNavPresetIds(quickPresetNavPresetIds);
  const existingIconNames = cloneQuickPresetNavIconNames(
    quickPresetNavIconNames,
    DEFAULT_QUICK_PRESET_NAV_PRESET_IDS.length,
  );

  return {
    menuPresets: [
      ...cloneMenuPresets(missingDefaults),
      ...cloneMenuPresets(menuPresets),
    ],
    quickPresetDefaultsVersion: QUICK_PRESET_DEFAULTS_VERSION,
    quickPresetNavIconNames: DEFAULT_QUICK_PRESET_NAV_ICON_NAMES.map(
      (iconName, index) => existingIconNames[index] ?? iconName,
    ),
    quickPresetNavPresetIds: DEFAULT_QUICK_PRESET_NAV_PRESET_IDS.map(
      (presetId, index) => existingAssignments[index] ?? presetId,
    ),
  };
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  collapsedTodoGroupIds: [],
  dateLabelDisplayMode: 'exact',
  deletedTodos: [],
  filterConfigUiState: DEFAULT_FILTER_CONFIG_UI_STATE,
  filterColors: cloneFilterColors(),
  googleDriveBackupEnabled: false,
  googleDriveLastBackupAt: null,
  googleDriveLastRestoreAt: null,
  hideDoneTodos: false,
  lastCreateTodoFilters: cloneTodoFilters(),
  listMenuTree: cloneListMenuTree(DEFAULT_LIST_MENU_TREE),
  listOrderMode: 'alphabetical',
  menuPresets: cloneMenuPresets(DEFAULT_QUICK_MENU_PRESETS),
  navbarHiddenPresetIds: [],
  metaTagVisibility: cloneMetaTagVisibility(),
  quickPresetDefaultsVersion: QUICK_PRESET_DEFAULTS_VERSION,
  quickPresetNavIconNames: cloneQuickPresetNavIconNames(DEFAULT_QUICK_PRESET_NAV_ICON_NAMES),
  quickPresetNavPresetIds: cloneQuickPresetNavPresetIds(DEFAULT_QUICK_PRESET_NAV_PRESET_IDS),
  selectedFilters: cloneTodoFilters(),
  showOverdueMetaTags: true,
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

const normalizeDateLabelDisplayMode = (value: unknown): DateLabelDisplayMode =>
  value === 'remaining' ? 'remaining' : 'exact';

const normalizeBooleanRecordValue = (
  record: Record<string, unknown>,
  key: keyof FilterConfigExpandedSections,
) => (
  typeof record[key] === 'boolean'
    ? record[key] as boolean
    : DEFAULT_FILTER_CONFIG_UI_STATE.expandedSections[key]
);

export const normalizeFilterConfigUiState = (value: unknown): FilterConfigUiState => {
  if (!isRecord(value)) {
    return {
      expandedSections: { ...DEFAULT_FILTER_CONFIG_UI_STATE.expandedSections },
      scrollOffsetY: DEFAULT_FILTER_CONFIG_UI_STATE.scrollOffsetY,
    };
  }

  const expandedSections = isRecord(value.expandedSections) ? value.expandedSections : {};
  const scrollOffsetY = (
    typeof value.scrollOffsetY === 'number' &&
    Number.isFinite(value.scrollOffsetY) &&
    value.scrollOffsetY >= 0
  )
    ? value.scrollOffsetY
    : null;

  return {
    expandedSections: {
      lists: normalizeBooleanRecordValue(expandedSections, 'lists'),
      priority: normalizeBooleanRecordValue(expandedSections, 'priority'),
      date: normalizeBooleanRecordValue(expandedSections, 'date'),
      sort: normalizeBooleanRecordValue(expandedSections, 'sort'),
      group: normalizeBooleanRecordValue(expandedSections, 'group'),
      metaTags: normalizeBooleanRecordValue(expandedSections, 'metaTags'),
    },
    scrollOffsetY,
  };
};

export const cloneFilterConfigUiState = (
  state: FilterConfigUiState = DEFAULT_FILTER_CONFIG_UI_STATE,
): FilterConfigUiState => normalizeFilterConfigUiState(state);

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

const normalizeMenuPresetSearchKeywords = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const keywords = value.replace(/\s+/g, ' ').trim();
  return keywords ? keywords : undefined;
};

const parseOptionalTodoSortMode = (value: unknown): TodoSortMode | undefined => {
  if (
    value === 'alphabetical' ||
    value === 'date' ||
    value === 'newest' ||
    value === 'oldest' ||
    value === 'priority'
  ) {
    return value;
  }

  return undefined;
};

const parseOptionalTodoGroupMode = (value: unknown): TodoGroupMode | undefined => {
  if (
    value === 'date' ||
    value === 'list' ||
    value === 'none' ||
    value === 'priority' ||
    value === 'status'
  ) {
    return value;
  }

  return undefined;
};

export const collectListNodeLabels = (nodes: StoredListMenuNode[]): string[] => {
  const labels: string[] = [];
  const seen = new Set<string>();

  const walk = (items: StoredListMenuNode[]) => {
    for (const item of items) {
      const key = item.label.toLocaleLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        labels.push(item.label);
      }

      if (item.children?.length) {
        walk(item.children);
      }
    }
  };

  walk(nodes);
  return labels;
};

export const findListMenuNode = (
  nodes: StoredListMenuNode[],
  label: string,
): StoredListMenuNode | null => {
  const target = label.toLocaleLowerCase();

  for (const node of nodes) {
    if (node.label.toLocaleLowerCase() === target) {
      return node;
    }

    if (node.children?.length) {
      const match = findListMenuNode(node.children, label);
      if (match) {
        return match;
      }
    }
  }

  return null;
};

export type ListSubsectionContext = {
  parentLabel: string;
  subsectionLabels: string[];
};

export const resolveListDisplaySettings = (
  tree: StoredListMenuNode[],
  selectedListFilters: string[],
  globalSortMode: TodoSortMode,
  globalGroupMode: TodoGroupMode,
): ActiveListDisplaySettings => {
  if (selectedListFilters.length !== 1) {
    return {
      listLabel: null,
      isSubsectionView: false,
      sortMode: globalSortMode,
      groupMode: globalGroupMode,
    };
  }

  const listLabel = selectedListFilters[0];
  const node = findListMenuNode(tree, listLabel);
  if (!node) {
    return {
      listLabel,
      isSubsectionView: false,
      sortMode: globalSortMode,
      groupMode: globalGroupMode,
    };
  }

  if (getListSubsectionContext(tree, selectedListFilters)) {
    return {
      listLabel,
      isSubsectionView: true,
      sortMode: node.subsectionSortMode ?? globalSortMode,
      groupMode: node.subsectionGroupMode ?? globalGroupMode,
    };
  }

  return {
    listLabel,
    isSubsectionView: false,
    sortMode: node.sortMode ?? globalSortMode,
    groupMode: node.groupMode ?? globalGroupMode,
  };
};

export const updateListNodeDisplaySettings = (
  nodes: StoredListMenuNode[],
  label: string,
  isSubsectionView: boolean,
  update: {
    sortMode?: TodoSortMode;
    groupMode?: TodoGroupMode;
  },
): StoredListMenuNode[] => {
  const target = label.toLocaleLowerCase();

  return nodes.map((node) => {
    if (node.label.toLocaleLowerCase() === target) {
      if (isSubsectionView) {
        return {
          ...node,
          ...(update.sortMode !== undefined ? { subsectionSortMode: update.sortMode } : {}),
          ...(update.groupMode !== undefined ? { subsectionGroupMode: update.groupMode } : {}),
        };
      }

      return {
        ...node,
        ...(update.sortMode !== undefined ? { sortMode: update.sortMode } : {}),
        ...(update.groupMode !== undefined ? { groupMode: update.groupMode } : {}),
      };
    }

    if (!node.children?.length) {
      return node;
    }

    const children = updateListNodeDisplaySettings(node.children, label, isSubsectionView, update);
    return children === node.children ? node : { ...node, children };
  });
};

export const clearListNodeDisplaySettings = (
  nodes: StoredListMenuNode[],
  label: string,
  isSubsectionView: boolean,
  field: 'sort' | 'group' | 'both',
): StoredListMenuNode[] => {
  const target = label.toLocaleLowerCase();

  return nodes.map((node) => {
    if (node.label.toLocaleLowerCase() === target) {
      if (isSubsectionView) {
        const next = { ...node };
        if (field === 'sort' || field === 'both') {
          delete next.subsectionSortMode;
        }
        if (field === 'group' || field === 'both') {
          delete next.subsectionGroupMode;
        }
        return next;
      }

      const next = { ...node };
      if (field === 'sort' || field === 'both') {
        delete next.sortMode;
      }
      if (field === 'group' || field === 'both') {
        delete next.groupMode;
      }
      return next;
    }

    if (!node.children?.length) {
      return node;
    }

    const children = clearListNodeDisplaySettings(node.children, label, isSubsectionView, field);
    return children === node.children ? node : { ...node, children };
  });
};

export const getListSubsectionContext = (
  tree: StoredListMenuNode[],
  selectedListFilters: string[],
): ListSubsectionContext | null => {
  if (selectedListFilters.length !== 1) {
    return null;
  }

  const node = findListMenuNode(tree, selectedListFilters[0]);
  if (!node?.children?.length) {
    return null;
  }

  return {
    parentLabel: node.label,
    subsectionLabels: node.children.map((child) => child.label),
  };
};

export const todoMatchesSelectedListFilters = (
  listFilters: string[],
  todoListFilters: string[],
  tree: StoredListMenuNode[],
) => {
  if (listFilters.length === 0) {
    return true;
  }

  return listFilters.some((selectedLabel) => {
    if (todoListFilters.includes(selectedLabel)) {
      return true;
    }

    const node = findListMenuNode(tree, selectedLabel);
    if (!node?.children?.length) {
      return false;
    }

    const childLabels = new Set(node.children.map((child) => child.label));
    return todoListFilters.some((label) => childLabels.has(label));
  });
};

const normalizeListMenuTreeNodes = (
  value: unknown,
): StoredListMenuNode[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): StoredListMenuNode | null => {
      if (!isRecord(item) || typeof item.label !== 'string') {
        return null;
      }

      const label = formatListLabel(item.label);
      if (!label) {
        return null;
      }

      const children = normalizeListMenuTreeNodes(item.children);

      const sortMode = parseOptionalTodoSortMode(item.sortMode);
      const groupMode = parseOptionalTodoGroupMode(item.groupMode);
      const subsectionSortMode = parseOptionalTodoSortMode(item.subsectionSortMode);
      const subsectionGroupMode = parseOptionalTodoGroupMode(item.subsectionGroupMode);
      const iconName = typeof item.iconName === 'string' && item.iconName.trim()
        ? item.iconName.trim()
        : undefined;
      const searchKeywords = normalizeMenuPresetSearchKeywords(item.searchKeywords);

      return {
        label,
        ...(iconName ? { iconName } : {}),
        ...(searchKeywords ? { searchKeywords } : {}),
        ...(sortMode !== undefined ? { sortMode } : {}),
        ...(groupMode !== undefined ? { groupMode } : {}),
        ...(subsectionSortMode !== undefined ? { subsectionSortMode } : {}),
        ...(subsectionGroupMode !== undefined ? { subsectionGroupMode } : {}),
        children: children.length > 0 ? children : undefined,
      };
    })
    .filter((item): item is StoredListMenuNode => Boolean(item));
};

export const normalizeListMenuTree = (
  value: unknown,
  fallback: StoredListMenuNode[] = DEFAULT_LIST_MENU_TREE,
): StoredListMenuNode[] => {
  const nodes = normalizeListMenuTreeNodes(value);
  return nodes.length > 0 ? nodes : cloneListMenuTree(fallback);
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
      const searchKeywords = normalizeMenuPresetSearchKeywords(item.searchKeywords);

      return {
        id,
        label,
        ...(searchKeywords ? { searchKeywords } : {}),
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
      deletedTodos: [],
      filterConfigUiState: cloneFilterConfigUiState(),
      filterColors: cloneFilterColors(),
      hideDoneTodos: false,
      listMenuTree: cloneListMenuTree(DEFAULT_LIST_MENU_TREE),
      menuPresets: cloneMenuPresets(DEFAULT_APP_SETTINGS.menuPresets),
      quickPresetNavIconNames: cloneQuickPresetNavIconNames(
        DEFAULT_APP_SETTINGS.quickPresetNavIconNames,
      ),
      quickPresetNavPresetIds: cloneQuickPresetNavPresetIds(
        DEFAULT_APP_SETTINGS.quickPresetNavPresetIds,
      ),
      selectedFilters: cloneTodoFilters(),
      showOverdueMetaTags: true,
      todoGroupMode: 'none',
      todoSortMode: 'newest',
    };
  }

  const normalizedQuickPresetNavPresetIds = normalizeQuickPresetNavPresetIds(
    value.quickPresetNavPresetIds,
  );
  const quickPresetDefaults = ensureQuickPresetDefaults(
    normalizeMenuPresets(value.menuPresets),
    normalizedQuickPresetNavPresetIds,
    normalizeQuickPresetNavIconNames(
      value.quickPresetNavIconNames,
      normalizedQuickPresetNavPresetIds.length || undefined,
    ),
    normalizeQuickPresetDefaultsVersion(value.quickPresetDefaultsVersion),
  );
  const menuPresetIds = new Set(quickPresetDefaults.menuPresets.map((preset) => preset.id));
  const navbarHiddenPresetIds = normalizeNavbarHiddenPresetIds(value.navbarHiddenPresetIds).filter(
    (presetId) => menuPresetIds.has(presetId),
  );

  return {
    collapsedTodoGroupIds: normalizeCollapsedTodoGroupIds(value.collapsedTodoGroupIds),
    dateLabelDisplayMode: normalizeDateLabelDisplayMode(value.dateLabelDisplayMode),
    deletedTodos: normalizeDeletedTodos(value.deletedTodos),
    filterConfigUiState: normalizeFilterConfigUiState(value.filterConfigUiState),
    filterColors: normalizeFilterColors(value.filterColors),
    googleDriveBackupEnabled: value.googleDriveBackupEnabled === true,
    googleDriveLastBackupAt:
      typeof value.googleDriveLastBackupAt === 'string' ? value.googleDriveLastBackupAt : null,
    googleDriveLastRestoreAt:
      typeof value.googleDriveLastRestoreAt === 'string' ? value.googleDriveLastRestoreAt : null,
    hideDoneTodos: value.hideDoneTodos === true,
    lastCreateTodoFilters: normalizeTodoFilters(value.lastCreateTodoFilters),
    listMenuTree: normalizeListMenuTree(value.listMenuTree),
    listOrderMode: value.listOrderMode === 'manual' ? 'manual' : 'alphabetical',
    menuPresets: quickPresetDefaults.menuPresets,
    navbarHiddenPresetIds,
    metaTagVisibility: normalizeMetaTagVisibility(value.metaTagVisibility),
    quickPresetDefaultsVersion: quickPresetDefaults.quickPresetDefaultsVersion,
    quickPresetNavIconNames: quickPresetDefaults.quickPresetNavIconNames,
    quickPresetNavPresetIds: quickPresetDefaults.quickPresetNavPresetIds,
    selectedFilters: normalizeTodoFilters(value.selectedFilters),
    showOverdueMetaTags: value.showOverdueMetaTags !== false,
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
    const normalized = normalizeAppSettings(settings);
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...normalized,
        deletedTodos: cloneDeletedTodos(normalized.deletedTodos),
      }),
    );
  },
};
