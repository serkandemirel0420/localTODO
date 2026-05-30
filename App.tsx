import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { TokenResponse } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Modal,
  type GestureResponderEvent,
  NativeModules,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  State,
  Swipeable,
  TouchableOpacity as GHTouchableOpacity,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';

import {
  formatDateFilterLabel,
  getInitialDatePickerValue,
  isDateFilterOverdue,
  parseISODateLabel,
  SOMEDAY_DATE_LABEL,
  startOfDay,
  toISODateString,
} from './src/dates';
import { createTodoSearchIndex, searchTodos } from './src/search/todoSearch';
import { localTodoStore } from './src/storage/todoStore';
import {
  cloneTodoFilters,
  getTodoTextMaxLength,
  makeTodo,
  normalizeTodoFilters,
  normalizeTodoText,
  truncateTodoText,
  type Todo,
  type TodoFilters,
} from './src/todos';
import {
  createBackupPayload,
  downloadDriveBackup,
  GOOGLE_AUTH_SCOPES,
  uploadDriveBackup,
} from './src/google/driveBackup';
import {
  googleAuthStore,
  type StoredGoogleAuth,
} from './src/google/googleAuthStore';
import {
  cloneFilterColors,
  FILTER_COLOR_SWATCHES,
  getFilterColorTheme,
  getTodoColorThemes,
  getTodoPrimaryColorTheme,
  type FilterColorSettings,
} from './src/filterColors';
import {
  appSettingsStore,
  clearListNodeDisplaySettings,
  cloneListMenuTree,
  cloneMenuPresets,
  collectListNodeLabels,
  DEFAULT_LIST_MENU_TREE,
  findListMenuNode,
  getListSubsectionContext,
  resolveListDisplaySettings,
  todoMatchesSelectedListFilters,
  updateListNodeDisplaySettings,
  type AppSettings,
  type ListOrderMode,
  type ListSubsectionContext,
  type StoredListMenuNode,
  type StoredMenuPreset,
  type TodoGroupMode,
  type TodoSortMode,
} from './src/storage/appSettingsStore';

WebBrowser.maybeCompleteAuthSession();

type SwipeTodoItemProps = {
  filterColors: FilterColorSettings;
  item: Todo;
  isMenuTarget: boolean;
  layout?: 'standalone' | 'grouped';
  onDelete: (id: string) => void;
  onListTap: (event: GestureResponderEvent) => boolean;
  onOpenMenu: (id: string) => void;
  onSetDone: (id: string, done: boolean) => void;
  sectionLabel?: string;
};

type ListMenuNode = StoredListMenuNode;
type MenuPreset = StoredMenuPreset;

type VisibleListMenuItem = {
  depth: number;
  id: string;
  isSubsection: boolean;
  label: string;
  parentLabel?: string;
};

const buildVisibleListMenuItems = (
  nodes: ListMenuNode[],
  showSubsections: boolean,
): VisibleListMenuItem[] =>
  nodes.flatMap((node) => {
    const parentItem: VisibleListMenuItem = {
      depth: 0,
      id: node.label,
      isSubsection: false,
      label: node.label,
    };

    if (!showSubsections || !node.children?.length) {
      return [parentItem];
    }

    return [
      parentItem,
      ...node.children.map((child) => ({
        depth: 1,
        id: `${node.label}::${child.label}`,
        isSubsection: true,
        label: child.label,
        parentLabel: node.label,
      })),
    ];
  });

const isListMenuItemSelected = (
  item: VisibleListMenuItem,
  listFilters: string[],
  listMenuTree: ListMenuNode[],
) => {
  if (item.isSubsection) {
    return listFilters.includes(item.label);
  }

  const childLabels = findListMenuNode(listMenuTree, item.label)?.children?.map((child) => (
    child.label
  )) ?? [];

  if (childLabels.some((label) => listFilters.includes(label))) {
    return false;
  }

  return listFilters.includes(item.label);
};

type BottomMenuItem = MenuRow | VisibleListMenuItem;

type FilterKey = 'list' | 'date' | 'priority';

type MenuMode =
  | 'date'
  | 'filters'
  | 'group'
  | 'lists'
  | 'main'
  | 'presets'
  | 'presetsQuickApply'
  | 'priority'
  | 'sort';

type SelectedFilters = TodoFilters;

type TodoListRow =
  | {
      id: string;
      todo: Todo;
      type: 'todo';
    }
  | {
      count: number;
      id: string;
      label: string;
      todos: Todo[];
      type: 'section';
    };

type GoogleDriveAction = 'backup' | 'restore';

type NativeGoogleSignIn = typeof import('@react-native-google-signin/google-signin');

type ScrollToIndexFailedInfo = {
  averageItemLength: number;
  highestMeasuredFrameIndex: number;
  index: number;
};

type MenuRow =
  | {
      id: string;
      label: string;
      type: 'clearFilters';
    }
  | {
      id: string;
      label: string;
      type: 'settings';
    }
  | {
      id: string;
      label: string;
      summary: string;
      type: 'savePreset';
    }
  | {
      id: string;
      label: string;
      preset: MenuPreset;
      summary: string;
      type: 'quickApplyPreset';
    }
  | {
      id: string;
      label: string;
      preset: MenuPreset;
      summary: string;
      type: 'preset';
    }
  | {
      count?: number;
      id: string;
      label: string;
      menuMode: MenuMode;
      type: 'menu';
      valueLabel?: string;
    }
  | {
      filterKey: FilterKey;
      id: string;
      label: string;
      type: 'filter';
    }
  | {
      filterKey: FilterKey;
      id: string;
      label: string;
      type: 'value';
    }
  | {
      groupMode: TodoGroupMode;
      id: string;
      label: string;
      type: 'groupOption';
    }
  | {
      id: string;
      label: string;
      sortMode: TodoSortMode;
      type: 'sortOption';
    };

const MENU_SECTION_FILTER_KEYS: Partial<Record<MenuMode, FilterKey>> = {
  date: 'date',
  lists: 'list',
  priority: 'priority',
};

const menuSectionCanClear = (
  menuMode: MenuMode,
  filters: TodoFilters,
  activeFilterCount: number,
  sortMode: TodoSortMode,
  groupMode: TodoGroupMode,
  listMenuTree: ListMenuNode[],
  activeListDisplay: {
    listLabel: string | null;
    isSubsectionView: boolean;
  },
): boolean => {
  const filterKey = MENU_SECTION_FILTER_KEYS[menuMode];
  if (filterKey) {
    return filters[filterKey].length > 0;
  }

  if (menuMode === 'filters') {
    return activeFilterCount > 0;
  }

  if (menuMode === 'sort') {
    if (activeListDisplay.listLabel) {
      const node = findListMenuNode(listMenuTree, activeListDisplay.listLabel);
      return activeListDisplay.isSubsectionView
        ? node?.subsectionSortMode !== undefined
        : node?.sortMode !== undefined;
    }

    return sortMode !== 'newest';
  }

  if (menuMode === 'group') {
    if (activeListDisplay.listLabel) {
      const node = findListMenuNode(listMenuTree, activeListDisplay.listLabel);
      return activeListDisplay.isSubsectionView
        ? node?.subsectionGroupMode !== undefined
        : node?.groupMode !== undefined;
    }

    return groupMode !== 'none';
  }

  return false;
};

const TODO_ACTION_WIDTH = 68;
const TODO_LEFT_ACTION_MENU_WIDTH = TODO_ACTION_WIDTH * 2;
const TODO_RIGHT_ACTION_MENU_WIDTH = TODO_ACTION_WIDTH;
const TOP_SAFE_GAP = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 12 : 16;
const HORIZONTAL_PADDING = 16;
const FONT_REGULAR = '400' as const;
const FONT_MEDIUM = '500' as const;
const FONT_SEMIBOLD = '600' as const;
const THEME_BG = '#F4F6F8';
const THEME_CARD = '#FFFFFF';
const THEME_TEXT = '#212121';
const THEME_TEXT_SECONDARY = '#8E8E93';
const THEME_ACCENT = '#4C78FF';
const THEME_ACCENT_SOFT = '#E8EEFF';
const THEME_DANGER = '#D32F2F';
const THEME_BORDER = '#E8EAED';
const PULL_MAX = 178;
const DOUBLE_TAP_DELAY = 300;
const EDGE_BACK_WIDTH = 28;
const TODO_SWIPE_OPEN_DISTANCE = 62;
const LIST_MENU_HEIGHT_RATIO = 0.5;
const NAV_ACCENT = THEME_ACCENT;
const NAV_ICON_INACTIVE = THEME_TEXT_SECONDARY;
const BOTTOM_NAV_HEIGHT = 56;
const LIST_MENU_BOTTOM_OFFSET = BOTTOM_NAV_HEIGHT + 10;
const LIST_MENU_ONE_HANDED_SCROLL_RATIO = 0.35;
const MENU_DISMISS_RELEASE = 52;
const MENU_DISMISS_VELOCITY = 680;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const MISSING_GOOGLE_CLIENT_ID = 'missing-google-client-id.apps.googleusercontent.com';
const LIST_MENU_ROW_HEIGHT = 52;
const LIST_MENU_ICON_HIT_SLOP = 14;
const TODO_MENU_TARGET_ESTIMATED_HEIGHT = 104;
const TODO_MENU_TARGET_GAP = 16;
const TODO_MENU_TARGET_TOP_OFFSET = 12;
const PRESET_SWIPE_DELETE_WIDTH = 72;
const PRIORITY_MENU_ITEMS = ['High', 'Medium', 'Low', 'None'];
const DATE_MENU_ITEMS = ['Today', 'Tomorrow', 'This week', 'Next week', 'Someday'];
const NOT_SECTIONED_LABEL = 'Not Sectioned';
const FILTER_KIND_LABELS: Record<FilterKey, string> = {
  list: 'List',
  date: 'Date',
  priority: 'Priority',
};

type SearchFilterItem = {
  filterKey: FilterKey;
  id: string;
  label: string;
};

const buildActiveFilterItems = (filters: SelectedFilters): SearchFilterItem[] =>
  (Object.entries(filters) as Array<[FilterKey, string[]]>).flatMap(([filterKey, values]) =>
    values.map((label) => ({
      filterKey,
      id: `search-filter-${filterKey}-${label}`,
      label,
    })),
  );

type NavTab = 'calendar' | 'menu' | 'search' | 'settings';

type CreateDrawerPicker = 'date' | 'list' | 'priority';

const getDefaultCreateDraftFilters = (
  listMenuTree: ListMenuNode[],
): SelectedFilters => ({
  date: ['Today'],
  list: listMenuTree[0]?.label ? [listMenuTree[0].label] : ['Inbox'],
  priority: [],
});

const formatCreateDrawerDateLabel = (dateLabels: string[]) => {
  const primary = dateLabels[0];

  if (!primary) {
    return 'No date';
  }

  const today = new Date();
  const monthDay = today.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  if (primary === 'Today') {
    return `Today, ${monthDay}`;
  }

  if (primary === 'Tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return `Tomorrow, ${tomorrow.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })}`;
  }

  return formatDateFilterLabel(primary);
};
const TODO_SORT_OPTIONS: Array<{ label: string; mode: TodoSortMode }> = [
  { label: 'Newest first', mode: 'newest' },
  { label: 'Oldest first', mode: 'oldest' },
  { label: 'A to Z', mode: 'alphabetical' },
  { label: 'Priority', mode: 'priority' },
  { label: 'Date', mode: 'date' },
];
const TODO_GROUP_OPTIONS: Array<{ label: string; mode: TodoGroupMode }> = [
  { label: 'None', mode: 'none' },
  { label: 'Priority', mode: 'priority' },
  { label: 'Date', mode: 'date' },
  { label: 'List', mode: 'list' },
  { label: 'Status', mode: 'status' },
];
const TODO_SORT_LABELS: Record<TodoSortMode, string> = {
  alphabetical: 'A to Z',
  date: 'Date',
  newest: 'Newest',
  oldest: 'Oldest',
  priority: 'Priority',
};
const TODO_GROUP_LABELS: Record<TodoGroupMode, string> = {
  date: 'Date',
  list: 'List',
  none: 'None',
  priority: 'Priority',
  status: 'Status',
};
const EMPTY_SELECTED_FILTERS: SelectedFilters = {
  date: [],
  list: [],
  priority: [],
};
const INITIAL_TODOS = Array.from({ length: 50 }, (_, index) => ({
  id: `seed-${index + 1}`,
  text: `Todo item ${index + 1}`,
  done: false,
  createdAt: Date.now() - index,
  filters: cloneTodoFilters(),
}));

const withInitialTodos = (storedTodos: Todo[]) => {
  const storedIds = new Set(storedTodos.map((todo) => todo.id));
  const missingSeeds = INITIAL_TODOS.filter((todo) => !storedIds.has(todo.id));

  return [...storedTodos, ...missingSeeds];
};

const getGoogleClientIdForPlatform = () => {
  if (Platform.OS === 'ios') {
    return GOOGLE_IOS_CLIENT_ID;
  }

  if (Platform.OS === 'android') {
    return GOOGLE_ANDROID_CLIENT_ID;
  }

  return GOOGLE_WEB_CLIENT_ID;
};

const isGoogleOAuthConfigured = () => Boolean(getGoogleClientIdForPlatform());

const formatBackupTime = (value: string | null) =>
  value ? new Date(value).toLocaleString() : null;

const triggerLightTickHaptic = () => {
  const feedback = Platform.OS === 'android'
    ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick)
    : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

  feedback.catch(() => undefined);
};

const googleAuthToStoredAuth = (auth: TokenResponse): StoredGoogleAuth => ({
  accessToken: auth.accessToken,
  expiresIn: auth.expiresIn,
  idToken: auth.idToken,
  issuedAt: auth.issuedAt,
  refreshToken: auth.refreshToken,
  scope: auth.scope,
  tokenType: auth.tokenType,
});

const googleNativeTokenToStoredAuth = (
  accessToken: string,
  idToken?: string | null,
): StoredGoogleAuth => ({
  accessToken,
  expiresIn: 3500,
  idToken: idToken ?? undefined,
  issuedAt: Math.floor(Date.now() / 1000),
  scope: GOOGLE_AUTH_SCOPES.join(' '),
  tokenType: 'bearer',
});

const normalizeNativeGoogleSignInError = (error: unknown, stage = 'Google sign-in') => {
  const message = error instanceof Error ? error.message : String(error);
  const stagePrefix = stage ? `${stage}: ` : '';

  if (
    message.includes('RNGoogleSignin') ||
    message.includes('TurboModuleRegistry') ||
    message.includes('NativeModule') ||
    message.includes('not implemented')
  ) {
    return new Error(`${stagePrefix}Android Google sign-in needs a development build. Expo Go cannot run this native Google module.`);
  }

  if (message.includes('DEVELOPER_ERROR')) {
    return new Error(`${stagePrefix}Google Android OAuth setup does not match this build. Check package name com.localtodo.app and the SHA-1 certificate fingerprint.`);
  }

  return error instanceof Error ? new Error(`${stagePrefix}${error.message}`) : new Error(`${stagePrefix}${message}`);
};

const assertNativeGoogleSignInAvailable = () => {
  if (!NativeModules.RNGoogleSignin) {
    throw new Error('Install the new Android development APK first. The current app does not include Google Sign-In yet.');
  }
};

const sortListMenuTree = (nodes: ListMenuNode[]): ListMenuNode[] =>
  [...nodes]
    .sort((first, second) => first.label.localeCompare(second.label))
    .map((node) => ({
      ...node,
      children: node.children ? sortListMenuTree(node.children) : undefined,
    }));

const countFilters = (filters: SelectedFilters) =>
  filters.date.length + filters.list.length + filters.priority.length;

const formatPresetCount = (count: number, label: string) =>
  `${count} ${label}${count === 1 ? '' : 's'}`;

const formatPresetSummary = (
  filters: SelectedFilters,
  sortMode: TodoSortMode,
  groupMode: TodoGroupMode,
  orderMode: ListOrderMode,
) => {
  const parts = [
    filters.list.length > 0 ? formatPresetCount(filters.list.length, 'list') : null,
    filters.priority.length > 0 ? formatPresetCount(filters.priority.length, 'priority') : null,
    filters.date.length > 0 ? formatPresetCount(filters.date.length, 'date') : null,
    `Sort ${TODO_SORT_LABELS[sortMode]}`,
    `Group ${TODO_GROUP_LABELS[groupMode]}`,
    orderMode === 'alphabetical' ? 'Lists A to Z' : 'Manual lists',
  ].filter((part): part is string => Boolean(part));

  return parts.join(' · ');
};

const todoMatchesFilters = (
  todo: Todo,
  filters: SelectedFilters,
  listMenuTree: ListMenuNode[],
) =>
  (Object.entries(filters) as Array<[FilterKey, string[]]>).every(([filterKey, values]) => {
    if (values.length === 0) {
      return true;
    }

    if (filterKey === 'list') {
      return todoMatchesSelectedListFilters(values, todo.filters.list, listMenuTree);
    }

    return values.some((value) => todo.filters[filterKey].includes(value));
  });

const getFilterRank = (values: string[], orderedLabels: string[]) =>
  values.reduce((bestRank, value) => {
    const rank = orderedLabels.indexOf(value);
    return rank >= 0 ? Math.min(bestRank, rank) : bestRank;
  }, orderedLabels.length);

const getBestOrderedFilterLabel = (
  values: string[],
  orderedLabels: string[],
  fallbackLabel: string,
) => {
  let bestLabel: string | null = null;
  let bestRank = Number.POSITIVE_INFINITY;

  values.forEach((value, index) => {
    const orderedIndex = orderedLabels.indexOf(value);
    const rank = orderedIndex >= 0 ? orderedIndex : orderedLabels.length + index;

    if (rank < bestRank) {
      bestRank = rank;
      bestLabel = value;
    }
  });

  return bestLabel ?? fallbackLabel;
};

const compareTodosByFallback = (first: Todo, second: Todo) =>
  second.createdAt - first.createdAt ||
  first.text.localeCompare(second.text) ||
  first.id.localeCompare(second.id);

const compareTodosBySortMode = (
  first: Todo,
  second: Todo,
  sortMode: TodoSortMode,
) => {
  if (sortMode === 'oldest') {
    return (
      first.createdAt - second.createdAt ||
      first.text.localeCompare(second.text) ||
      first.id.localeCompare(second.id)
    );
  }

  if (sortMode === 'alphabetical') {
    return first.text.localeCompare(second.text) || compareTodosByFallback(first, second);
  }

  if (sortMode === 'priority') {
    return (
      getFilterRank(first.filters.priority, PRIORITY_MENU_ITEMS) -
      getFilterRank(second.filters.priority, PRIORITY_MENU_ITEMS) ||
      compareTodosByFallback(first, second)
    );
  }

  if (sortMode === 'date') {
    return (
      getFilterRank(first.filters.date, DATE_MENU_ITEMS) -
      getFilterRank(second.filters.date, DATE_MENU_ITEMS) ||
      compareTodosByFallback(first, second)
    );
  }

  return compareTodosByFallback(first, second);
};

const getTodoListGroupLabel = (
  todo: Todo,
  orderedListLabels: string[],
  listMenuTree: ListMenuNode[],
) => {
  for (const parent of listMenuTree) {
    if (!parent.children?.length) {
      continue;
    }

    const matchedChild = parent.children.find((child) => (
      todo.filters.list.includes(child.label)
    ));
    if (matchedChild) {
      const childRank = orderedListLabels.indexOf(matchedChild.label);
      return {
        key: matchedChild.label,
        label: matchedChild.label,
        rank: childRank >= 0 ? childRank : orderedListLabels.length + 1,
      };
    }

    if (todo.filters.list.includes(parent.label)) {
      const parentRank = orderedListLabels.indexOf(parent.label);
      return {
        key: `${parent.label}::${NOT_SECTIONED_LABEL}`,
        label: NOT_SECTIONED_LABEL,
        rank: parentRank >= 0 ? parentRank : orderedListLabels.length + 1,
      };
    }
  }

  const label = getBestOrderedFilterLabel(todo.filters.list, orderedListLabels, 'No list');
  const rank = orderedListLabels.indexOf(label);

  return {
    key: label,
    label,
    rank: rank >= 0 ? rank : orderedListLabels.length + 1,
  };
};

const getTodoGroup = (
  todo: Todo,
  groupMode: Exclude<TodoGroupMode, 'none'>,
  orderedListLabels: string[],
  listMenuTree: ListMenuNode[],
) => {
  if (groupMode === 'status') {
    const label = todo.done ? 'Done' : 'Active';
    return {
      key: label,
      label,
      rank: todo.done ? 1 : 0,
    };
  }

  if (groupMode === 'list') {
    return getTodoListGroupLabel(todo, orderedListLabels, listMenuTree);
  }

  if (groupMode === 'priority') {
    const label = getBestOrderedFilterLabel(todo.filters.priority, PRIORITY_MENU_ITEMS, 'No priority');
    const rank = PRIORITY_MENU_ITEMS.indexOf(label);

    return {
      key: label,
      label,
      rank: rank >= 0 ? rank : PRIORITY_MENU_ITEMS.length + 1,
    };
  }

  const rawLabel = getBestOrderedFilterLabel(todo.filters.date, DATE_MENU_ITEMS, 'No date');
  const presetRank = DATE_MENU_ITEMS.indexOf(rawLabel);
  const customDate = parseISODateLabel(rawLabel);

  return {
    key: rawLabel,
    label: formatDateFilterLabel(rawLabel),
    rank: presetRank >= 0
      ? presetRank
      : customDate
        ? DATE_MENU_ITEMS.length + customDate.getTime() / 1e12
        : DATE_MENU_ITEMS.length + 1,
  };
};

const todoBelongsToListParent = (
  todo: Todo,
  parentLabel: string,
  subsectionLabels: string[],
) => {
  if (todo.filters.list.includes(parentLabel)) {
    return true;
  }

  return subsectionLabels.some((label) => todo.filters.list.includes(label));
};

const getTodoSubsectionLabel = (
  todo: Todo,
  context: ListSubsectionContext,
) => {
  const matchedSubsection = context.subsectionLabels.find((label) => (
    todo.filters.list.includes(label)
  ));

  return matchedSubsection ?? NOT_SECTIONED_LABEL;
};

const buildSubsectionRows = (
  todos: Todo[],
  context: ListSubsectionContext,
  sortMode: TodoSortMode,
  collapsedGroupIds: ReadonlySet<string>,
): TodoListRow[] => {
  const scopedTodos = todos.filter((todo) => (
    todoBelongsToListParent(todo, context.parentLabel, context.subsectionLabels)
  ));
  const buckets = new Map<string, Todo[]>(
    [NOT_SECTIONED_LABEL, ...context.subsectionLabels].map((label) => [label, []]),
  );

  scopedTodos.forEach((todo) => {
    const bucket = buckets.get(getTodoSubsectionLabel(todo, context)) ?? buckets.get(NOT_SECTIONED_LABEL);
    bucket?.push(todo);
  });

  const sectionOrder = [NOT_SECTIONED_LABEL, ...context.subsectionLabels];

  return sectionOrder.map((label) => {
    const sectionTodos = [...(buckets.get(label) ?? [])].sort((first, second) => (
      compareTodosBySortMode(first, second, sortMode)
    ));
    const sectionId = `subsection-${context.parentLabel}-${label}`;

    return {
      count: sectionTodos.length,
      id: sectionId,
      label,
      todos: collapsedGroupIds.has(sectionId) ? [] : sectionTodos,
      type: 'section' as const,
    };
  });
};

const buildGroupedSectionRows = (
  todos: Todo[],
  groupMode: Exclude<TodoGroupMode, 'none'>,
  orderedListLabels: string[],
  listMenuTree: ListMenuNode[],
  collapsedGroupIds: ReadonlySet<string>,
): TodoListRow[] => {
  const groups = new Map<string, { key: string; label: string; rank: number; todos: Todo[] }>();

  todos.forEach((todo) => {
    const group = getTodoGroup(todo, groupMode, orderedListLabels, listMenuTree);
    const existingGroup = groups.get(group.key);

    if (existingGroup) {
      existingGroup.todos.push(todo);
      return;
    }

    groups.set(group.key, {
      key: group.key,
      label: group.label,
      rank: group.rank,
      todos: [todo],
    });
  });

  return [...groups.values()]
    .sort((first, second) => first.rank - second.rank || first.label.localeCompare(second.label))
    .map((group) => {
      const groupId = `group-${groupMode}-${group.key}`;

      return {
        count: group.todos.length,
        id: groupId,
        label: group.label,
        todos: collapsedGroupIds.has(groupId) ? [] : group.todos,
        type: 'section' as const,
      };
    });
};

const buildTodoListRows = (
  todos: Todo[],
  sortMode: TodoSortMode,
  groupMode: TodoGroupMode,
  orderedListLabels: string[],
  listMenuTree: ListMenuNode[],
  selectedListFilters: string[],
  collapsedGroupIds: ReadonlySet<string>,
  useSubsectionLayout: boolean,
): TodoListRow[] => {
  const subsectionContext = useSubsectionLayout
    ? getListSubsectionContext(listMenuTree, selectedListFilters)
    : null;

  if (subsectionContext) {
    return buildSubsectionRows(todos, subsectionContext, sortMode, collapsedGroupIds);
  }

  if (groupMode === 'none') {
    return todos.map((todo) => ({
      id: todo.id,
      todo,
      type: 'todo',
    }));
  }

  return buildGroupedSectionRows(
    todos,
    groupMode,
    orderedListLabels,
    listMenuTree,
    collapsedGroupIds,
  );
};

const isOverdueStatusLabel = (label: string) => /overdue/i.test(label);

function SwipeTodoItem({
  filterColors,
  item,
  isMenuTarget,
  layout = 'standalone',
  onDelete,
  onListTap,
  onOpenMenu,
  onSetDone,
  sectionLabel,
}: SwipeTodoItemProps) {
  const swipeableRef = useRef<Swipeable | null>(null);
  const [isSwipeOpen, setIsSwipeOpen] = useState(false);
  const [isMenuSwipeActive, setIsMenuSwipeActive] = useState(false);

  const closeActionMenu = useCallback(() => {
    swipeableRef.current?.close();
    setIsSwipeOpen(false);
    setIsMenuSwipeActive(false);
  }, []);

  const toggleFromAction = useCallback(() => {
    onSetDone(item.id, !item.done);
    Haptics.selectionAsync().catch(() => undefined);
    requestAnimationFrame(() => {
      closeActionMenu();
    });
  }, [closeActionMenu, item.done, item.id, onSetDone]);

  const deleteFromAction = useCallback(() => {
    closeActionMenu();
    requestAnimationFrame(() => onDelete(item.id));
  }, [closeActionMenu, item.id, onDelete]);

  const openMenuFromAction = useCallback(() => {
    onOpenMenu(item.id);
    closeActionMenu();
  }, [closeActionMenu, item.id, onOpenMenu]);

  const handleTodoPress = useCallback((event?: GestureResponderEvent) => {
    if (isSwipeOpen) {
      closeActionMenu();
      return;
    }

    if (event) {
      onListTap(event);
    }
  }, [
    closeActionMenu,
    isSwipeOpen,
    onListTap,
  ]);

  const handleSwipeableWillOpen = useCallback(
    (direction: 'left' | 'right') => {
      setIsSwipeOpen(true);

      if (direction === 'right') {
        setIsMenuSwipeActive(true);
        openMenuFromAction();
        return;
      }

      setIsMenuSwipeActive(false);
      Haptics.selectionAsync().catch(() => undefined);
    },
    [openMenuFromAction],
  );

  const handleSwipeableWillClose = useCallback((direction: 'left' | 'right') => {
    if (direction === 'right') {
      setIsMenuSwipeActive(false);
    }
  }, []);

  const handleSwipeableOpenStartDrag = useCallback((direction: 'left' | 'right') => {
    setIsMenuSwipeActive(direction === 'right');
  }, []);

  const handleSwipeableClose = useCallback(() => {
    setIsSwipeOpen(false);
    setIsMenuSwipeActive(false);
  }, []);

  const renderLeftActions = useCallback(
    () => (
      <View style={styles.todoSwipeLeftActions}>
        <GHTouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={item.done ? 'Mark todo active' : 'Mark todo done'}
          activeOpacity={0.82}
          onPress={toggleFromAction}
          style={[styles.todoActionButton, styles.todoActionDone]}
        >
          <Text style={styles.todoActionIcon}>{item.done ? '↩' : '✓'}</Text>
        </GHTouchableOpacity>
        <GHTouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Delete todo"
          activeOpacity={0.82}
          onPress={deleteFromAction}
          style={[styles.todoActionButton, styles.todoActionDelete]}
        >
          <Text style={styles.todoActionIcon}>⌫</Text>
        </GHTouchableOpacity>
      </View>
    ),
    [deleteFromAction, item.done, toggleFromAction],
  );

  const renderRightActions = useCallback(
    () => (
      <View style={styles.todoSwipeRightActions}>
        <GHTouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Open item settings"
          activeOpacity={0.82}
          onPress={openMenuFromAction}
          style={[styles.todoActionButton, styles.todoActionMore]}
        >
          <Text style={styles.todoActionIcon}>☰</Text>
        </GHTouchableOpacity>
      </View>
    ),
    [openMenuFromAction],
  );
  const todoColorTheme = getTodoPrimaryColorTheme(item.filters, filterColors);
  const todoColorDots = getTodoColorThemes(item.filters, filterColors).slice(0, 5);
  const isHighlightedForMenu = isMenuTarget || isMenuSwipeActive;
  const isGroupedLayout = layout === 'grouped';
  const rawDateStatusLabel = getBestOrderedFilterLabel(
    item.filters.date,
    DATE_MENU_ITEMS,
    '',
  );
  const dateStatusLabel = rawDateStatusLabel
    ? formatDateFilterLabel(rawDateStatusLabel)
    : '';
  const listStatusLabel = item.filters.list[0] ?? '';
  const showDateStatus = dateStatusLabel.length > 0;
  const showListStatus = listStatusLabel.length > 0;
  const dateStatusIsOverdue = isOverdueStatusLabel(dateStatusLabel)
    || isDateFilterOverdue(rawDateStatusLabel)
    || (sectionLabel ? isOverdueStatusLabel(sectionLabel) : false);

  const toggleDoneFromCheckbox = useCallback(() => {
    onSetDone(item.id, !item.done);
    Haptics.selectionAsync().catch(() => undefined);
  }, [item.done, item.id, onSetDone]);

  return (
    <View style={[styles.swipeShell, isGroupedLayout && styles.swipeShellGrouped]}>
      <Swipeable
        ref={swipeableRef}
        childrenContainerStyle={styles.todoSwipeableChildren}
        containerStyle={styles.todoSwipeableContainer}
        friction={1.1}
        leftThreshold={TODO_SWIPE_OPEN_DISTANCE}
        animationOptions={{ bounciness: 0, speed: 28 }}
        onSwipeableClose={handleSwipeableClose}
        onSwipeableOpenStartDrag={handleSwipeableOpenStartDrag}
        onSwipeableWillOpen={handleSwipeableWillOpen}
        onSwipeableWillClose={handleSwipeableWillClose}
        overshootLeft={false}
        overshootRight={false}
        renderLeftActions={renderLeftActions}
        renderRightActions={renderRightActions}
        rightThreshold={TODO_SWIPE_OPEN_DISTANCE}
      >
        <View
          style={[
            styles.todoRow,
            isGroupedLayout && styles.todoRowGrouped,
            !isGroupedLayout && todoColorTheme && !item.done && {
              backgroundColor: todoColorTheme.tint,
              borderColor: todoColorTheme.border,
              shadowColor: todoColorTheme.accent,
            },
            item.done && styles.todoRowDone,
            isHighlightedForMenu && styles.todoRowMenuTarget,
          ]}
        >
          {!isGroupedLayout && todoColorTheme ? (
            <View
              style={[
                styles.todoColorRail,
                { backgroundColor: todoColorTheme.accent },
                item.done && styles.todoColorRailDone,
              ]}
            />
          ) : null}
          <GHTouchableOpacity
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.done }}
            accessibilityLabel={item.done ? 'Mark todo active' : 'Mark todo done'}
            activeOpacity={0.72}
            onPress={toggleDoneFromCheckbox}
            style={styles.todoCheckboxPressable}
          >
            <View
              style={[
                styles.todoCheckbox,
                item.done && styles.todoCheckboxChecked,
              ]}
            >
              {item.done ? (
                <Ionicons color={THEME_CARD} name="checkmark" size={14} />
              ) : null}
            </View>
          </GHTouchableOpacity>
          <GHTouchableOpacity
            accessibilityRole="button"
            activeOpacity={1}
            onPress={handleTodoPress}
            style={styles.todoTextPressable}
          >
            <Text
              numberOfLines={2}
              style={[styles.todoText, item.done && styles.todoTextDone]}
            >
              {item.text}
            </Text>
            {(showDateStatus || showListStatus) ? (
              <View style={styles.todoMetaRow}>
                {showDateStatus ? (
                  <Text
                    style={[
                      styles.todoMetaDate,
                      dateStatusIsOverdue && styles.todoMetaDateOverdue,
                    ]}
                  >
                    {dateStatusLabel}
                  </Text>
                ) : (
                  <View style={styles.todoMetaSpacer} />
                )}
                {showListStatus ? (
                  <Text style={styles.todoMetaList}>{listStatusLabel}</Text>
                ) : null}
              </View>
            ) : null}
            {!isGroupedLayout && todoColorDots.length > 0 ? (
              <View style={styles.todoColorDotRow}>
                {todoColorDots.map((theme) => (
                  <View
                    key={`${theme.filterKey}-${theme.value}`}
                    style={[
                      styles.todoColorDot,
                      { backgroundColor: theme.accent },
                      item.done && styles.todoColorDotDone,
                    ]}
                  />
                ))}
              </View>
            ) : null}
          </GHTouchableOpacity>
        </View>
      </Swipeable>
    </View>
  );
}

const MemoizedSwipeTodoItem = React.memo(SwipeTodoItem);

type MenuPresetSwipeRowProps = {
  label: string;
  onApply: () => void;
  onDelete: () => void;
  summary: string;
};

function MenuPresetSwipeRow({ label, onApply, onDelete, summary }: MenuPresetSwipeRowProps) {
  const renderRightActions = useCallback(
    () => (
      <View style={styles.listMenuPresetSwipeActions}>
        <GHTouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Delete ${label}`}
          activeOpacity={0.82}
          onPress={onDelete}
          style={styles.listMenuPresetSwipeDelete}
        >
          <Ionicons color="#FFFFFF" name="trash-outline" size={22} />
        </GHTouchableOpacity>
      </View>
    ),
    [label, onDelete],
  );

  return (
    <View style={styles.listMenuPresetSwipeShell}>
      <Swipeable
        childrenContainerStyle={styles.listMenuPresetSwipeChildren}
        containerStyle={styles.listMenuPresetSwipeContainer}
        friction={1.1}
        overshootRight={false}
        renderRightActions={renderRightActions}
        rightThreshold={PRESET_SWIPE_DELETE_WIDTH}
      >
        <GHTouchableOpacity
          accessibilityRole="button"
          activeOpacity={1}
          onPress={onApply}
          style={styles.listMenuPresetRow}
        >
          <View style={styles.listMenuRowTextStack}>
            <Text style={styles.listMenuRowTitle}>{label}</Text>
            <Text numberOfLines={1} style={styles.listMenuRowSummary}>
              {summary}
            </Text>
          </View>
          <Text style={styles.listMenuApplyText}>Apply</Text>
        </GHTouchableOpacity>
      </Swipeable>
    </View>
  );
}

const MemoizedMenuPresetSwipeRow = React.memo(MenuPresetSwipeRow);

export default function App() {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const todoTextMaxLength = useMemo(
    () => getTodoTextMaxLength(windowWidth),
    [windowWidth],
  );
  const listMenuHeight = Math.round(windowHeight * LIST_MENU_HEIGHT_RATIO);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [createDrawerKeyboardInset, setCreateDrawerKeyboardInset] = useState(0);
  const [query, setQuery] = useState('');
  const [createDrawerVisible, setCreateDrawerVisible] = useState(false);
  const [createDraftText, setCreateDraftText] = useState('');
  const [createDraftFilters, setCreateDraftFilters] = useState<SelectedFilters>(
    () => getDefaultCreateDraftFilters(DEFAULT_LIST_MENU_TREE),
  );
  const [createDrawerPicker, setCreateDrawerPicker] = useState<CreateDrawerPicker | null>(
    null,
  );
  const [createDraftPriorityFromPicker, setCreateDraftPriorityFromPicker] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [datePickerValue, setDatePickerValue] = useState(() => startOfDay(new Date()));
  const datePickerApplyRef = useRef<'create' | 'filters'>('filters');
  const [loaded, setLoaded] = useState(false);
  const [navTab, setNavTab] = useState<NavTab | null>(null);
  const [menuMode, setMenuMode] = useState<MenuMode | null>(null);
  const [activeTodoMenuId, setActiveTodoMenuId] = useState<string | null>(null);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [presetSaveModalVisible, setPresetSaveModalVisible] = useState(false);
  const [presetSaveName, setPresetSaveName] = useState('');
  const [settingsBackupExpanded, setSettingsBackupExpanded] = useState(false);
  const [settingsColorsExpanded, setSettingsColorsExpanded] = useState(true);
  const [settingsListsExpanded, setSettingsListsExpanded] = useState(true);
  const [filterColors, setFilterColors] = useState<FilterColorSettings>(
    () => cloneFilterColors(),
  );
  const [googleDriveBackupEnabled, setGoogleDriveBackupEnabled] = useState(false);
  const [googleDriveBusy, setGoogleDriveBusy] = useState(false);
  const [googleDriveBackupStatus, setGoogleDriveBackupStatus] = useState('Not backed up');
  const [googleDriveLastBackupAt, setGoogleDriveLastBackupAt] = useState<string | null>(null);
  const [googleDriveLastRestoreAt, setGoogleDriveLastRestoreAt] = useState<string | null>(null);
  const [googleAuth, setGoogleAuth] = useState<StoredGoogleAuth | null>(null);
  const [listOrderMode, setListOrderMode] = useState<ListOrderMode>('alphabetical');
  const [listMenuTree, setListMenuTree] = useState<ListMenuNode[]>(
    () => cloneListMenuTree(DEFAULT_LIST_MENU_TREE),
  );
  const [menuPresets, setMenuPresets] = useState<MenuPreset[]>([]);
  const [todoGroupMode, setTodoGroupMode] = useState<TodoGroupMode>('none');
  const [collapsedTodoGroupIds, setCollapsedTodoGroupIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [todoSortMode, setTodoSortMode] = useState<TodoSortMode>('newest');
  const [newListName, setNewListName] = useState('');
  const [newSubsectionName, setNewSubsectionName] = useState('');
  const [subsectionParentIndex, setSubsectionParentIndex] = useState<number | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<SelectedFilters>(
    EMPTY_SELECTED_FILTERS,
  );
  const [isListMenuAtTop, setIsListMenuAtTop] = useState(true);
  const [todoListFrameHeight, setTodoListFrameHeight] = useState(0);
  const searchInputRef = useRef<TextInput>(null);
  const createInputRef = useRef<TextInput>(null);
  const presetSaveInputRef = useRef<TextInput>(null);
  const listMenuRef = useRef<FlatList<BottomMenuItem> | null>(null);
  const todoListRef = useRef<FlatList<TodoListRow> | null>(null);
  const scrollOffsetY = useRef(0);
  const listMenuScrollOffsetY = useRef(0);
  const menuPullAnim = useRef(new Animated.Value(0)).current;
  const menuModeRef = useRef<MenuMode | null>(null);
  const menuDismissPullRef = useRef(0);
  const menuDismissHapticRef = useRef(0);
  const didApplyTodoListInitialOffsetRef = useRef(false);
  const hadTodoListRowsRef = useRef(false);
  const listTouchStartRef = useRef({ pageX: 0, pageY: 0, timestamp: 0 });
  const lastListTapRef = useRef({ pageX: 0, pageY: 0, timestamp: 0 });
  const lastRegisteredListTapRef = useRef({ pageX: 0, pageY: 0, timestamp: 0 });
  const listMenuOpen = menuMode !== null;
  const submenuOpen = menuMode !== null && menuMode !== 'main';
  menuModeRef.current = menuMode;
  const listMenuOneHandedOffset = useMemo(
    () => Math.max(
      LIST_MENU_ROW_HEIGHT,
      Math.round(
        (listMenuHeight * LIST_MENU_ONE_HANDED_SCROLL_RATIO) /
          LIST_MENU_ROW_HEIGHT,
      ) * LIST_MENU_ROW_HEIGHT,
    ),
    [listMenuHeight],
  );
  const googleOAuthConfigured = isGoogleOAuthConfigured();
  const googleConnected = Boolean(googleAuth?.accessToken);

  const [googleRequest, , promptGoogleAuth] = Google.useAuthRequest({
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || MISSING_GOOGLE_CLIENT_ID,
    extraParams: {
      access_type: 'offline',
      prompt: 'consent select_account',
    },
    iosClientId: GOOGLE_IOS_CLIENT_ID || MISSING_GOOGLE_CLIENT_ID,
    scopes: GOOGLE_AUTH_SCOPES,
    webClientId: GOOGLE_WEB_CLIENT_ID || MISSING_GOOGLE_CLIENT_ID,
  });
  const googleDriveActionReady =
    googleOAuthConfigured && (Platform.OS === 'android' || Boolean(googleRequest));

  useEffect(() => {
    let alive = true;

    localTodoStore
      .load()
      .then((storedTodos) => {
        if (!alive) {
          return;
        }

        setTodos(withInitialTodos(storedTodos));
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) {
          setLoaded(true);
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    localTodoStore.save(todos).catch(() => undefined);
  }, [loaded, todos]);

  useEffect(() => {
    let alive = true;

    Promise.all([
      appSettingsStore.load(),
      googleAuthStore.load(),
    ])
      .then(([settings, storedGoogleAuth]) => {
        if (!alive) {
          return;
        }

        setSelectedFilters(settings.selectedFilters);
        setFilterColors(settings.filterColors);
        setGoogleDriveBackupEnabled(settings.googleDriveBackupEnabled);
        setGoogleDriveLastBackupAt(settings.googleDriveLastBackupAt);
        setGoogleDriveLastRestoreAt(settings.googleDriveLastRestoreAt);
        setListMenuTree(settings.listMenuTree);
        setListOrderMode(settings.listOrderMode);
        setMenuPresets(cloneMenuPresets(settings.menuPresets));
        setTodoGroupMode(settings.todoGroupMode);
        setCollapsedTodoGroupIds(new Set(settings.collapsedTodoGroupIds));
        setTodoSortMode(settings.todoSortMode);

        const lastBackup = formatBackupTime(settings.googleDriveLastBackupAt);
        setGoogleDriveBackupStatus(lastBackup ? `Last backup ${lastBackup}` : 'Not backed up');
        setGoogleAuth(storedGoogleAuth);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) {
          setSettingsLoaded(true);
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    const settings: AppSettings = {
      collapsedTodoGroupIds: [...collapsedTodoGroupIds],
      filterColors,
      googleDriveBackupEnabled,
      googleDriveLastBackupAt,
      googleDriveLastRestoreAt,
      listMenuTree,
      listOrderMode,
      menuPresets,
      selectedFilters,
      todoGroupMode,
      todoSortMode,
    };

    appSettingsStore.save(settings).catch(() => undefined);
  }, [
    collapsedTodoGroupIds,
    filterColors,
    googleDriveBackupEnabled,
    googleDriveLastBackupAt,
    googleDriveLastRestoreAt,
    listMenuTree,
    listOrderMode,
    menuPresets,
    selectedFilters,
    settingsLoaded,
    todoGroupMode,
    todoSortMode,
  ]);

  useEffect(() => {
    if (menuMode === null) {
      setActiveTodoMenuId(null);
    }
  }, [menuMode]);

  useEffect(() => {
    if (menuMode === null) {
      listMenuScrollOffsetY.current = 0;
      setIsListMenuAtTop(true);
      return undefined;
    }

    listMenuScrollOffsetY.current = listMenuOneHandedOffset;
    setIsListMenuAtTop(listMenuOneHandedOffset <= 1);

    const frame = requestAnimationFrame(() => {
      listMenuRef.current?.scrollToOffset({
        animated: false,
        offset: listMenuOneHandedOffset,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [listMenuOneHandedOffset, menuMode]);

  useEffect(() => {
    if (!listMenuOpen) {
      menuPullAnim.stopAnimation();
      menuPullAnim.setValue(0);
      menuDismissPullRef.current = 0;
      menuDismissHapticRef.current = 0;
    }
  }, [listMenuOpen, menuPullAnim]);

  const closeListMenuState = useCallback(() => {
    setMenuMode(null);
    setActiveTodoMenuId(null);
  }, []);

  const closeListMenu = useCallback(() => {
    closeListMenuState();
    Haptics.selectionAsync().catch(() => undefined);
  }, [closeListMenuState]);

  const dampMenuPullDistance = useCallback((translationY: number) => {
    if (translationY <= 0) {
      return 0;
    }

    return Math.min(PULL_MAX, translationY * 0.85);
  }, []);

  const resetMenuDismissPull = useCallback(() => {
    menuDismissPullRef.current = 0;
    menuDismissHapticRef.current = 0;
  }, []);

  const animateMenuDismissReset = useCallback(() => {
    Animated.spring(menuPullAnim, {
      friction: 22,
      tension: 220,
      toValue: 0,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        resetMenuDismissPull();
      }
    });
  }, [menuPullAnim, resetMenuDismissPull]);

  const goBackFromMenuDismissGesture = useCallback(() => {
    const currentMenuMode = menuModeRef.current;

    if (currentMenuMode === 'presetsQuickApply') {
      setMenuMode('presets');
    } else if (currentMenuMode && currentMenuMode !== 'main') {
      setMenuMode('main');
    } else {
      return false;
    }

    animateMenuDismissReset();
    Haptics.selectionAsync().catch(() => undefined);
    return true;
  }, [animateMenuDismissReset]);

  const animateMenuDismissClose = useCallback(() => {
    if (goBackFromMenuDismissGesture()) {
      return;
    }

    Animated.timing(menuPullAnim, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
      toValue: listMenuHeight + LIST_MENU_BOTTOM_OFFSET + 48,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        if (goBackFromMenuDismissGesture()) {
          return;
        }

        closeListMenuState();
        requestAnimationFrame(() => {
          menuPullAnim.setValue(0);
          resetMenuDismissPull();
        });
      }
    });
  }, [
    closeListMenuState,
    goBackFromMenuDismissGesture,
    listMenuHeight,
    menuPullAnim,
    resetMenuDismissPull,
  ]);

  const handleMenuDismissGesture = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      const { translationX, translationY } = event.nativeEvent;

      if (
        !isListMenuAtTop ||
        listMenuScrollOffsetY.current > 1 ||
        translationY <= 0 ||
        Math.abs(translationY) <= Math.abs(translationX)
      ) {
        menuPullAnim.setValue(0);
        menuDismissPullRef.current = 0;
        return;
      }

      const damped = dampMenuPullDistance(translationY);
      menuDismissPullRef.current = damped;
      menuPullAnim.setValue(damped);

      if (damped > MENU_DISMISS_RELEASE && menuDismissHapticRef.current === 0) {
        menuDismissHapticRef.current = 1;
        triggerLightTickHaptic();
      }
    },
    [dampMenuPullDistance, isListMenuAtTop, menuPullAnim],
  );

  const handleMenuDismissStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state, translationY, velocityY } = event.nativeEvent;

      if (
        state !== State.END &&
        state !== State.CANCELLED &&
        state !== State.FAILED
      ) {
        return;
      }

      if (!isListMenuAtTop || listMenuScrollOffsetY.current > 1) {
        animateMenuDismissReset();
        return;
      }

      const pulled = menuDismissPullRef.current;
      const shouldClose =
        pulled > MENU_DISMISS_RELEASE ||
        (translationY > 20 && velocityY > MENU_DISMISS_VELOCITY);

      if (shouldClose) {
        animateMenuDismissClose();
        return;
      }

      animateMenuDismissReset();
    },
    [
      animateMenuDismissClose,
      animateMenuDismissReset,
      isListMenuAtTop,
    ],
  );

  const handleSubmenuBackGestureStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state, translationY, velocityY } = event.nativeEvent;

      if (
        state !== State.END &&
        state !== State.CANCELLED &&
        state !== State.FAILED
      ) {
        return;
      }

      if (!isListMenuAtTop || listMenuScrollOffsetY.current > 1) {
        animateMenuDismissReset();
        return;
      }

      const pulled = menuDismissPullRef.current;
      const shouldGoBack =
        pulled > MENU_DISMISS_RELEASE ||
        (translationY > 20 && velocityY > MENU_DISMISS_VELOCITY);

      if (shouldGoBack) {
        goBackFromMenuDismissGesture();
        return;
      }

      animateMenuDismissReset();
    },
    [
      animateMenuDismissReset,
      goBackFromMenuDismissGesture,
      isListMenuAtTop,
    ],
  );

  const handleListMenuScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = Math.max(0, event.nativeEvent.contentOffset.y);
      const nextIsAtTop = offsetY <= 1;

      listMenuScrollOffsetY.current = offsetY;
      setIsListMenuAtTop((current) => (
        current === nextIsAtTop ? current : nextIsAtTop
      ));
    },
    [],
  );

  const handleListMenuScrollSettled = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = Math.max(0, event.nativeEvent.contentOffset.y);
      const nextIsAtTop = offsetY <= 1;

      listMenuScrollOffsetY.current = offsetY;
      setIsListMenuAtTop((current) => (
        current === nextIsAtTop ? current : nextIsAtTop
      ));
    },
    [],
  );

  const listMenuAnimatedStyle = useMemo(
    () => ({
      borderBottomLeftRadius: menuPullAnim.interpolate({
        extrapolate: 'clamp',
        inputRange: [0, PULL_MAX],
        outputRange: [18, 32],
      }),
      borderBottomRightRadius: menuPullAnim.interpolate({
        extrapolate: 'clamp',
        inputRange: [0, PULL_MAX],
        outputRange: [18, 32],
      }),
      transform: [
        { translateY: menuPullAnim },
        {
          scaleX: menuPullAnim.interpolate({
            extrapolate: 'clamp',
            inputRange: [0, PULL_MAX],
            outputRange: [1, 1.045],
          }),
        },
        {
          scaleY: menuPullAnim.interpolate({
            extrapolate: 'clamp',
            inputRange: [0, PULL_MAX / 2, PULL_MAX],
            outputRange: [1, 1.035, 1.08],
          }),
        },
      ],
    }),
    [menuPullAnim],
  );

  const closeSettingsModal = useCallback(() => {
    setSettingsModalVisible(false);
    setNavTab((current) => (current === 'settings' ? null : current));
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const closePresetSaveModal = useCallback(() => {
    Keyboard.dismiss();
    setPresetSaveModalVisible(false);
    setPresetSaveName('');
  }, []);

  const backToCreateDrawerInput = useCallback(() => {
    Keyboard.dismiss();
    setCreateDrawerPicker(null);
  }, []);

  const goBackInMenu = useCallback(() => {
    if (datePickerVisible) {
      setDatePickerVisible(false);
      return true;
    }

    if (createDrawerVisible) {
      if (createDrawerPicker) {
        backToCreateDrawerInput();
        return true;
      }

      setCreateDrawerVisible(false);
      setCreateDraftPriorityFromPicker(false);
      setCreateDraftText('');
      setCreateDraftFilters(getDefaultCreateDraftFilters(listMenuTree));
      Keyboard.dismiss();
      return true;
    }

    if (presetSaveModalVisible) {
      closePresetSaveModal();
      return true;
    }

    if (settingsModalVisible) {
      closeSettingsModal();
      return true;
    }

    if (menuMode === 'presetsQuickApply') {
      setMenuMode('presets');
      Haptics.selectionAsync().catch(() => undefined);
      return true;
    }

    if (submenuOpen) {
      setMenuMode('main');
      Haptics.selectionAsync().catch(() => undefined);
      return true;
    }

    if (menuMode === 'main') {
      closeListMenu();
      return true;
    }

    return false;
  }, [
    backToCreateDrawerInput,
    closeListMenu,
    closePresetSaveModal,
    closeSettingsModal,
    createDrawerPicker,
    createDrawerVisible,
    datePickerVisible,
    listMenuTree,
    menuMode,
    presetSaveModalVisible,
    settingsModalVisible,
    submenuOpen,
  ]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      goBackInMenu,
    );

    return () => subscription.remove();
  }, [goBackInMenu]);

  const searchIndex = useMemo(() => createTodoSearchIndex(todos), [todos]);

  const filteredTodos = useMemo(() => {
    return searchTodos(todos, searchIndex, query)
      .filter((todo) => todoMatchesFilters(todo, selectedFilters, listMenuTree));
  }, [listMenuTree, query, searchIndex, selectedFilters, todos]);

  const closeCreateDrawer = useCallback(() => {
    Keyboard.dismiss();
    setCreateDrawerVisible(false);
    setCreateDrawerPicker(null);
    setCreateDraftPriorityFromPicker(false);
    setCreateDraftText('');
    setCreateDraftFilters(getDefaultCreateDraftFilters(listMenuTree));
  }, [listMenuTree]);

  const handleCreateDrawerClosePress = useCallback(() => {
    if (createDrawerPicker) {
      backToCreateDrawerInput();
      Haptics.selectionAsync().catch(() => undefined);
      return;
    }

    closeCreateDrawer();
  }, [backToCreateDrawerInput, closeCreateDrawer, createDrawerPicker]);

  const openCreateDrawer = useCallback((initialText = '') => {
    if (listMenuOpen) {
      closeListMenu();
    }

    searchInputRef.current?.blur();
    setCreateDrawerPicker(null);
    setCreateDraftPriorityFromPicker(false);
    setCreateDraftFilters(getDefaultCreateDraftFilters(listMenuTree));
    setCreateDraftText(
      truncateTodoText(
        initialText.trim().replace(/\s+/g, ' '),
        todoTextMaxLength,
      ),
    );
    Keyboard.dismiss();
    setCreateDrawerVisible(true);
    Haptics.selectionAsync().catch(() => undefined);
  }, [closeListMenu, listMenuOpen, listMenuTree, todoTextMaxLength]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      const { screenY } = event.endCoordinates;
      setCreateDrawerKeyboardInset(Math.max(0, windowHeight - screenY));
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setCreateDrawerKeyboardInset(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [windowHeight]);

  useEffect(() => {
    if (!createDrawerVisible) {
      setCreateDrawerKeyboardInset(0);
    }
  }, [createDrawerVisible]);

  const createDrawerPickerMaxHeight = useMemo(() => {
    const toolbarReserve = 168;

    if (createDrawerKeyboardInset > 0) {
      return Math.max(120, windowHeight - createDrawerKeyboardInset - toolbarReserve);
    }

    return Math.max(120, windowHeight * 0.42);
  }, [createDrawerKeyboardInset, windowHeight]);

  const submitCreateTodo = useCallback(() => {
    const text = truncateTodoText(
      createDraftText.trim().replace(/\s+/g, ' '),
      todoTextMaxLength,
    );

    if (!text) {
      return;
    }

    const exists = todos.some(
      (todo) => normalizeTodoText(todo.text) === normalizeTodoText(text),
    );
    if (exists) {
      Keyboard.dismiss();
      closeCreateDrawer();
      return;
    }

    setTodos((current) => [makeTodo(text, createDraftFilters), ...current]);
    closeCreateDrawer();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => undefined,
    );
  }, [
    closeCreateDrawer,
    createDraftFilters,
    createDraftText,
    todoTextMaxLength,
    todos,
  ]);

  const setCreateDraftFilterValue = useCallback((
    filterKey: FilterKey,
    label: string,
  ) => {
    if (filterKey === 'priority') {
      setCreateDraftPriorityFromPicker(label !== 'None');
    }

    setCreateDraftFilters((current) => ({
      ...current,
      [filterKey]:
        filterKey === 'priority' && label === 'None' ? [] : [label],
    }));
    setCreateDrawerPicker(null);
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const openCreateDrawerPicker = useCallback((picker: CreateDrawerPicker) => {
    Keyboard.dismiss();
    setCreateDrawerPicker(picker);
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const createDrawerPickerItems = useMemo(() => {
    if (createDrawerPicker === 'list') {
      return listMenuTree.map((node) => node.label);
    }

    if (createDrawerPicker === 'date') {
      return DATE_MENU_ITEMS;
    }

    if (createDrawerPicker === 'priority') {
      return PRIORITY_MENU_ITEMS;
    }

    return [];
  }, [createDrawerPicker, listMenuTree]);

  const createDrawerDateLabel = useMemo(
    () => formatCreateDrawerDateLabel(createDraftFilters.date),
    [createDraftFilters.date],
  );

  const createDrawerListLabel = createDraftFilters.list[0] ?? 'Inbox';
  const createDrawerPriorityHigh = createDraftFilters.priority[0] === 'High';

  const toggleCreateDraftPriority = useCallback(() => {
    setCreateDraftPriorityFromPicker(false);
    setCreateDraftFilters((current) => {
      const currentPriority = current.priority[0];
      const nextPriority =
        currentPriority === 'High'
          ? []
          : ['High'];

      return {
        ...current,
        priority: nextPriority,
      };
    });
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const deleteTodo = useCallback((id: string) => {
    setTodos((current) => current.filter((todo) => todo.id !== id));
  }, []);

  const setTodoDone = useCallback((id: string, done: boolean) => {
    setTodos((current) =>
      current.map((todo) => (
        todo.id === id && todo.done !== done ? { ...todo, done } : todo
      )),
    );
  }, []);

  const updateTodoFilters = useCallback((
    id: string,
    updater: (filters: SelectedFilters) => SelectedFilters,
  ) => {
    setTodos((current) =>
      current.map((todo) => (
        todo.id === id
          ? { ...todo, filters: updater(cloneTodoFilters(todo.filters)) }
          : todo
      )),
    );
  }, []);

  const closeDatePicker = useCallback(() => {
    setDatePickerVisible(false);
  }, []);

  const applyPickedDate = useCallback((date: Date) => {
    const isoDate = toISODateString(date);
    const applyDate = (current: SelectedFilters) => ({
      ...current,
      date: [isoDate],
    });

    if (datePickerApplyRef.current === 'create') {
      setCreateDraftFilters(applyDate);
      setCreateDrawerPicker(null);
    } else if (activeTodoMenuId) {
      updateTodoFilters(activeTodoMenuId, applyDate);
    } else {
      setSelectedFilters(applyDate);
    }

    closeDatePicker();
    Haptics.selectionAsync().catch(() => undefined);
  }, [activeTodoMenuId, closeDatePicker, updateTodoFilters]);

  const openDatePicker = useCallback((
    source: 'create' | 'filters',
    dateLabels: string[],
  ) => {
    datePickerApplyRef.current = source;
    setDatePickerValue(getInitialDatePickerValue(dateLabels));
    setDatePickerVisible(true);
  }, []);

  const handleDatePickerChange = useCallback((
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (event.type === 'dismissed') {
      closeDatePicker();
      return;
    }

    if (!selectedDate) {
      return;
    }

    setDatePickerValue(selectedDate);

    if (Platform.OS === 'android') {
      applyPickedDate(selectedDate);
    }
  }, [applyPickedDate, closeDatePicker]);

  const handleCreateDrawerDatePress = useCallback((label: string) => {
    if (label === SOMEDAY_DATE_LABEL) {
      openDatePicker('create', createDraftFilters.date);
      return;
    }

    setCreateDraftFilterValue('date', label);
  }, [createDraftFilters.date, openDatePicker, setCreateDraftFilterValue]);

  const registerListTap = useCallback(
    (pageX: number, pageY: number, timestamp: number) => {
      if (listMenuOpen) {
        return false;
      }

      const lastRegisteredTap = lastRegisteredListTapRef.current;
      const duplicateTap =
        Math.abs(timestamp - lastRegisteredTap.timestamp) < 24 &&
        Math.hypot(pageX - lastRegisteredTap.pageX, pageY - lastRegisteredTap.pageY) < 4;

      if (duplicateTap) {
        return false;
      }

      lastRegisteredListTapRef.current = { pageX, pageY, timestamp };

      const lastTap = lastListTapRef.current;
      const sinceLastTap = timestamp - lastTap.timestamp;
      const distanceFromLastTap = Math.hypot(pageX - lastTap.pageX, pageY - lastTap.pageY);

      if (sinceLastTap <= DOUBLE_TAP_DELAY && distanceFromLastTap <= 56) {
        lastListTapRef.current = { pageX: 0, pageY: 0, timestamp: 0 };
        Keyboard.dismiss();
        setActiveTodoMenuId(null);
        setMenuMode('main');
        Haptics.selectionAsync().catch(() => undefined);
        return true;
      }

      lastListTapRef.current = { pageX, pageY, timestamp };
      return false;
    },
    [listMenuOpen],
  );

  const handleListTap = useCallback(
    (event: GestureResponderEvent) => {
      const { pageX, pageY, timestamp } = event.nativeEvent;
      return registerListTap(pageX, pageY, timestamp);
    },
    [registerListTap],
  );

  const handleListFrameTouchStart = useCallback((event: GestureResponderEvent) => {
    const { pageX, pageY, timestamp } = event.nativeEvent;
    listTouchStartRef.current = { pageX, pageY, timestamp };
  }, []);

  const handleListFrameTouchEnd = useCallback(
    (event: GestureResponderEvent) => {
      const { pageX, pageY, timestamp } = event.nativeEvent;
      const start = listTouchStartRef.current;
      const moved = Math.hypot(pageX - start.pageX, pageY - start.pageY);
      const elapsed = timestamp - start.timestamp;

      if (moved > 8 || elapsed > 360) {
        return;
      }

      registerListTap(pageX, pageY, timestamp);
    },
    [registerListTap],
  );

  const handleMenuBackStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state, translationX, velocityX } = event.nativeEvent;

      if (
        state === State.END &&
        submenuOpen &&
        (translationX > 64 || velocityX > 650)
      ) {
        goBackInMenu();
      }
    },
    [goBackInMenu, submenuOpen],
  );

  const handleLeftEdgeBackStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state, translationX, velocityX } = event.nativeEvent;

      if (state === State.END && submenuOpen && (translationX > 42 || velocityX > 520)) {
        goBackInMenu();
      }
    },
    [goBackInMenu, submenuOpen],
  );

  const handleRightEdgeBackStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state, translationX, velocityX } = event.nativeEvent;

      if (state === State.END && submenuOpen && (translationX < -42 || velocityX < -520)) {
        goBackInMenu();
      }
    },
    [goBackInMenu, submenuOpen],
  );

  const handleListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      scrollOffsetY.current = Math.max(0, offsetY);
    },
    [],
  );

  const handleTodoListFrameLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    setTodoListFrameHeight((currentHeight) => (
      Math.abs(currentHeight - nextHeight) < 1 ? currentHeight : nextHeight
    ));
  }, []);

  const orderedListMenuTree = useMemo(
    () => (listOrderMode === 'alphabetical' ? sortListMenuTree(listMenuTree) : listMenuTree),
    [listMenuTree, listOrderMode],
  );
  const visibleListMenuItems = useMemo(
    () => buildVisibleListMenuItems(orderedListMenuTree, Boolean(activeTodoMenuId)),
    [activeTodoMenuId, orderedListMenuTree],
  );
  const orderedListLabels = useMemo(
    () => collectListNodeLabels(orderedListMenuTree),
    [orderedListMenuTree],
  );
  const settingsListColorLabels = useMemo(
    () => collectListNodeLabels(listMenuTree),
    [listMenuTree],
  );
  const settingsColorGroups = useMemo(
    () => [
      {
        filterKey: 'priority' as const,
        title: 'Priority',
        values: PRIORITY_MENU_ITEMS,
      },
      {
        filterKey: 'date' as const,
        title: 'Date',
        values: DATE_MENU_ITEMS,
      },
      {
        filterKey: 'list' as const,
        title: 'Lists',
        values: settingsListColorLabels,
      },
    ],
    [settingsListColorLabels],
  );
  const settingsColorItemCount = settingsColorGroups.reduce(
    (count, group) => count + group.values.length,
    0,
  );
  const activeListDisplay = useMemo(
    () => resolveListDisplaySettings(
      listMenuTree,
      selectedFilters.list,
      todoSortMode,
      todoGroupMode,
    ),
    [listMenuTree, selectedFilters.list, todoGroupMode, todoSortMode],
  );
  const effectiveSortMode = activeListDisplay.sortMode;
  const effectiveGroupMode = activeListDisplay.groupMode;
  const useSubsectionLayout = activeListDisplay.isSubsectionView && effectiveGroupMode === 'none';
  const sortedTodos = useMemo(
    () => [...filteredTodos].sort((first, second) => (
      compareTodosBySortMode(first, second, effectiveSortMode)
    )),
    [effectiveSortMode, filteredTodos],
  );
  const todoListRows = useMemo(
    () => buildTodoListRows(
      sortedTodos,
      effectiveSortMode,
      effectiveGroupMode,
      orderedListLabels,
      listMenuTree,
      selectedFilters.list,
      collapsedTodoGroupIds,
      useSubsectionLayout,
    ),
    [
      collapsedTodoGroupIds,
      effectiveGroupMode,
      effectiveSortMode,
      listMenuTree,
      orderedListLabels,
      selectedFilters.list,
      sortedTodos,
      useSubsectionLayout,
    ],
  );
  const todoListOneHandedOffset = useMemo(() => {
    if (todoListRows.length === 0) {
      return 0;
    }

    const viewportHeight = todoListFrameHeight || windowHeight;

    return Math.max(
      LIST_MENU_ROW_HEIGHT,
      Math.round(
        (viewportHeight * LIST_MENU_ONE_HANDED_SCROLL_RATIO) /
          LIST_MENU_ROW_HEIGHT,
      ) * LIST_MENU_ROW_HEIGHT,
    );
  }, [todoListFrameHeight, todoListRows.length, windowHeight]);
  const todoListContentOffset = useMemo(
    () => ({ x: 0, y: todoListOneHandedOffset }),
    [todoListOneHandedOffset],
  );
  const activeTodoMenuFilters = useMemo(
    () => todos.find((todo) => todo.id === activeTodoMenuId)?.filters ?? null,
    [activeTodoMenuId, todos],
  );
  const menuFilters = activeTodoMenuFilters ?? selectedFilters;
  const activeFilterCount = countFilters(menuFilters);
  const searchFilterItems = useMemo(
    () => buildActiveFilterItems(selectedFilters),
    [selectedFilters],
  );
  const showSearchFiltersPanel = navTab === 'search' && !query.trim();
  const searchContextSummary = useMemo(
    () => formatPresetSummary(
      selectedFilters,
      effectiveSortMode,
      effectiveGroupMode,
      listOrderMode,
    ),
    [effectiveGroupMode, effectiveSortMode, listOrderMode, selectedFilters],
  );
  const latestMenuPreset = menuPresets[menuPresets.length - 1] ?? null;
  const currentPresetSummary = formatPresetSummary(
    menuFilters,
    effectiveSortMode,
    effectiveGroupMode,
    listOrderMode,
  );
  const bottomMenuItems = useMemo<BottomMenuItem[]>(() => {
    if (menuMode === 'lists') {
      return visibleListMenuItems;
    }

    if (menuMode === 'priority') {
      return PRIORITY_MENU_ITEMS.map((label) => ({
        filterKey: 'priority',
        id: `priority-${label}`,
        label,
        type: 'value',
      }));
    }

    if (menuMode === 'date') {
      return DATE_MENU_ITEMS.map((label) => ({
        filterKey: 'date',
        id: `date-${label}`,
        label,
        type: 'value',
      }));
    }

    if (menuMode === 'filters') {
      return (Object.entries(menuFilters) as Array<[FilterKey, string[]]>)
        .flatMap(([filterKey, values]) => values.map((label) => ({
          filterKey,
          id: `filter-${filterKey}-${label}`,
          label,
          type: 'filter',
        })));
    }

    if (menuMode === 'sort') {
      return TODO_SORT_OPTIONS.map((item) => ({
        id: `sort-${item.mode}`,
        label: item.label,
        sortMode: item.mode,
        type: 'sortOption',
      }));
    }

    if (menuMode === 'group') {
      return TODO_GROUP_OPTIONS.map((item) => ({
        groupMode: item.mode,
        id: `group-${item.mode}`,
        label: item.label,
        type: 'groupOption',
      }));
    }

    if (menuMode === 'presetsQuickApply' && latestMenuPreset) {
      return [
        {
          id: 'preset-quick-apply',
          label: latestMenuPreset.label,
          preset: latestMenuPreset,
          summary: formatPresetSummary(
            latestMenuPreset.filters,
            latestMenuPreset.todoSortMode,
            latestMenuPreset.todoGroupMode,
            latestMenuPreset.listOrderMode,
          ),
          type: 'quickApplyPreset',
        },
      ];
    }

    if (menuMode === 'presets') {
      const rows: MenuRow[] = [];

      if (latestMenuPreset) {
        rows.push({
          id: 'preset-quick-apply-menu',
          label: 'Quick apply',
          menuMode: 'presetsQuickApply',
          type: 'menu',
          valueLabel: latestMenuPreset.label,
        });
      }

      rows.push(
        ...menuPresets.map((preset) => ({
          id: `preset-${preset.id}`,
          label: preset.label,
          preset,
          summary: formatPresetSummary(
            preset.filters,
            preset.todoSortMode,
            preset.todoGroupMode,
            preset.listOrderMode,
          ),
          type: 'preset' as const,
        })),
        {
          id: 'preset-save-current',
          label: 'Save current as preset',
          summary: currentPresetSummary,
          type: 'savePreset' as const,
        },
      );

      return rows;
    }

    const rows: MenuRow[] = [
      {
        count: menuPresets.length || undefined,
        id: 'main-presets',
        label: 'Presets',
        menuMode: 'presets',
        type: 'menu',
      },
      {
        count: menuFilters.list.length || undefined,
        id: 'main-lists',
        label: 'Lists',
        menuMode: 'lists',
        type: 'menu',
      },
      {
        count: menuFilters.priority.length || undefined,
        id: 'main-priority',
        label: 'Priority',
        menuMode: 'priority',
        type: 'menu',
      },
      {
        count: menuFilters.date.length || undefined,
        id: 'main-date',
        label: 'Date',
        menuMode: 'date',
        type: 'menu',
      },
      {
        id: 'main-sort',
        label: 'Sort',
        menuMode: 'sort',
        type: 'menu',
        valueLabel: TODO_SORT_LABELS[effectiveSortMode],
      },
      {
        id: 'main-group',
        label: 'Group',
        menuMode: 'group',
        type: 'menu',
        valueLabel:
          effectiveGroupMode !== 'none' ? TODO_GROUP_LABELS[effectiveGroupMode] : undefined,
      },
      {
        count: activeFilterCount || undefined,
        id: 'main-filters',
        label: 'Filters',
        menuMode: 'filters',
        type: 'menu',
      },
      {
        id: 'main-clear-filters',
        label: 'Clear filters',
        type: 'clearFilters',
      },
      {
        id: 'main-settings',
        label: 'Settings',
        type: 'settings',
      },
    ];

    return rows;
  }, [
    activeFilterCount,
    currentPresetSummary,
    latestMenuPreset,
    listOrderMode,
    menuFilters,
    menuMode,
    menuPresets,
    effectiveGroupMode,
    effectiveSortMode,
    visibleListMenuItems,
  ]);

  useEffect(() => {
    const hasTodoRows = todoListOneHandedOffset > 1;
    const shouldApplyOffset =
      hasTodoRows &&
      (!didApplyTodoListInitialOffsetRef.current || !hadTodoListRowsRef.current);

    hadTodoListRowsRef.current = hasTodoRows;

    if (!hasTodoRows) {
      scrollOffsetY.current = 0;
      return undefined;
    }

    if (!shouldApplyOffset) {
      return undefined;
    }

    didApplyTodoListInitialOffsetRef.current = true;
    scrollOffsetY.current = todoListOneHandedOffset;

    const frame = requestAnimationFrame(() => {
      todoListRef.current?.scrollToOffset({
        animated: false,
        offset: todoListOneHandedOffset,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [todoListOneHandedOffset]);

  const alignTodoListForSearchFocus = useCallback(() => {
    if (todoListOneHandedOffset <= 1) {
      return;
    }

    scrollOffsetY.current = todoListOneHandedOffset;

    requestAnimationFrame(() => {
      todoListRef.current?.scrollToOffset({
        animated: true,
        offset: todoListOneHandedOffset,
      });
    });
  }, [todoListOneHandedOffset]);

  const toggleFilterValue = useCallback((filterKey: FilterKey, value: string) => {
    const toggleValue = (current: SelectedFilters) => {
      const currentValues = current[filterKey];
      const hasValue = currentValues.includes(value);

      return {
        ...current,
        [filterKey]: hasValue
          ? currentValues.filter((item) => item !== value)
          : [...currentValues, value],
      };
    };

    if (activeTodoMenuId) {
      updateTodoFilters(activeTodoMenuId, toggleValue);
    } else {
      setSelectedFilters(toggleValue);
    }
    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, [activeTodoMenuId, updateTodoFilters]);

  const handleDateMenuLabelPress = useCallback((label: string) => {
    if (label === SOMEDAY_DATE_LABEL) {
      openDatePicker('filters', menuFilters.date);
      return;
    }

    toggleFilterValue('date', label);
  }, [menuFilters.date, openDatePicker, toggleFilterValue]);

  const toggleListMenuItem = useCallback((item: VisibleListMenuItem) => {
    const toggleValue = (current: SelectedFilters): SelectedFilters => {
      const list = current.list;

      if (item.isSubsection && item.parentLabel) {
        const parentNode = findListMenuNode(listMenuTree, item.parentLabel);
        const siblingLabels = parentNode?.children?.map((child) => child.label) ?? [];
        const hasSubsection = list.includes(item.label);
        const withoutFamily = list.filter(
          (label) => label !== item.parentLabel && !siblingLabels.includes(label),
        );

        if (hasSubsection) {
          return { ...current, list: withoutFamily };
        }

        return { ...current, list: [...withoutFamily, item.label] };
      }

      const parentNode = findListMenuNode(listMenuTree, item.label);
      const childLabels = parentNode?.children?.map((child) => child.label) ?? [];
      const hasParentOnly = list.includes(item.label)
        && !childLabels.some((label) => list.includes(label));

      if (hasParentOnly) {
        return {
          ...current,
          list: list.filter((label) => label !== item.label && !childLabels.includes(label)),
        };
      }

      const withoutFamily = list.filter(
        (label) => label !== item.label && !childLabels.includes(label),
      );

      return { ...current, list: [...withoutFamily, item.label] };
    };

    if (activeTodoMenuId) {
      updateTodoFilters(activeTodoMenuId, toggleValue);
    } else {
      setSelectedFilters(toggleValue);
    }

    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, [activeTodoMenuId, listMenuTree, updateTodoFilters]);

  const removeListMenuItem = useCallback((item: VisibleListMenuItem) => {
    const removeValue = (current: SelectedFilters) => {
      if (item.isSubsection) {
        return {
          ...current,
          list: current.list.filter((label) => label !== item.label),
        };
      }

      const childLabels = findListMenuNode(listMenuTree, item.label)?.children?.map((child) => (
        child.label
      )) ?? [];

      return {
        ...current,
        list: current.list.filter((label) => label !== item.label && !childLabels.includes(label)),
      };
    };

    if (activeTodoMenuId) {
      updateTodoFilters(activeTodoMenuId, removeValue);
    } else {
      setSelectedFilters(removeValue);
    }
    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, [activeTodoMenuId, listMenuTree, updateTodoFilters]);

  const removeFilter = useCallback((filterKey: FilterKey, value: string) => {
    const removeValue = (current: SelectedFilters) => {
      const nextValues = current[filterKey].filter((item) => item !== value);
      return { ...current, [filterKey]: nextValues };
    };

    if (activeTodoMenuId) {
      updateTodoFilters(activeTodoMenuId, removeValue);
    } else {
      setSelectedFilters(removeValue);
    }
    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, [activeTodoMenuId, updateTodoFilters]);

  const clearFilters = useCallback(() => {
    if (activeTodoMenuId) {
      updateTodoFilters(activeTodoMenuId, () => cloneTodoFilters());
    } else {
      setSelectedFilters(cloneTodoFilters());
    }
    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, [activeTodoMenuId, updateTodoFilters]);

  const setFilterColor = useCallback((
    filterKey: FilterKey,
    value: string,
    color: string,
  ) => {
    setFilterColors((current) => ({
      ...current,
      [filterKey]: {
        ...current[filterKey],
        [value]: color,
      },
    }));
    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, []);

  const selectTodoSortMode = useCallback((sortMode: TodoSortMode) => {
    const display = resolveListDisplaySettings(
      listMenuTree,
      selectedFilters.list,
      todoSortMode,
      todoGroupMode,
    );

    if (display.listLabel) {
      setListMenuTree((current) => updateListNodeDisplaySettings(
        current,
        display.listLabel!,
        display.isSubsectionView,
        { sortMode },
      ));
    } else {
      setTodoSortMode(sortMode);
    }

    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, [listMenuTree, selectedFilters.list, todoGroupMode, todoSortMode]);

  const toggleTodoGroupCollapsed = useCallback((groupId: string) => {
    setCollapsedTodoGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }

      return next;
    });
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const selectTodoGroupMode = useCallback((groupMode: TodoGroupMode) => {
    const display = resolveListDisplaySettings(
      listMenuTree,
      selectedFilters.list,
      todoSortMode,
      todoGroupMode,
    );

    if (display.listLabel) {
      setListMenuTree((current) => updateListNodeDisplaySettings(
        current,
        display.listLabel!,
        display.isSubsectionView,
        { groupMode },
      ));
    } else {
      setTodoGroupMode(groupMode);
    }

    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, [listMenuTree, selectedFilters.list, todoGroupMode, todoSortMode]);

  const clearMenuSection = useCallback((section: MenuMode) => {
    const filterKey = MENU_SECTION_FILTER_KEYS[section];

    if (filterKey) {
      const clearKey = (current: SelectedFilters) => ({
        ...current,
        [filterKey]: [],
      });

      if (activeTodoMenuId) {
        updateTodoFilters(activeTodoMenuId, clearKey);
      } else {
        setSelectedFilters(clearKey);
      }
      requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
      return;
    }

    if (section === 'filters') {
      clearFilters();
      return;
    }

    if (section === 'sort') {
      const display = resolveListDisplaySettings(
        listMenuTree,
        selectedFilters.list,
        todoSortMode,
        todoGroupMode,
      );

      if (display.listLabel) {
        setListMenuTree((current) => clearListNodeDisplaySettings(
          current,
          display.listLabel!,
          display.isSubsectionView,
          'sort',
        ));
      } else {
        setTodoSortMode('newest');
      }

      requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
      return;
    }

    if (section === 'group') {
      const display = resolveListDisplaySettings(
        listMenuTree,
        selectedFilters.list,
        todoSortMode,
        todoGroupMode,
      );

      if (display.listLabel) {
        setListMenuTree((current) => clearListNodeDisplaySettings(
          current,
          display.listLabel!,
          display.isSubsectionView,
          'group',
        ));
      } else {
        setTodoGroupMode('none');
      }

      requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
    }
  }, [
    activeTodoMenuId,
    clearFilters,
    listMenuTree,
    selectedFilters.list,
    todoGroupMode,
    todoSortMode,
    updateTodoFilters,
  ]);

  const commitMenuPreset = useCallback((rawName: string) => {
    const label = normalizeTodoText(rawName);

    if (!label) {
      return;
    }

    const createdAt = Date.now();

    setMenuPresets((current) => [
      ...current,
      {
        id: `preset-${createdAt}-${Math.random().toString(36).slice(2)}`,
        label,
        filters: cloneTodoFilters(menuFilters),
        listOrderMode,
        todoGroupMode,
        todoSortMode,
        createdAt,
      },
    ]);
    closePresetSaveModal();
    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, [closePresetSaveModal, listOrderMode, menuFilters, todoGroupMode, todoSortMode]);

  const focusPresetSaveInput = useCallback(() => {
    searchInputRef.current?.blur();
    presetSaveInputRef.current?.focus();
  }, []);

  const openSavePresetPrompt = useCallback(() => {
    Keyboard.dismiss();
    searchInputRef.current?.blur();
    setPresetSaveName(`Preset ${menuPresets.length + 1}`);
    setPresetSaveModalVisible(true);
    Haptics.selectionAsync().catch(() => undefined);
  }, [menuPresets.length]);

  useEffect(() => {
    if (!presetSaveModalVisible) {
      return;
    }

    const focusTimer = setTimeout(focusPresetSaveInput, 100);

    return () => clearTimeout(focusTimer);
  }, [focusPresetSaveInput, presetSaveModalVisible]);

  const applyMenuPreset = useCallback((preset: MenuPreset) => {
    const nextFilters = cloneTodoFilters(preset.filters);

    if (activeTodoMenuId) {
      updateTodoFilters(activeTodoMenuId, () => cloneTodoFilters(nextFilters));
    } else {
      setSelectedFilters(nextFilters);
    }

    setListOrderMode(preset.listOrderMode);
    setTodoGroupMode(preset.todoGroupMode);
    setTodoSortMode(preset.todoSortMode);
    setMenuMode(null);
    setActiveTodoMenuId(null);
    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, [activeTodoMenuId, updateTodoFilters]);

  const removeMenuPreset = useCallback((id: string) => {
    setMenuPresets((current) => current.filter((preset) => preset.id !== id));
    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, []);

  const addSettingsList = useCallback(() => {
    const label = normalizeTodoText(newListName);

    if (!label) {
      return;
    }

    setListMenuTree((current) => {
      const duplicate = current.some((item) => item.label.toLowerCase() === label.toLowerCase());
      if (duplicate) {
        return current;
      }

      return [...current, { label }];
    });
    setNewListName('');
    Haptics.selectionAsync().catch(() => undefined);
  }, [newListName]);

  const moveSettingsList = useCallback((index: number, direction: -1 | 1) => {
    setListOrderMode('manual');
    setListMenuTree((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const addSettingsListSubsection = useCallback((parentIndex: number) => {
    const label = normalizeTodoText(newSubsectionName);

    if (!label) {
      return;
    }

    setListMenuTree((current) => {
      const parent = current[parentIndex];
      if (!parent) {
        return current;
      }

      const existingLabels = new Set(
        collectListNodeLabels(current).map((entry) => entry.toLowerCase()),
      );
      if (existingLabels.has(label)) {
        return current;
      }

      const children = [...(parent.children ?? []), { label }];
      return current.map((item, index) => (
        index === parentIndex ? { ...item, children } : item
      ));
    });
    setNewSubsectionName('');
    setSubsectionParentIndex(null);
    Haptics.selectionAsync().catch(() => undefined);
  }, [newSubsectionName]);

  const removeSettingsListSubsection = useCallback((parentIndex: number, childIndex: number) => {
    setListMenuTree((current) => {
      const parent = current[parentIndex];
      if (!parent?.children?.length) {
        return current;
      }

      const removed = parent.children[childIndex];
      if (!removed) {
        return current;
      }

      const removedLabels = new Set(collectListNodeLabels([removed]));
      setSelectedFilters((filters) => ({
        ...filters,
        list: filters.list.filter((label) => !removedLabels.has(label)),
      }));
      setTodos((items) => items.map((todo) => ({
        ...todo,
        filters: {
          ...todo.filters,
          list: todo.filters.list.filter((label) => !removedLabels.has(label)),
        },
      })));

      const children = parent.children.filter((_, index) => index !== childIndex);
      return current.map((item, index) => (
        index === parentIndex
          ? { ...item, children: children.length > 0 ? children : undefined }
          : item
      ));
    });
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const removeSettingsList = useCallback((index: number) => {
    setListMenuTree((current) => {
      const node = current[index];
      if (!node) {
        return current;
      }

      const removedLabels = new Set(collectListNodeLabels([node]));
      setSelectedFilters((filters) => ({
        ...filters,
        list: filters.list.filter((label) => !removedLabels.has(label)),
      }));
      setTodos((items) => items.map((todo) => ({
        ...todo,
        filters: {
          ...todo.filters,
          list: todo.filters.list.filter((label) => !removedLabels.has(label)),
        },
      })));
      setFilterColors((colors) => ({
        ...colors,
        list: Object.fromEntries(
          Object.entries(colors.list).filter(([label]) => !removedLabels.has(label)),
        ),
      }));

      return current.filter((_, itemIndex) => itemIndex !== index);
    });
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const openSettingsModal = useCallback(() => {
    Keyboard.dismiss();
    setMenuMode(null);
    setActiveTodoMenuId(null);
    setSettingsModalVisible(true);
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const appHeaderTitle = useMemo(() => {
    const activeListTitle =
      activeListDisplay.listLabel
      ?? (selectedFilters.list.length === 1 ? selectedFilters.list[0] : null);

    if (activeListTitle) {
      return activeListTitle;
    }

    if (menuMode === 'lists') {
      return 'Lists';
    }

    return 'TODO';
  }, [activeListDisplay.listLabel, menuMode, selectedFilters.list]);

  const focusHeaderSearch = useCallback(() => {
    setNavTab('search');
    setMenuMode(null);
    setActiveTodoMenuId(null);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const handleNavTabPress = useCallback((tab: NavTab) => {
    setActiveTodoMenuId(null);

    switch (tab) {
      case 'calendar':
        setNavTab('calendar');
        Keyboard.dismiss();
        setMenuMode('date');
        break;
      case 'menu':
        setNavTab('menu');
        Keyboard.dismiss();
        setMenuMode('main');
        break;
      case 'search':
        focusHeaderSearch();
        return;
      case 'settings':
        setNavTab('settings');
        openSettingsModal();
        return;
      default:
        break;
    }

    Haptics.selectionAsync().catch(() => undefined);
  }, [focusHeaderSearch, openSettingsModal]);

  useEffect(() => {
    if (!listMenuOpen && (navTab === 'calendar' || navTab === 'menu')) {
      setNavTab(null);
    }
  }, [listMenuOpen, navTab]);

  const toggleGoogleDriveBackup = useCallback(() => {
    setGoogleDriveBackupEnabled((current) => !current);
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const disconnectGoogleDrive = useCallback(async () => {
    setGoogleDriveBusy(true);

    try {
      if (Platform.OS === 'android') {
        try {
          const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
          await GoogleSignin.signOut();
        } catch {
          // Local token storage is still cleared below.
        }
      }

      await googleAuthStore.clear();
      setGoogleAuth(null);
      setGoogleDriveBackupStatus('Google Drive disconnected');
      Haptics.selectionAsync().catch(() => undefined);
    } finally {
      setGoogleDriveBusy(false);
    }
  }, []);

  const getFreshGoogleAccessToken = useCallback(async (authOverride?: StoredGoogleAuth) => {
    const clientId = getGoogleClientIdForPlatform();
    if (!clientId) {
      throw new Error('Google OAuth client ID is not configured for this platform.');
    }

    const storedAuth = authOverride ?? googleAuth ?? await googleAuthStore.load();
    if (!storedAuth) {
      throw new Error('Google sign in is required.');
    }

    const token = new TokenResponse({
      accessToken: storedAuth.accessToken,
      expiresIn: storedAuth.expiresIn,
      idToken: storedAuth.idToken,
      issuedAt: storedAuth.issuedAt,
      refreshToken: storedAuth.refreshToken,
      scope: storedAuth.scope,
      tokenType: storedAuth.tokenType === 'mac' ? 'mac' : 'bearer',
    });

    if (!token.shouldRefresh()) {
      return storedAuth.accessToken;
    }

    if (!storedAuth.refreshToken) {
      await googleAuthStore.clear();
      setGoogleAuth(null);
      throw new Error('Google session expired. Sign in again.');
    }

    const refreshedToken = await token.refreshAsync(
      {
        clientId,
        scopes: GOOGLE_AUTH_SCOPES,
      },
      Google.discovery,
    );
    const nextAuth = {
      ...googleAuthToStoredAuth(refreshedToken),
      refreshToken: refreshedToken.refreshToken ?? storedAuth.refreshToken,
    };
    setGoogleAuth(nextAuth);
    await googleAuthStore.save(nextAuth);

    return nextAuth.accessToken;
  }, [googleAuth]);

  const handleGoogleDriveError = useCallback((error: unknown, fallbackMessage: string) => {
    setGoogleDriveBackupStatus(error instanceof Error ? error.message : fallbackMessage);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
  }, []);

  const authenticateWithAndroidGoogle = useCallback(async () => {
    let nativeGoogleSignIn: NativeGoogleSignIn;

    try {
      assertNativeGoogleSignInAvailable();
      setGoogleDriveBackupStatus('Loading Google sign in...');
      nativeGoogleSignIn = await import('@react-native-google-signin/google-signin');
    } catch (error) {
      throw normalizeNativeGoogleSignInError(error);
    }

    const { GoogleSignin } = nativeGoogleSignIn;

    try {
      GoogleSignin.configure({
        scopes: GOOGLE_AUTH_SCOPES,
      });
      setGoogleDriveBackupStatus('Checking Google Play services...');
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true }).catch((error) => {
        throw normalizeNativeGoogleSignInError(error, 'Checking Google Play services');
      });

      setGoogleDriveBackupStatus('Opening Google account picker...');
      await GoogleSignin.signOut().catch(() => undefined);
      const signInResult = await GoogleSignin.signIn().catch((error) => {
        throw normalizeNativeGoogleSignInError(error, 'Opening Google account picker');
      });
      if (signInResult.type === 'cancelled') {
        throw new Error('Google sign in cancelled');
      }

      setGoogleDriveBackupStatus('Requesting Google Drive permission...');
      const scopeResult = await GoogleSignin.addScopes({ scopes: GOOGLE_AUTH_SCOPES }).catch((error) => {
        throw normalizeNativeGoogleSignInError(error, 'Requesting Google Drive permission');
      });
      if (!scopeResult) {
        throw new Error('Google Drive permission could not be requested.');
      }
      if (scopeResult.type === 'cancelled') {
        throw new Error('Google Drive permission cancelled');
      }

      setGoogleDriveBackupStatus('Getting Google Drive access...');
      const tokens = await GoogleSignin.getTokens().catch((error) => {
        throw normalizeNativeGoogleSignInError(error, 'Getting Google Drive access');
      });
      if (!tokens.accessToken) {
        throw new Error('Google did not return an access token.');
      }

      const nextAuth = googleNativeTokenToStoredAuth(tokens.accessToken, tokens.idToken);
      setGoogleAuth(nextAuth);
      await googleAuthStore.save(nextAuth);

      return nextAuth;
    } catch (error) {
      throw error instanceof Error ? error : normalizeNativeGoogleSignInError(error);
    }
  }, []);

  const uploadBackupWithToken = useCallback(async (accessToken: string) => {
    setGoogleDriveBackupStatus('Backing up to Google Drive...');

    const payload = createBackupPayload(todos, {
      collapsedTodoGroupIds: [...collapsedTodoGroupIds],
      filterColors,
      googleDriveBackupEnabled,
      googleDriveLastBackupAt,
      googleDriveLastRestoreAt,
      listMenuTree,
      listOrderMode,
      menuPresets,
      selectedFilters,
      todoGroupMode,
      todoSortMode,
    });
    await uploadDriveBackup(accessToken, payload);
    setGoogleDriveLastBackupAt(payload.exportedAt);
    setGoogleDriveBackupStatus(`Backed up ${todos.length} items · ${formatBackupTime(payload.exportedAt)}`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, [
    collapsedTodoGroupIds,
    filterColors,
    googleDriveBackupEnabled,
    googleDriveLastBackupAt,
    googleDriveLastRestoreAt,
    listMenuTree,
    listOrderMode,
    menuPresets,
    selectedFilters,
    todoGroupMode,
    todoSortMode,
    todos,
  ]);

  const restoreBackupWithToken = useCallback(async (accessToken: string) => {
    setGoogleDriveBackupStatus('Restoring from Google Drive...');

    const backup = await downloadDriveBackup(accessToken);

    if (!backup) {
      setGoogleDriveBackupStatus('No Google Drive backup found');
      return;
    }

    const restoredAt = new Date().toISOString();
    setTodos(withInitialTodos(backup.payload.todos));
    setSelectedFilters(normalizeTodoFilters(backup.payload.settings.selectedFilters));
    setFilterColors(backup.payload.settings.filterColors);
    setGoogleDriveBackupEnabled(backup.payload.settings.googleDriveBackupEnabled);
    setGoogleDriveLastBackupAt(backup.payload.settings.googleDriveLastBackupAt);
    setGoogleDriveLastRestoreAt(restoredAt);
    setListMenuTree(
      backup.payload.settings.listMenuTree.length > 0
        ? backup.payload.settings.listMenuTree
        : cloneListMenuTree(DEFAULT_LIST_MENU_TREE),
    );
    setListOrderMode(backup.payload.settings.listOrderMode);
    setMenuPresets(cloneMenuPresets(backup.payload.settings.menuPresets));
    setTodoGroupMode(backup.payload.settings.todoGroupMode);
    setCollapsedTodoGroupIds(new Set(backup.payload.settings.collapsedTodoGroupIds));
    setTodoSortMode(backup.payload.settings.todoSortMode);
    setGoogleDriveBackupStatus(
      `Restored ${backup.payload.todos.length} items · ${formatBackupTime(restoredAt)}`,
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, []);

  const runGoogleDriveAction = useCallback(async (
    action: GoogleDriveAction,
    authOverride?: StoredGoogleAuth,
  ) => {
    const accessToken = await getFreshGoogleAccessToken(authOverride);

    if (action === 'backup') {
      await uploadBackupWithToken(accessToken);
      return;
    }

    await restoreBackupWithToken(accessToken);
  }, [getFreshGoogleAccessToken, restoreBackupWithToken, uploadBackupWithToken]);

  const authenticateAndRunGoogleDriveAction = useCallback(async (action: GoogleDriveAction) => {
    if (!googleOAuthConfigured) {
      setGoogleDriveBackupStatus('Google sign-in is not configured for this build.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      return;
    }

    if (Platform.OS !== 'android' && !googleRequest) {
      setGoogleDriveBackupStatus('Google sign-in is still preparing.');
      return;
    }

    setGoogleDriveBusy(true);
    setGoogleDriveBackupStatus('Opening Google sign in...');

    try {
      if (Platform.OS === 'android') {
        const nextAuth = await authenticateWithAndroidGoogle();
        await runGoogleDriveAction(action, nextAuth);
        return;
      }

      const result = await promptGoogleAuth();

      if (result.type === 'success' && result.authentication?.accessToken) {
        const nextAuth = googleAuthToStoredAuth(result.authentication);
        setGoogleAuth(nextAuth);
        await googleAuthStore.save(nextAuth);
        await runGoogleDriveAction(action, nextAuth);
        return;
      }

      if (result.type === 'cancel') {
        setGoogleDriveBackupStatus('Google sign in cancelled');
      } else if (result.type === 'dismiss') {
        setGoogleDriveBackupStatus('Google sign in dismissed');
      } else if (result.type === 'error') {
        setGoogleDriveBackupStatus(result.error?.message ?? 'Google sign in failed');
      } else {
        setGoogleDriveBackupStatus('Google sign in did not finish');
      }
    } catch (error) {
      handleGoogleDriveError(error, 'Google sign in failed');
    } finally {
      setGoogleDriveBusy(false);
    }
  }, [
    authenticateWithAndroidGoogle,
    googleOAuthConfigured,
    googleRequest,
    handleGoogleDriveError,
    promptGoogleAuth,
    runGoogleDriveAction,
  ]);

  const performGoogleDriveAction = useCallback(async (action: GoogleDriveAction) => {
    if (googleDriveBusy) {
      return;
    }

    if (!googleAuth?.accessToken) {
      await authenticateAndRunGoogleDriveAction(action);
      return;
    }

    setGoogleDriveBusy(true);

    try {
      await runGoogleDriveAction(action);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const shouldSignInAgain =
        message === 'Google session expired. Sign in again.' ||
        message === 'Google sign in is required.';

      if (shouldSignInAgain) {
        setGoogleDriveBusy(false);
        await authenticateAndRunGoogleDriveAction(action);
        return;
      }

      handleGoogleDriveError(
        error,
        action === 'backup' ? 'Google Drive backup failed' : 'Google Drive restore failed',
      );
    } finally {
      setGoogleDriveBusy(false);
    }
  }, [
    authenticateAndRunGoogleDriveAction,
    googleAuth,
    googleDriveBusy,
    handleGoogleDriveError,
    runGoogleDriveAction,
  ]);

  const backupToGoogleDrive = useCallback(async () => {
    await performGoogleDriveAction('backup');
  }, [performGoogleDriveAction]);

  const restoreFromGoogleDrive = useCallback(async () => {
    await performGoogleDriveAction('restore');
  }, [performGoogleDriveAction]);

  const getTodoMenuScrollOptions = useCallback(() => {
    const viewportHeight = todoListFrameHeight || windowHeight;
    const menuTop = Math.max(
      TODO_MENU_TARGET_TOP_OFFSET,
      viewportHeight - listMenuHeight - LIST_MENU_BOTTOM_OFFSET,
    );
    const targetTop = Math.max(
      TODO_MENU_TARGET_TOP_OFFSET,
      menuTop - TODO_MENU_TARGET_ESTIMATED_HEIGHT - TODO_MENU_TARGET_GAP,
    );
    const viewPosition = Math.min(
      0.34,
      targetTop / Math.max(1, viewportHeight),
    );

    return {
      viewOffset: TODO_MENU_TARGET_TOP_OFFSET,
      viewPosition: Math.max(0, viewPosition),
    };
  }, [listMenuHeight, todoListFrameHeight, windowHeight]);

  const scrollTodoAboveMenu = useCallback((id: string) => {
    const index = todoListRows.findIndex((row) => (
      row.type === 'todo'
        ? row.todo.id === id
        : row.todos.some((todo) => todo.id === id)
    ));

    if (index < 0) {
      return;
    }

    todoListRef.current?.scrollToIndex({
      animated: true,
      index,
      ...getTodoMenuScrollOptions(),
    });
  }, [getTodoMenuScrollOptions, todoListRows]);

  const handleTodoListScrollToIndexFailed = useCallback((info: ScrollToIndexFailedInfo) => {
    todoListRef.current?.scrollToOffset({
      animated: true,
      offset: Math.max(0, info.averageItemLength * info.index),
    });

    setTimeout(() => {
      todoListRef.current?.scrollToIndex({
        animated: true,
        index: info.index,
        ...getTodoMenuScrollOptions(),
      });
    }, 100);
  }, [getTodoMenuScrollOptions]);

  const openMenuForTodoAction = useCallback((id: string) => {
    setActiveTodoMenuId(id);
    Keyboard.dismiss();
    setMenuMode('main');

    requestAnimationFrame(() => {
      scrollTodoAboveMenu(id);
    });

    Haptics.selectionAsync().catch(() => undefined);
  }, [scrollTodoAboveMenu]);

  const renderTodoItem = useCallback(
    ({ item }: { item: TodoListRow }) => {
      if (item.type === 'section') {
        const isCollapsed = collapsedTodoGroupIds.has(item.id);

        return (
          <View style={styles.todoSectionCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: !isCollapsed }}
              accessibilityLabel={`${item.label}, ${item.count} items`}
              onPress={() => toggleTodoGroupCollapsed(item.id)}
              style={({ pressed }) => [
                styles.todoSectionHeader,
                pressed && styles.todoGroupHeaderPressed,
              ]}
            >
              <Text style={styles.todoSectionTitle}>{item.label}</Text>
              <View style={styles.todoSectionHeaderMeta}>
                <Text style={styles.todoGroupCount}>{item.count}</Text>
                <Ionicons
                  color={THEME_TEXT_SECONDARY}
                  name="chevron-down"
                  size={18}
                  style={!isCollapsed ? styles.todoGroupChevronExpanded : undefined}
                />
              </View>
            </Pressable>
            {!isCollapsed && item.todos.length > 0 ? (
              <View style={styles.todoSectionBody}>
                {item.todos.map((todo, todoIndex) => (
                  <View key={todo.id}>
                    {todoIndex > 0 ? <View style={styles.todoRowDivider} /> : null}
                    <MemoizedSwipeTodoItem
                      filterColors={filterColors}
                      item={todo}
                      isMenuTarget={menuMode !== null && activeTodoMenuId === todo.id}
                      layout="grouped"
                      onDelete={deleteTodo}
                      onListTap={handleListTap}
                      onOpenMenu={openMenuForTodoAction}
                      onSetDone={setTodoDone}
                      sectionLabel={item.label}
                    />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      }

      return (
        <MemoizedSwipeTodoItem
          filterColors={filterColors}
          item={item.todo}
          isMenuTarget={menuMode !== null && activeTodoMenuId === item.todo.id}
          onDelete={deleteTodo}
          onListTap={handleListTap}
          onOpenMenu={openMenuForTodoAction}
          onSetDone={setTodoDone}
        />
      );
    },
    [
      collapsedTodoGroupIds,
      deleteTodo,
      filterColors,
      handleListTap,
      activeTodoMenuId,
      menuMode,
      openMenuForTodoAction,
      setTodoDone,
      toggleTodoGroupCollapsed,
    ],
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.screen}>
        <View style={styles.appHeader}>
          <Text numberOfLines={1} style={styles.appHeaderTitle}>
            {appHeaderTitle}
          </Text>
        </View>

        <View style={styles.headerSearchRow}>
          <View style={styles.searchBox}>
            <Ionicons
              color={THEME_TEXT_SECONDARY}
              name="search"
              size={18}
              style={styles.navSearchIcon}
            />
            <TextInput
              ref={searchInputRef}
              autoCapitalize="sentences"
              autoCorrect
              clearButtonMode="while-editing"
              onBlur={() => {
                setNavTab((current) => (current === 'search' ? null : current));
              }}
              onChangeText={setQuery}
              onFocus={() => {
                setNavTab('search');
                alignTodoListForSearchFocus();
              }}
              placeholder="Search todos…"
              placeholderTextColor={THEME_TEXT_SECONDARY}
              returnKeyType="search"
              selectionColor={NAV_ACCENT}
              style={styles.searchInput}
              textAlignVertical="center"
              value={query}
            />
          </View>
        </View>

        <KeyboardAvoidingView
          behavior={
            Platform.OS === 'ios' && !createDrawerVisible ? 'padding' : undefined
          }
          style={styles.mainKeyboardAvoiding}
        >
        <View style={styles.listShell}>
          {listMenuOpen ? (
            <>
              <PanGestureHandler
                key={submenuOpen ? 'submenu-backdrop-back-pan' : 'root-backdrop-close-pan'}
                activeOffsetY={8}
                enabled={listMenuOpen && isListMenuAtTop}
                failOffsetX={[-36, 36]}
                onGestureEvent={handleMenuDismissGesture}
                onHandlerStateChange={
                  submenuOpen
                    ? handleSubmenuBackGestureStateChange
                    : handleMenuDismissStateChange
                }
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={submenuOpen ? 'Back to main filter menu' : 'Close lists menu'}
                  onPress={() => {
                    if (submenuOpen) {
                      goBackInMenu();
                    } else {
                      closeListMenu();
                    }
                  }}
                  style={styles.listMenuBackdrop}
                />
              </PanGestureHandler>
              <View pointerEvents="box-none" style={styles.listMenuLayer}>
                <PanGestureHandler
                  key={submenuOpen ? 'submenu-menu-back-pan' : 'root-menu-close-pan'}
                  activeOffsetY={8}
                  enabled={listMenuOpen && isListMenuAtTop}
                  failOffsetX={[-36, 36]}
                  onGestureEvent={handleMenuDismissGesture}
                  onHandlerStateChange={
                    submenuOpen
                      ? handleSubmenuBackGestureStateChange
                      : handleMenuDismissStateChange
                  }
                >
                  <Animated.View
                    collapsable={false}
                    style={[
                      styles.listMenu,
                      { height: listMenuHeight },
                      listMenuAnimatedStyle,
                    ]}
                  >
                    <View style={styles.menuDragHandle} accessibilityRole="adjustable">
                      <View style={styles.menuDragPill} />
                    </View>
                    <PanGestureHandler
                      activeOffsetX={[-10000, 32]}
                      enabled={menuMode !== null && menuMode !== 'main'}
                      failOffsetY={[-18, 18]}
                      onHandlerStateChange={handleMenuBackStateChange}
                    >
                      <View collapsable={false} style={styles.listMenuBody}>
                        <FlatList
                          ref={listMenuRef}
                          key={menuMode ?? 'closed'}
                          alwaysBounceVertical={false}
                          bounces={false}
                          contentOffset={{ x: 0, y: listMenuOneHandedOffset }}
                          data={bottomMenuItems}
                          decelerationRate="fast"
                          directionalLockEnabled
                          getItemLayout={(_, index) => ({
                            length: LIST_MENU_ROW_HEIGHT,
                            offset: listMenuOneHandedOffset + LIST_MENU_ROW_HEIGHT * index,
                            index,
                          })}
                          keyExtractor={(item) => item.id}
                          keyboardShouldPersistTaps="handled"
                          ListEmptyComponent={
                            <View style={styles.menuEmptyState}>
                              <Text style={styles.menuEmptyText}>No active filters</Text>
                            </View>
                          }
                          ListFooterComponent={
                            <View
                              pointerEvents="none"
                              style={{ height: listMenuOneHandedOffset }}
                            />
                          }
                          ListHeaderComponent={
                            <View
                              pointerEvents="none"
                              style={{ height: listMenuOneHandedOffset }}
                            />
                          }
                          nestedScrollEnabled
                          onMomentumScrollEnd={handleListMenuScrollSettled}
                          onScroll={handleListMenuScroll}
                          onScrollEndDrag={handleListMenuScrollSettled}
                          overScrollMode="never"
                          scrollEventThrottle={16}
                          style={styles.listMenuList}
                          renderItem={({ item }) => {
                        if ('type' in item) {
                          if (item.type === 'clearFilters') {
                            return (
                              <Pressable
                                accessibilityRole="button"
                                onPress={clearFilters}
                                style={({ pressed }) => [
                                  styles.listMenuRow,
                                  styles.clearFiltersRow,
                                  pressed && styles.listMenuRowPressed,
                                ]}
                              >
                                <View style={styles.listMenuRowTextWrap}>
                                  <Text style={styles.clearFiltersText}>{item.label}</Text>
                                </View>
                                {activeFilterCount ? (
                                  <Text style={styles.listMenuChildCount}>{activeFilterCount}</Text>
                                ) : null}
                              </Pressable>
                            );
                          }

                          if (item.type === 'settings') {
                            return (
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Open settings"
                                onPress={openSettingsModal}
                                style={({ pressed }) => [
                                  styles.listMenuRow,
                                  pressed && styles.listMenuRowPressed,
                                ]}
                              >
                                <View style={styles.listMenuRowTextWrap}>
                                  <Text style={styles.listMenuRowTitle}>{item.label}</Text>
                                </View>
                                <Text style={styles.listMenuArrow}>›</Text>
                              </Pressable>
                            );
                          }

                          if (item.type === 'filter') {
                            const colorTheme = getFilterColorTheme(filterColors, item.filterKey, item.label);

                            return (
                              <View style={styles.listMenuRow}>
                                <Pressable
                                  accessibilityRole="button"
                                  onPress={() => removeFilter(item.filterKey, item.label)}
                                  style={({ pressed }) => [
                                    styles.listMenuRowMainPress,
                                    pressed && styles.listMenuRowPressed,
                                  ]}
                                >
                                  <View style={styles.listMenuRowTextWrap}>
                                    <View
                                      style={[
                                        styles.listMenuColorDot,
                                        { backgroundColor: colorTheme.accent },
                                      ]}
                                    />
                                    <Text style={styles.listMenuRowTitle}>{item.label}</Text>
                                  </View>
                                </Pressable>
                                <View style={styles.listMenuSubmenuZone}>
                                  <Text style={[styles.filterTypeText, { color: colorTheme.text }]}>
                                    {item.filterKey}
                                  </Text>
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`Remove ${item.label}`}
                                    hitSlop={LIST_MENU_ICON_HIT_SLOP}
                                    onPress={() => removeFilter(item.filterKey, item.label)}
                                    style={({ pressed }) => [
                                      styles.listMenuClearButton,
                                      pressed && styles.listMenuClearButtonPressed,
                                    ]}
                                  >
                                    <Text style={styles.listMenuClearButtonText}>×</Text>
                                  </Pressable>
                                </View>
                              </View>
                            );
                          }

                          if (item.type === 'sortOption') {
                            const isSelected = effectiveSortMode === item.sortMode;

                            return (
                              <Pressable
                                accessibilityRole="button"
                                accessibilityState={{ selected: isSelected }}
                                onPress={() => selectTodoSortMode(item.sortMode)}
                                style={({ pressed }) => [
                                  styles.listMenuRow,
                                  isSelected && styles.listMenuRowSelected,
                                  pressed && styles.listMenuRowPressed,
                                ]}
                              >
                                <View style={styles.listMenuRowTextWrap}>
                                  <Text style={styles.listMenuRowTitle}>{item.label}</Text>
                                </View>
                                {isSelected ? <Text style={styles.listMenuCheck}>✓</Text> : null}
                              </Pressable>
                            );
                          }

	                          if (item.type === 'groupOption') {
	                            const isSelected = effectiveGroupMode === item.groupMode;

	                            return (
                              <Pressable
                                accessibilityRole="button"
                                accessibilityState={{ selected: isSelected }}
                                onPress={() => selectTodoGroupMode(item.groupMode)}
                                style={({ pressed }) => [
                                  styles.listMenuRow,
                                  isSelected && styles.listMenuRowSelected,
                                  pressed && styles.listMenuRowPressed,
                                ]}
                              >
                                <View style={styles.listMenuRowTextWrap}>
                                  <Text style={styles.listMenuRowTitle}>{item.label}</Text>
                                </View>
                                {isSelected ? <Text style={styles.listMenuCheck}>✓</Text> : null}
                              </Pressable>
	                            );
	                          }

	                          if (item.type === 'savePreset') {
	                            return (
	                              <Pressable
	                                accessibilityRole="button"
	                                onPress={openSavePresetPrompt}
	                                style={({ pressed }) => [
	                                  styles.listMenuRow,
	                                  pressed && styles.listMenuRowPressed,
	                                ]}
	                              >
	                                <View style={styles.listMenuRowTextStack}>
	                                  <Text style={styles.listMenuRowTitle}>{item.label}</Text>
	                                  <Text numberOfLines={1} style={styles.listMenuRowSummary}>
	                                    {item.summary}
	                                  </Text>
	                                </View>
	                                <Text style={styles.listMenuApplyText}>+</Text>
	                              </Pressable>
	                            );
	                          }

	                          if (item.type === 'quickApplyPreset') {
	                            return (
	                              <Pressable
	                                accessibilityRole="button"
	                                onPress={() => applyMenuPreset(item.preset)}
	                                style={({ pressed }) => [
	                                  styles.listMenuRow,
	                                  pressed && styles.listMenuRowPressed,
	                                ]}
	                              >
	                                <View style={styles.listMenuRowTextStack}>
	                                  <Text style={styles.listMenuRowTitle}>{item.label}</Text>
	                                  <Text numberOfLines={1} style={styles.listMenuRowSummary}>
	                                    {item.summary}
	                                  </Text>
	                                </View>
	                                <Text style={styles.listMenuApplyText}>Apply</Text>
	                              </Pressable>
	                            );
	                          }

	                          if (item.type === 'preset') {
	                            return (
	                              <MemoizedMenuPresetSwipeRow
	                                label={item.label}
	                                onApply={() => applyMenuPreset(item.preset)}
	                                onDelete={() => removeMenuPreset(item.preset.id)}
	                                summary={item.summary}
	                              />
	                            );
	                          }

	                          if (item.type === 'menu') {
	                            const canClearSection = menuSectionCanClear(
	                              item.menuMode,
	                              menuFilters,
	                              activeFilterCount,
	                              effectiveSortMode,
	                              effectiveGroupMode,
	                              listMenuTree,
	                              activeListDisplay,
	                            );

	                            return (
	                              <View style={styles.listMenuRow}>
	                                <Pressable
	                                  accessibilityRole="button"
	                                  onPress={() => setMenuMode(item.menuMode)}
	                                  style={({ pressed }) => [
	                                    styles.listMenuRowMainPress,
	                                    pressed && styles.listMenuRowPressed,
	                                  ]}
	                                >
	                                  <View style={styles.listMenuRowTextWrap}>
	                                    <Text style={styles.listMenuRowTitle}>{item.label}</Text>
	                                  </View>
	                                </Pressable>
	                                <View style={styles.listMenuSubmenuZone}>
	                                  {item.valueLabel ? (
	                                    <Text numberOfLines={1} style={styles.listMenuValueText}>
	                                      {item.valueLabel}
	                                    </Text>
	                                  ) : item.count ? (
	                                    <Text style={styles.listMenuChildCount}>{item.count}</Text>
	                                  ) : null}
	                                  {canClearSection ? (
	                                    <Pressable
	                                      accessibilityRole="button"
	                                      accessibilityLabel={`Clear ${item.label}`}
	                                      hitSlop={LIST_MENU_ICON_HIT_SLOP}
	                                      onPress={() => clearMenuSection(item.menuMode)}
	                                      style={({ pressed }) => [
	                                        styles.listMenuClearButton,
	                                        pressed && styles.listMenuClearButtonPressed,
	                                      ]}
	                                    >
	                                      <Text style={styles.listMenuClearButtonText}>×</Text>
	                                    </Pressable>
	                                  ) : null}
	                                  <Pressable
	                                    accessibilityRole="button"
	                                    accessibilityLabel={`Open ${item.label}`}
	                                    hitSlop={LIST_MENU_ICON_HIT_SLOP}
	                                    onPress={() => setMenuMode(item.menuMode)}
	                                    style={({ pressed }) => [
	                                      styles.listMenuArrowButton,
	                                      pressed && styles.listMenuArrowButtonPressed,
	                                    ]}
	                                  >
	                                    <Text style={styles.listMenuArrow}>›</Text>
	                                  </Pressable>
	                                </View>
	                              </View>
	                            );
	                          }

                          if (item.type !== 'value') {
                            return null;
                          }

                          const isSelected = menuFilters[item.filterKey].includes(item.label);
                          const colorTheme = getFilterColorTheme(filterColors, item.filterKey, item.label);

                          return (
                            <View
                              style={[
                                styles.listMenuRow,
                                isSelected && styles.listMenuRowSelected,
                                isSelected && {
                                  backgroundColor: colorTheme.tint,
                                  borderBottomColor: colorTheme.border,
                                },
                              ]}
                            >
                              <Pressable
                                accessibilityRole="button"
                                onPress={() => (
                                  item.filterKey === 'date'
                                    ? handleDateMenuLabelPress(item.label)
                                    : toggleFilterValue(item.filterKey, item.label)
                                )}
                                style={({ pressed }) => [
                                  styles.listMenuRowMainPress,
                                  pressed && styles.listMenuRowPressed,
                                ]}
                              >
                                <View style={styles.listMenuRowTextWrap}>
                                  <View
                                    style={[
                                      styles.listMenuColorDot,
                                      { backgroundColor: colorTheme.accent },
                                    ]}
                                  />
                                  <Text style={styles.listMenuRowTitle}>{item.label}</Text>
                                </View>
                              </Pressable>
                              {isSelected ? (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`Clear ${item.label}`}
                                  hitSlop={LIST_MENU_ICON_HIT_SLOP}
                                  onPress={() => removeFilter(item.filterKey, item.label)}
                                  style={({ pressed }) => [
                                    styles.listMenuClearButton,
                                    pressed && styles.listMenuClearButtonPressed,
                                  ]}
                                >
                                  <Text style={[styles.listMenuClearButtonText, { color: colorTheme.text }]}>
                                    ×
                                  </Text>
                                </Pressable>
                              ) : null}
                            </View>
                          );
                        }

                        const isSelected = isListMenuItemSelected(item, menuFilters.list, listMenuTree);
                        const listColorTheme = getFilterColorTheme(
                          filterColors,
                          'list',
                          item.isSubsection && item.parentLabel ? item.parentLabel : item.label,
                        );

                        return (
                          <View
                            style={[
                              styles.listMenuRow,
                              item.depth > 0 && styles.listMenuRowIndented,
                              isSelected && styles.listMenuRowSelected,
                              isSelected && {
                                backgroundColor: listColorTheme.tint,
                                borderBottomColor: listColorTheme.border,
                              },
                            ]}
                          >
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={
                                item.isSubsection
                                  ? `${item.label} subsection of ${item.parentLabel}`
                                  : item.label
                              }
                              onPress={() => toggleListMenuItem(item)}
                              style={({ pressed }) => [
                                styles.listMenuRowMainPress,
                                pressed && styles.listMenuRowPressed,
                              ]}
                            >
                              <View style={styles.listMenuRowTextWrap}>
                                {item.isSubsection ? (
                                  <Text style={styles.listMenuSubsectionMarker}>└</Text>
                                ) : (
                                  <View
                                    style={[
                                      styles.listMenuColorDot,
                                      { backgroundColor: listColorTheme.accent },
                                    ]}
                                  />
                                )}
                                <Text
                                  style={[
                                    styles.listMenuRowTitle,
                                    item.isSubsection && styles.listMenuRowTitleSubsection,
                                  ]}
                                >
                                  {item.label}
                                </Text>
                              </View>
                            </Pressable>
                            {isSelected ? (
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Clear ${item.label}`}
                                hitSlop={LIST_MENU_ICON_HIT_SLOP}
                                onPress={() => removeListMenuItem(item)}
                                style={({ pressed }) => [
                                  styles.listMenuClearButton,
                                  pressed && styles.listMenuClearButtonPressed,
                                ]}
                              >
                                <Text style={[styles.listMenuClearButtonText, { color: listColorTheme.text }]}>
                                  ×
                                </Text>
                              </Pressable>
                            ) : null}
                          </View>
                        );
                      }}
                      showsVerticalScrollIndicator={false}
                      snapToAlignment="start"
                      snapToInterval={LIST_MENU_ROW_HEIGHT}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={submenuOpen ? 'Back to main filter menu' : 'Close filter menu'}
                      onPress={() => {
                        if (submenuOpen) {
                          goBackInMenu();
                        } else {
                          closeListMenu();
                        }
                      }}
                      style={({ pressed }) => [
                        styles.listMenuFooterButton,
                        pressed && styles.listMenuRowPressed,
                      ]}
                    >
                      <Text style={styles.listMenuBackIcon}>{submenuOpen ? '‹' : '×'}</Text>
                      <Text style={styles.listMenuBackText}>{submenuOpen ? 'Back' : 'Close'}</Text>
                    </Pressable>
                      </View>
                    </PanGestureHandler>
                  </Animated.View>
                </PanGestureHandler>
              </View>
              {submenuOpen ? (
                <>
                  <PanGestureHandler
                    activeOffsetX={[-8, 8]}
                    failOffsetY={[-18, 18]}
                    onHandlerStateChange={handleLeftEdgeBackStateChange}
                  >
                    <View
                      collapsable={false}
                      pointerEvents="box-only"
                      style={[styles.edgeBackZone, styles.edgeBackZoneLeft]}
                    />
                  </PanGestureHandler>
                  <PanGestureHandler
                    activeOffsetX={[-8, 8]}
                    failOffsetY={[-18, 18]}
                    onHandlerStateChange={handleRightEdgeBackStateChange}
                  >
                    <View
                      collapsable={false}
                      pointerEvents="box-only"
                      style={[styles.edgeBackZone, styles.edgeBackZoneRight]}
                    />
                  </PanGestureHandler>
                </>
              ) : null}
            </>
          ) : null}

          <View
            collapsable={false}
            onTouchEnd={handleListFrameTouchEnd}
            onTouchStart={handleListFrameTouchStart}
            style={styles.todoListTapFrame}
          >
            <View
              collapsable={false}
              onLayout={handleTodoListFrameLayout}
              style={styles.todoListFrame}
            >
              {showSearchFiltersPanel ? (
                <ScrollView
                  contentContainerStyle={styles.searchFiltersContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={styles.searchFiltersPanel}
                >
                  {searchFilterItems.length === 0 ? (
                    <View style={styles.searchFiltersEmpty}>
                      <Text style={styles.searchFiltersEmptyTitle}>No active filters</Text>
                      <Text style={styles.searchFiltersEmptyText}>
                        Type in the search field to find todos.
                      </Text>
                    </View>
                  ) : (
                    searchFilterItems.map((item) => {
                      const colorTheme = getFilterColorTheme(
                        filterColors,
                        item.filterKey,
                        item.label,
                      );

                      return (
                        <View key={item.id} style={styles.searchFilterRow}>
                          <View
                            style={[
                              styles.listMenuColorDot,
                              { backgroundColor: colorTheme.accent },
                            ]}
                          />
                          <View style={styles.searchFilterRowText}>
                            <Text style={styles.searchFilterLabel}>{item.label}</Text>
                            <Text style={styles.filterTypeText}>
                              {FILTER_KIND_LABELS[item.filterKey]}
                            </Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                  <Text style={styles.searchFiltersMeta}>{searchContextSummary}</Text>
                </ScrollView>
              ) : (
                <FlatList
                  ref={todoListRef}
                  alwaysBounceVertical={false}
                  bounces={false}
                  contentContainerStyle={[
                    styles.listContent,
                    activeTodoMenuId !== null &&
                      listMenuOpen && {
                        paddingBottom: listMenuHeight + LIST_MENU_BOTTOM_OFFSET + 104,
                      },
                    filteredTodos.length === 0 && styles.emptyListContent,
                  ]}
                  contentOffset={todoListContentOffset}
                  data={todoListRows}
                  keyboardDismissMode="on-drag"
                  keyboardShouldPersistTaps="handled"
                  keyExtractor={(item) => item.id}
                  ListEmptyComponent={
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyIcon}>
                        {query.trim() ? '⌕' : '✎'}
                      </Text>
                      <Text style={styles.emptyTitle}>
                        {query.trim() ? 'No matching items' : 'No items yet'}
                      </Text>
                      <Text style={styles.emptyText}>
                        {query.trim()
                          ? 'Try a different search term.'
                          : 'Tap the + button to add a todo.'}
                      </Text>
                    </View>
                  }
                  ListFooterComponent={
                    todoListOneHandedOffset > 0 ? (
                      <View
                        pointerEvents="none"
                        style={{ height: todoListOneHandedOffset }}
                      />
                    ) : null
                  }
                  ListHeaderComponent={
                    todoListOneHandedOffset > 0 ? (
                      <View
                        pointerEvents="none"
                        style={{ height: todoListOneHandedOffset }}
                      />
                    ) : null
                  }
                  onScroll={handleListScroll}
                  onScrollToIndexFailed={handleTodoListScrollToIndexFailed}
                  renderItem={renderTodoItem}
                  scrollEventThrottle={16}
                  showsVerticalScrollIndicator={false}
                />
              )}
            </View>
          </View>

          {!listMenuOpen && !createDrawerVisible && !showSearchFiltersPanel ? (
            <View pointerEvents="box-none" style={styles.createFabLayer}>
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Opens the new todo drawer"
                accessibilityLabel="Add todo"
                onPress={() => openCreateDrawer(query)}
                style={({ pressed }) => [
                  styles.createFab,
                  pressed && styles.createFabPressed,
                ]}
              >
                <Text style={styles.createFabText}>+</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.bottomNav}>
          <View style={styles.bottomNavItem} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Calendar"
            accessibilityState={{ selected: navTab === 'calendar' || menuMode === 'date' }}
            onPress={() => handleNavTabPress('calendar')}
            style={({ pressed }) => [
              styles.bottomNavItem,
              pressed && styles.bottomNavItemPressed,
            ]}
          >
            <Ionicons
              color={navTab === 'calendar' || menuMode === 'date' ? NAV_ACCENT : NAV_ICON_INACTIVE}
              name="calendar-outline"
              size={24}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open filter menu"
            accessibilityState={{ selected: navTab === 'menu' || menuMode === 'main' }}
            onPress={() => handleNavTabPress('menu')}
            style={({ pressed }) => [
              styles.bottomNavItem,
              pressed && styles.bottomNavItemPressed,
            ]}
          >
            <Ionicons
              color={navTab === 'menu' || menuMode === 'main' ? NAV_ACCENT : NAV_ICON_INACTIVE}
              name="apps-outline"
              size={24}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search"
            accessibilityState={{ selected: navTab === 'search' }}
            onPress={() => handleNavTabPress('search')}
            style={({ pressed }) => [
              styles.bottomNavItem,
              pressed && styles.bottomNavItemPressed,
            ]}
          >
            <Ionicons
              color={navTab === 'search' ? NAV_ACCENT : NAV_ICON_INACTIVE}
              name="search-outline"
              size={24}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            accessibilityState={{ selected: navTab === 'settings' }}
            onPress={() => handleNavTabPress('settings')}
            style={({ pressed }) => [
              styles.bottomNavItem,
              pressed && styles.bottomNavItemPressed,
            ]}
          >
            <Ionicons
              color={navTab === 'settings' ? NAV_ACCENT : NAV_ICON_INACTIVE}
              name="settings-outline"
              size={24}
            />
          </Pressable>
        </View>

        </KeyboardAvoidingView>

        <Modal
          animationType="fade"
          onRequestClose={closeCreateDrawer}
          statusBarTranslucent={Platform.OS === 'android'}
          transparent
          visible={createDrawerVisible}
        >
          <View style={styles.createDrawerModalRoot}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close new todo"
              onPress={closeCreateDrawer}
              style={styles.createDrawerBackdrop}
            />
            <View
              pointerEvents="box-none"
              style={[styles.createDrawerLayer, { bottom: createDrawerKeyboardInset }]}
            >
              <View style={styles.createDrawer}>
                <View style={styles.menuDragHandle} accessibilityRole="adjustable">
                  <View style={styles.menuDragPill} />
                </View>
                {createDrawerPicker ? (
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    style={[styles.createDrawerPicker, { maxHeight: createDrawerPickerMaxHeight }]}
                  >
                    {createDrawerPickerItems.map((label) => {
                      const selected =
                        createDrawerPicker === 'priority'
                          ? (
                            label === 'None'
                              ? createDraftFilters.priority.length === 0
                              : createDraftFilters.priority[0] === label
                          )
                          : createDraftFilters[createDrawerPicker][0] === label;

                      return (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          key={`${createDrawerPicker}-${label}`}
                          onPress={() => (
                            createDrawerPicker === 'date'
                              ? handleCreateDrawerDatePress(label)
                              : setCreateDraftFilterValue(createDrawerPicker, label)
                          )}
                          style={({ pressed }) => [
                            styles.createDrawerPickerRow,
                            selected && styles.createDrawerPickerRowSelected,
                            pressed && styles.createDrawerPickerRowPressed,
                          ]}
                        >
                          <Text
                            style={[
                              styles.createDrawerPickerRowText,
                              selected && styles.createDrawerPickerRowTextSelected,
                            ]}
                          >
                            {label}
                          </Text>
                          {selected ? (
                            <Ionicons color={THEME_ACCENT} name="checkmark" size={18} />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <TextInput
                    ref={createInputRef}
                    autoCapitalize="sentences"
                    autoCorrect
                    blurOnSubmit={false}
                    multiline
                    onChangeText={setCreateDraftText}
                    onSubmitEditing={submitCreateTodo}
                    placeholder="What would you like to do?"
                    placeholderTextColor="#B5ADA5"
                    returnKeyType="done"
                    selectionColor="#2F6F62"
                    style={styles.createDrawerInput}
                    textAlignVertical="top"
                    value={createDraftText}
                  />
                )}
                <View style={styles.createDrawerToolbar}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Date: ${createDrawerDateLabel}`}
                    onPress={() => openCreateDrawerPicker('date')}
                    style={({ pressed }) => [
                      styles.createDrawerToolbarButton,
                      pressed && styles.createDrawerToolbarButtonPressed,
                      createDrawerPicker === 'date' && styles.createDrawerToolbarButtonActive,
                    ]}
                  >
                    <Ionicons
                      color={createDraftFilters.date.length > 0 ? '#2F6F62' : '#8C847C'}
                      name="calendar-outline"
                      size={22}
                    />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      createDrawerPriorityHigh ? 'Remove high priority' : 'Set high priority'
                    }
                    onPress={toggleCreateDraftPriority}
                    style={({ pressed }) => [
                      styles.createDrawerToolbarButton,
                      pressed && styles.createDrawerToolbarButtonPressed,
                    ]}
                  >
                    <Ionicons
                      color={createDrawerPriorityHigh ? '#CF413A' : '#8C847C'}
                      name={createDrawerPriorityHigh ? 'flag' : 'flag-outline'}
                      size={22}
                    />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Set priority"
                    onPress={() => openCreateDrawerPicker('priority')}
                    style={({ pressed }) => [
                      styles.createDrawerToolbarButton,
                      pressed && styles.createDrawerToolbarButtonPressed,
                      createDrawerPicker === 'priority' && styles.createDrawerToolbarButtonActive,
                    ]}
                  >
                    <Ionicons
                      color={
                        createDraftPriorityFromPicker &&
                        createDraftFilters.priority.length > 0
                          ? '#2F6F62'
                          : '#8C847C'
                      }
                      name="pricetag-outline"
                      size={22}
                    />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`List: ${createDrawerListLabel}`}
                    onPress={() => openCreateDrawerPicker('list')}
                    style={({ pressed }) => [
                      styles.createDrawerInboxChip,
                      pressed && styles.createDrawerToolbarButtonPressed,
                      createDrawerPicker === 'list' && styles.createDrawerInboxChipActive,
                    ]}
                  >
                    <Ionicons color={THEME_ACCENT} name="file-tray-outline" size={18} />
                    <Text numberOfLines={1} style={styles.createDrawerInboxChipText}>
                      {createDrawerListLabel}
                    </Text>
                  </Pressable>
                  <View style={styles.createDrawerToolbarSpacer} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      createDrawerPicker
                        ? 'Back to task title'
                        : 'Close new todo'
                    }
                    hitSlop={8}
                    onPress={handleCreateDrawerClosePress}
                    style={({ pressed }) => [
                      styles.createDrawerToolbarButton,
                      pressed && styles.createDrawerToolbarButtonPressed,
                    ]}
                  >
                    <Ionicons
                      color="#8C847C"
                      name={createDrawerPicker ? 'arrow-back' : 'close'}
                      size={24}
                    />
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </Modal>

        {datePickerVisible && Platform.OS === 'android' ? (
          <DateTimePicker
            display="calendar"
            mode="date"
            onChange={handleDatePickerChange}
            value={datePickerValue}
          />
        ) : null}

        <Modal
          animationType="fade"
          onRequestClose={closeDatePicker}
          transparent
          visible={datePickerVisible && Platform.OS === 'ios'}
        >
          <View style={styles.datePickerModalRoot}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss date picker"
              onPress={closeDatePicker}
              style={styles.datePickerBackdrop}
            />
            <View style={styles.datePickerSheet}>
              <View style={styles.datePickerHeader}>
                <Pressable
                  accessibilityRole="button"
                  onPress={closeDatePicker}
                  style={({ pressed }) => [
                    styles.datePickerHeaderButton,
                    pressed && styles.datePickerHeaderButtonPressed,
                  ]}
                >
                  <Text style={styles.datePickerHeaderButtonText}>Cancel</Text>
                </Pressable>
                <Text style={styles.datePickerHeaderTitle}>Pick a date</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => applyPickedDate(datePickerValue)}
                  style={({ pressed }) => [
                    styles.datePickerHeaderButton,
                    pressed && styles.datePickerHeaderButtonPressed,
                  ]}
                >
                  <Text style={[styles.datePickerHeaderButtonText, styles.datePickerHeaderDone]}>
                    Done
                  </Text>
                </Pressable>
              </View>
              <DateTimePicker
                display="inline"
                mode="date"
                onChange={handleDatePickerChange}
                style={styles.datePickerControl}
                value={datePickerValue}
              />
            </View>
          </View>
        </Modal>

        <Modal
          animationType="slide"
          onRequestClose={closeSettingsModal}
          presentationStyle="fullScreen"
          visible={settingsModalVisible}
        >
          <SafeAreaView style={styles.settingsModal}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.settingsHeader}>
              <View style={styles.settingsHeaderTextWrap}>
                <Text style={styles.settingsTitle}>Settings</Text>
                <Text style={styles.settingsSubtitle}>Preferences</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close settings"
                onPress={closeSettingsModal}
                style={({ pressed }) => [
                  styles.settingsCloseButton,
                  pressed && styles.settingsCloseButtonPressed,
                ]}
              >
                <Text style={styles.settingsCloseIcon}>×</Text>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.settingsBodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.settingsBody}
            >
              <View style={styles.settingsSection}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: settingsBackupExpanded }}
                  onPress={() => setSettingsBackupExpanded((current) => !current)}
                  style={({ pressed }) => [
                    styles.settingsSectionHeader,
                    pressed && styles.settingsOptionRowPressed,
                  ]}
                >
                  <View style={styles.settingsRowTextWrap}>
                    <Text style={styles.settingsSectionTitle}>Backup</Text>
                    <Text style={styles.settingsSectionSubtitle}>
                      Google Drive · {googleConnected ? 'Connected' : 'Not signed in'}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.settingsSectionChevron,
                      settingsBackupExpanded && styles.settingsSectionChevronExpanded,
                    ]}
                  >
                    ›
                  </Text>
                </Pressable>

                {settingsBackupExpanded ? (
                  <View style={styles.settingsCard}>
                    <View style={styles.settingsRow}>
                      <View style={styles.settingsRowTextWrap}>
                        <Text style={styles.settingsRowTitle}>Backup all data</Text>
                        <Text style={styles.settingsRowSubtitle}>
                          {todos.length} todos · {selectedFilters.list.length + selectedFilters.priority.length + selectedFilters.date.length} filters
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.settingsStatusPill,
                          googleConnected && styles.settingsStatusPillEnabled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.settingsStatusText,
                            googleConnected && styles.settingsStatusTextEnabled,
                          ]}
                        >
                          {googleConnected ? 'Connected' : 'Not signed in'}
                        </Text>
                      </View>
                    </View>

                    {!googleOAuthConfigured ? (
                      <Text style={styles.settingsWarningText}>
                        Google sign-in is not configured for this build. Add the EXPO_PUBLIC_GOOGLE_* client IDs and rebuild.
                      </Text>
                    ) : null}

                    <Pressable
                      accessibilityRole="switch"
                      accessibilityState={{ checked: googleDriveBackupEnabled }}
                      disabled={googleDriveBusy}
                      onPress={toggleGoogleDriveBackup}
                      style={({ pressed }) => [
                        styles.settingsOptionRow,
                        googleDriveBusy && styles.settingsButtonDisabled,
                        pressed && styles.settingsOptionRowPressed,
                      ]}
                    >
                      <Text style={styles.settingsOptionText}>Auto backup</Text>
                      <Text style={styles.settingsOptionValue}>
                        {googleDriveBackupEnabled ? 'Enabled' : 'Disabled'}
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      disabled={googleDriveBusy || !googleDriveActionReady}
                      onPress={backupToGoogleDrive}
                      style={({ pressed }) => [
                        styles.settingsPrimaryButton,
                        (googleDriveBusy || !googleDriveActionReady) && styles.settingsButtonDisabled,
                        pressed && styles.settingsPrimaryButtonPressed,
                      ]}
                    >
                      <Text style={styles.settingsPrimaryButtonText}>
                        {googleDriveBusy ? 'Working...' : 'Back up to Google Drive'}
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      disabled={googleDriveBusy || !googleDriveActionReady}
                      onPress={restoreFromGoogleDrive}
                      style={({ pressed }) => [
                        styles.settingsRestoreButton,
                        (googleDriveBusy || !googleDriveActionReady) && styles.settingsButtonDisabled,
                        pressed && styles.settingsSecondaryButtonPressed,
                      ]}
                    >
                      <Text style={styles.settingsRestoreButtonText}>Restore from Google Drive</Text>
                    </Pressable>

                    {googleConnected ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={googleDriveBusy}
                        onPress={disconnectGoogleDrive}
                        style={({ pressed }) => [
                          styles.settingsDisconnectButton,
                          googleDriveBusy && styles.settingsButtonDisabled,
                          pressed && styles.settingsSecondaryButtonPressed,
                        ]}
                      >
                        <Text style={styles.settingsDisconnectButtonText}>Disconnect Google Drive</Text>
                      </Pressable>
                    ) : null}

                    <Text style={styles.settingsBackupStatus}>{googleDriveBackupStatus}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.settingsSection}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: settingsListsExpanded }}
                  onPress={() => setSettingsListsExpanded((current) => !current)}
                  style={({ pressed }) => [
                    styles.settingsSectionHeader,
                    pressed && styles.settingsOptionRowPressed,
                  ]}
                >
                  <View style={styles.settingsRowTextWrap}>
                    <Text style={styles.settingsSectionTitle}>Lists</Text>
                    <Text style={styles.settingsSectionSubtitle}>
                      {listMenuTree.length} items · {listOrderMode === 'alphabetical' ? 'Alphabetical' : 'Manual order'}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.settingsSectionChevron,
                      settingsListsExpanded && styles.settingsSectionChevronExpanded,
                    ]}
                  >
                    ›
                  </Text>
                </Pressable>

                {settingsListsExpanded ? (
                  <View style={styles.settingsCard}>
                    <View style={styles.settingsSegmentedControl}>
                      {(['alphabetical', 'manual'] as ListOrderMode[]).map((mode) => {
                        const selected = listOrderMode === mode;
                        return (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            key={mode}
                            onPress={() => setListOrderMode(mode)}
                            style={({ pressed }) => [
                              styles.settingsSegmentButton,
                              selected && styles.settingsSegmentButtonSelected,
                              pressed && styles.settingsOptionRowPressed,
                            ]}
                          >
                            <Text
                              style={[
                                styles.settingsSegmentButtonText,
                                selected && styles.settingsSegmentButtonTextSelected,
                              ]}
                            >
                              {mode === 'alphabetical' ? 'Alphabetical' : 'Manual'}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <View style={styles.settingsAddListRow}>
                      <TextInput
                        autoCapitalize="words"
                        onChangeText={setNewListName}
                        onSubmitEditing={addSettingsList}
                        placeholder="New list"
                        placeholderTextColor="#A69D94"
                        returnKeyType="done"
                        style={styles.settingsAddListInput}
                        value={newListName}
                      />
                      <Pressable
                        accessibilityRole="button"
                        disabled={!newListName.trim()}
                        onPress={addSettingsList}
                        style={({ pressed }) => [
                          styles.settingsAddListButton,
                          !newListName.trim() && styles.settingsButtonDisabled,
                          pressed && styles.settingsPrimaryButtonPressed,
                        ]}
                      >
                        <Text style={styles.settingsAddListButtonText}>Add</Text>
                      </Pressable>
                    </View>

                    <View style={styles.settingsListEditor}>
                      {listMenuTree.map((item, index) => (
                        <View key={`${item.label}-${index}`} style={styles.settingsListGroup}>
                          <View style={styles.settingsListEditRow}>
                            <PanGestureHandler
                              activeOffsetY={[-6, 6]}
                              failOffsetX={[-18, 18]}
                              onHandlerStateChange={(event) => {
                                const { state, translationY } = event.nativeEvent;
                                if (state === State.END && Math.abs(translationY) > 18) {
                                  moveSettingsList(index, translationY > 0 ? 1 : -1);
                                }
                              }}
                            >
                              <View collapsable={false} style={styles.settingsListDragZone}>
                                <Text style={styles.settingsListDragHandle}>☰</Text>
                              </View>
                            </PanGestureHandler>
                            <View style={styles.settingsListTextWrap}>
                              <Text style={styles.settingsListTitle}>{item.label}</Text>
                              {item.children?.length ? (
                                <Text style={styles.settingsListSubtitle}>
                                  {item.children.length} subsection{item.children.length === 1 ? '' : 's'}
                                </Text>
                              ) : null}
                            </View>
                            <View style={styles.settingsListActions}>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Add subsection to ${item.label}`}
                                onPress={() => {
                                  setSubsectionParentIndex(index);
                                  setNewSubsectionName('');
                                }}
                                style={({ pressed }) => [
                                  styles.settingsIconButton,
                                  subsectionParentIndex === index && styles.settingsIconButtonActive,
                                  pressed && styles.settingsOptionRowPressed,
                                ]}
                              >
                                <Text style={styles.settingsIconButtonText}>+</Text>
                              </Pressable>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Move ${item.label} up`}
                                disabled={index === 0}
                                onPress={() => moveSettingsList(index, -1)}
                                style={({ pressed }) => [
                                  styles.settingsIconButton,
                                  index === 0 && styles.settingsButtonDisabled,
                                  pressed && styles.settingsOptionRowPressed,
                                ]}
                              >
                                <Text style={styles.settingsIconButtonText}>↑</Text>
                              </Pressable>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Move ${item.label} down`}
                                disabled={index === listMenuTree.length - 1}
                                onPress={() => moveSettingsList(index, 1)}
                                style={({ pressed }) => [
                                  styles.settingsIconButton,
                                  index === listMenuTree.length - 1 && styles.settingsButtonDisabled,
                                  pressed && styles.settingsOptionRowPressed,
                                ]}
                              >
                                <Text style={styles.settingsIconButtonText}>↓</Text>
                              </Pressable>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Remove ${item.label}`}
                                onPress={() => removeSettingsList(index)}
                                style={({ pressed }) => [
                                  styles.settingsIconButton,
                                  styles.settingsDangerIconButton,
                                  pressed && styles.settingsOptionRowPressed,
                                ]}
                              >
                                <Text style={styles.settingsDangerIconButtonText}>×</Text>
                              </Pressable>
                            </View>
                          </View>
                          {item.children?.map((child, childIndex) => (
                            <View
                              key={`${item.label}-${child.label}-${childIndex}`}
                              style={styles.settingsListSubsectionRow}
                            >
                              <Text style={styles.settingsListSubsectionLabel}>{child.label}</Text>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Remove subsection ${child.label}`}
                                onPress={() => removeSettingsListSubsection(index, childIndex)}
                                style={({ pressed }) => [
                                  styles.settingsIconButton,
                                  styles.settingsDangerIconButton,
                                  pressed && styles.settingsOptionRowPressed,
                                ]}
                              >
                                <Text style={styles.settingsDangerIconButtonText}>×</Text>
                              </Pressable>
                            </View>
                          ))}
                          {subsectionParentIndex === index ? (
                            <View style={styles.settingsSubsectionComposer}>
                              <TextInput
                                autoCapitalize="sentences"
                                autoCorrect
                                onChangeText={setNewSubsectionName}
                                onSubmitEditing={() => addSettingsListSubsection(index)}
                                placeholder="Subsection name"
                                placeholderTextColor={THEME_TEXT_SECONDARY}
                                returnKeyType="done"
                                style={styles.settingsSubsectionInput}
                                value={newSubsectionName}
                              />
                              <Pressable
                                accessibilityRole="button"
                                disabled={!newSubsectionName.trim()}
                                onPress={() => addSettingsListSubsection(index)}
                                style={({ pressed }) => [
                                  styles.settingsAddListButton,
                                  !newSubsectionName.trim() && styles.settingsButtonDisabled,
                                  pressed && styles.settingsPrimaryButtonPressed,
                                ]}
                              >
                                <Text style={styles.settingsAddListButtonText}>Add</Text>
                              </Pressable>
                              <Pressable
                                accessibilityRole="button"
                                onPress={() => {
                                  setSubsectionParentIndex(null);
                                  setNewSubsectionName('');
                                }}
                                style={({ pressed }) => [
                                  styles.settingsIconButton,
                                  pressed && styles.settingsOptionRowPressed,
                                ]}
                              >
                                <Text style={styles.settingsIconButtonText}>×</Text>
                              </Pressable>
                            </View>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>

              <View style={styles.settingsSection}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: settingsColorsExpanded }}
                  onPress={() => setSettingsColorsExpanded((current) => !current)}
                  style={({ pressed }) => [
                    styles.settingsSectionHeader,
                    pressed && styles.settingsOptionRowPressed,
                  ]}
                >
                  <View style={styles.settingsRowTextWrap}>
                    <Text style={styles.settingsSectionTitle}>Colors</Text>
                    <Text style={styles.settingsSectionSubtitle}>
                      {settingsColorItemCount} items · Priority, dates, lists
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.settingsSectionChevron,
                      settingsColorsExpanded && styles.settingsSectionChevronExpanded,
                    ]}
                  >
                    ›
                  </Text>
                </Pressable>

                {settingsColorsExpanded ? (
                  <View style={styles.settingsCard}>
                    {settingsColorGroups.map((group, groupIndex) => (
                      <View
                        key={group.filterKey}
                        style={[
                          styles.settingsColorGroup,
                          groupIndex === 0 && styles.settingsColorGroupFirst,
                        ]}
                      >
                        <Text style={styles.settingsColorGroupTitle}>{group.title}</Text>
                        {group.values.map((value) => {
                          const colorTheme = getFilterColorTheme(filterColors, group.filterKey, value);

                          return (
                            <View key={`${group.filterKey}-${value}`} style={styles.settingsColorRow}>
                              <View style={styles.settingsColorLabelWrap}>
                                <View
                                  style={[
                                    styles.settingsColorPreviewDot,
                                    { backgroundColor: colorTheme.accent },
                                  ]}
                                />
                                <Text style={styles.settingsColorLabel}>{value}</Text>
                              </View>
                              <ScrollView
                                horizontal
                                keyboardShouldPersistTaps="handled"
                                showsHorizontalScrollIndicator={false}
                                style={styles.settingsColorSwatchScroll}
                                contentContainerStyle={styles.settingsColorSwatches}
                              >
                                {FILTER_COLOR_SWATCHES.map((swatch) => {
                                  const selected =
                                    swatch.accent.toUpperCase() === colorTheme.accent.toUpperCase();

                                  return (
                                    <Pressable
                                      accessibilityRole="button"
                                      accessibilityLabel={`Set ${value} color to ${swatch.label}`}
                                      accessibilityState={{ selected }}
                                      key={swatch.id}
                                      onPress={() => setFilterColor(group.filterKey, value, swatch.accent)}
                                      style={({ pressed }) => [
                                        styles.settingsColorSwatchButton,
                                        selected && {
                                          backgroundColor: swatch.tint,
                                          borderColor: swatch.accent,
                                        },
                                        pressed && styles.settingsOptionRowPressed,
                                      ]}
                                    >
                                      <View
                                        style={[
                                          styles.settingsColorSwatch,
                                          { backgroundColor: swatch.accent },
                                        ]}
                                      />
                                    </Pressable>
                                  );
                                })}
                              </ScrollView>
                            </View>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>
        <Modal
          animationType="fade"
          onRequestClose={closePresetSaveModal}
          onShow={focusPresetSaveInput}
          transparent
          visible={presetSaveModalVisible}
        >
          <View style={styles.presetSaveModalBackdrop}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss save preset dialog"
              onPress={closePresetSaveModal}
              style={StyleSheet.absoluteFill}
            />
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.presetSaveModalCenter}
            >
              <View style={styles.presetSaveModalCard}>
                <Text style={styles.presetSaveModalTitle}>Save preset</Text>
                <Text style={styles.presetSaveModalMessage}>
                  Enter a name for this preset.
                </Text>
                <TextInput
                  ref={presetSaveInputRef}
                  autoCapitalize="words"
                  autoFocus
                  onChangeText={setPresetSaveName}
                  onPressIn={focusPresetSaveInput}
                  onSubmitEditing={(event) => {
                    commitMenuPreset(event.nativeEvent.text || presetSaveName);
                  }}
                  placeholder="Preset name"
                  placeholderTextColor="#A69D94"
                  returnKeyType="done"
                  selectTextOnFocus
                  showSoftInputOnFocus
                  style={styles.presetSaveModalInput}
                  submitBehavior="submit"
                  value={presetSaveName}
                />
                <View style={styles.presetSaveModalActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={closePresetSaveModal}
                    style={({ pressed }) => [
                      styles.presetSaveModalButton,
                      styles.presetSaveModalButtonSecondary,
                      pressed && styles.presetSaveModalButtonPressed,
                    ]}
                  >
                    <Text style={styles.presetSaveModalButtonSecondaryText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!presetSaveName.trim()}
                    onPress={() => commitMenuPreset(presetSaveName)}
                    style={({ pressed }) => [
                      styles.presetSaveModalButton,
                      styles.presetSaveModalButtonPrimary,
                      !presetSaveName.trim() && styles.settingsButtonDisabled,
                      pressed && styles.presetSaveModalButtonPressed,
                    ]}
                  >
                    <Text style={styles.presetSaveModalButtonPrimaryText}>Save</Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: THEME_BG,
  },
  screen: {
    flex: 1,
    backgroundColor: THEME_BG,
  },
  mainKeyboardAvoiding: {
    flex: 1,
    minHeight: 0,
  },
  settingsModal: {
    flex: 1,
    backgroundColor: THEME_BG,
  },
  presetSaveModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(30, 27, 24, 0.42)',
    justifyContent: 'center',
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  presetSaveModalCenter: {
    width: '100%',
  },
  presetSaveModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E4DDD4',
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    width: '100%',
  },
  presetSaveModalTitle: {
    color: THEME_TEXT,
    fontSize: 18,
    fontWeight: FONT_SEMIBOLD,
    lineHeight: 24,
  },
  presetSaveModalMessage: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 14,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
    marginTop: 6,
  },
  presetSaveModalInput: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: THEME_BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E2DA',
    color: THEME_TEXT,
    fontSize: 15,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
    marginTop: 16,
    paddingHorizontal: 14,
  },
  presetSaveModalActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    marginTop: 18,
  },
  presetSaveModalButton: {
    minHeight: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  presetSaveModalButtonSecondary: {
    backgroundColor: THEME_BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E2DA',
  },
  presetSaveModalButtonPrimary: {
    backgroundColor: THEME_ACCENT,
  },
  presetSaveModalButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  presetSaveModalButtonSecondaryText: {
    color: '#2A2520',
    fontSize: 15,
    fontWeight: FONT_MEDIUM,
    lineHeight: 20,
  },
  presetSaveModalButtonPrimaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: FONT_MEDIUM,
    lineHeight: 20,
  },
  settingsHeader: {
    minHeight: TOP_SAFE_GAP + 74,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E2DA',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: TOP_SAFE_GAP,
  },
  settingsHeaderTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  settingsTitle: {
    color: THEME_TEXT,
    fontSize: 24,
    fontWeight: FONT_SEMIBOLD,
    lineHeight: 30,
    letterSpacing: 0,
  },
  settingsSubtitle: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 13,
    fontWeight: FONT_REGULAR,
    lineHeight: 18,
    letterSpacing: 0.1,
    marginTop: 2,
  },
  settingsCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E4DDD4',
  },
  settingsCloseButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
  settingsCloseIcon: {
    color: '#2A2520',
    fontSize: 26,
    fontWeight: FONT_REGULAR,
    lineHeight: 28,
  },
  settingsBody: {
    flex: 1,
  },
  settingsBodyContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: 22,
    paddingBottom: 34,
  },
  settingsSection: {
    width: '100%',
    marginBottom: 18,
  },
  settingsSectionHeader: {
    minHeight: 58,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  settingsSectionTitle: {
    color: THEME_TEXT,
    fontSize: 16,
    fontWeight: FONT_MEDIUM,
    lineHeight: 21,
    letterSpacing: 0.1,
  },
  settingsSectionSubtitle: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 13,
    fontWeight: FONT_REGULAR,
    lineHeight: 18,
    letterSpacing: 0.1,
    marginTop: 3,
  },
  settingsSectionChevron: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 25,
    fontWeight: FONT_REGULAR,
    lineHeight: 27,
    transform: [{ rotate: '0deg' }],
  },
  settingsSectionChevronExpanded: {
    transform: [{ rotate: '90deg' }],
  },
  settingsCard: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E2DA',
    padding: 14,
    shadowColor: '#3D3428',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  settingsSegmentedControl: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#F3EEE7',
    flexDirection: 'row',
    padding: 4,
  },
  settingsSegmentButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsSegmentButtonSelected: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#3D3428',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  settingsSegmentButtonText: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 14,
    fontWeight: FONT_MEDIUM,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  settingsSegmentButtonTextSelected: {
    color: THEME_TEXT,
  },
  settingsAddListRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  settingsAddListInput: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: THEME_BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E2DA',
    color: THEME_TEXT,
    fontSize: 15,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
    paddingHorizontal: 14,
  },
  settingsAddListButton: {
    minWidth: 66,
    minHeight: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME_ACCENT,
    paddingHorizontal: 14,
  },
  settingsAddListButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: FONT_MEDIUM,
    lineHeight: 18,
  },
  settingsListEditor: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F2EBE3',
    marginTop: 14,
  },
  settingsListGroup: {
    borderBottomColor: '#F2EBE3',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingsListEditRow: {
    minHeight: 56,
    alignItems: 'center',
    flexDirection: 'row',
    paddingVertical: 8,
  },
  settingsListSubsectionRow: {
    alignItems: 'center',
    borderTopColor: '#F7F1EA',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingLeft: 36,
    paddingRight: 8,
    paddingVertical: 6,
  },
  settingsListSubsectionLabel: {
    color: '#5C554E',
    flex: 1,
    fontSize: 14,
    fontWeight: FONT_REGULAR,
    lineHeight: 18,
  },
  settingsSubsectionComposer: {
    alignItems: 'center',
    borderTopColor: '#F7F1EA',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 10,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  settingsSubsectionInput: {
    backgroundColor: '#F7F3EE',
    borderRadius: 12,
    color: THEME_TEXT,
    flex: 1,
    fontSize: 14,
    fontWeight: FONT_REGULAR,
    lineHeight: 18,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  settingsListDragZone: {
    width: 28,
    minHeight: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  settingsListDragHandle: {
    color: '#B4AAA0',
    fontSize: 18,
    fontWeight: FONT_REGULAR,
    lineHeight: 22,
  },
  settingsListTextWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  settingsListTitle: {
    color: THEME_TEXT,
    fontSize: 15,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  settingsListSubtitle: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: FONT_REGULAR,
    lineHeight: 16,
    marginTop: 2,
  },
  settingsListActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  settingsColorGroup: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F2EBE3',
    paddingTop: 14,
    marginTop: 14,
  },
  settingsColorGroupFirst: {
    borderTopWidth: 0,
    paddingTop: 0,
    marginTop: 0,
  },
  settingsColorGroupTitle: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: FONT_MEDIUM,
    lineHeight: 16,
    letterSpacing: 0.2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  settingsColorRow: {
    minHeight: 46,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 6,
  },
  settingsColorLabelWrap: {
    width: 112,
    minWidth: 0,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  settingsColorPreviewDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  settingsColorLabel: {
    flex: 1,
    color: THEME_TEXT,
    fontSize: 14,
    fontWeight: FONT_REGULAR,
    lineHeight: 18,
  },
  settingsColorSwatchScroll: {
    flex: 1,
  },
  settingsColorSwatches: {
    alignItems: 'center',
    gap: 8,
    paddingRight: 2,
  },
  settingsColorSwatchButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E2DA',
    backgroundColor: '#FFFFFF',
  },
  settingsColorSwatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  settingsIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3EEE7',
  },
  settingsIconButtonActive: {
    backgroundColor: '#DCE8E4',
  },
  settingsIconButtonText: {
    color: '#2A2520',
    fontSize: 16,
    fontWeight: FONT_MEDIUM,
    lineHeight: 20,
  },
  settingsDangerIconButton: {
    backgroundColor: '#F8EDEA',
  },
  settingsDangerIconButtonText: {
    color: '#8F4D46',
    fontSize: 22,
    fontWeight: FONT_REGULAR,
    lineHeight: 24,
  },
  settingsRow: {
    minHeight: 54,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  settingsRowTextWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  settingsRowTitle: {
    color: THEME_TEXT,
    fontSize: 16,
    fontWeight: FONT_MEDIUM,
    lineHeight: 21,
    letterSpacing: 0.1,
  },
  settingsRowSubtitle: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 13,
    fontWeight: FONT_REGULAR,
    lineHeight: 18,
    letterSpacing: 0.1,
    marginTop: 3,
  },
  settingsStatusPill: {
    minWidth: 48,
    borderRadius: 13,
    alignItems: 'center',
    backgroundColor: '#F3EEE7',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  settingsStatusPillEnabled: {
    backgroundColor: THEME_ACCENT_SOFT,
  },
  settingsStatusText: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: FONT_MEDIUM,
    lineHeight: 16,
    letterSpacing: 0.1,
  },
  settingsStatusTextEnabled: {
    color: THEME_ACCENT,
  },
  settingsWarningText: {
    color: '#8F4D46',
    fontSize: 12,
    fontWeight: FONT_REGULAR,
    lineHeight: 17,
    letterSpacing: 0.1,
    marginTop: 10,
  },
  settingsSecondaryButtonPressed: {
    opacity: 0.74,
    transform: [{ scale: 0.99 }],
  },
  settingsButtonDisabled: {
    opacity: 0.42,
  },
  settingsOptionRow: {
    minHeight: 48,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F2EBE3',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  settingsOptionRowPressed: {
    opacity: 0.72,
  },
  settingsOptionText: {
    color: '#2A2520',
    fontSize: 15,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  settingsOptionValue: {
    color: THEME_ACCENT,
    fontSize: 14,
    fontWeight: FONT_MEDIUM,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  settingsPrimaryButton: {
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME_ACCENT,
    marginTop: 14,
    paddingHorizontal: 16,
  },
  settingsPrimaryButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  settingsPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: FONT_MEDIUM,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  settingsRestoreButton: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3EEE7',
    marginTop: 10,
    paddingHorizontal: 16,
  },
  settingsRestoreButtonText: {
    color: '#2A2520',
    fontSize: 15,
    fontWeight: FONT_MEDIUM,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  settingsDisconnectButton: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
  },
  settingsDisconnectButtonText: {
    color: '#8F4D46',
    fontSize: 13,
    fontWeight: FONT_MEDIUM,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  settingsBackupStatus: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 13,
    fontWeight: FONT_REGULAR,
    lineHeight: 18,
    letterSpacing: 0.1,
    marginTop: 12,
  },
  appHeader: {
    alignItems: 'center',
    backgroundColor: THEME_BG,
    justifyContent: 'center',
    minHeight: 44,
    paddingBottom: 4,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: Platform.OS === 'android' ? TOP_SAFE_GAP : 8,
  },
  appHeaderTitle: {
    color: THEME_TEXT,
    fontSize: 20,
    fontWeight: FONT_SEMIBOLD,
    lineHeight: 26,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  headerSearchRow: {
    backgroundColor: THEME_BG,
    paddingBottom: 12,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: 4,
  },
  navSearchIcon: {
    marginRight: 8,
  },
  bottomNav: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E5E5EA',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    height: BOTTOM_NAV_HEIGHT,
    justifyContent: 'space-around',
    paddingBottom: Platform.OS === 'ios' ? 2 : 0,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  bottomNavItem: {
    alignItems: 'center',
    flex: 1,
    height: '100%',
    justifyContent: 'center',
  },
  bottomNavItemPressed: {
    opacity: 0.72,
  },
  searchBox: {
    height: 48,
    borderRadius: 12,
    backgroundColor: THEME_CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME_BORDER,
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    color: THEME_TEXT,
    fontSize: 16,
    fontWeight: FONT_REGULAR,
    height: 48,
    letterSpacing: 0,
    paddingVertical: 0,
  },
  listShell: {
    backgroundColor: THEME_BG,
    flex: 1,
  },
  todoListFrame: {
    flex: 1,
  },
  todoListTapFrame: {
    flex: 1,
  },
  listMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 19,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  createDrawerModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  createDrawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(34, 28, 24, 0.36)',
  },
  createDrawerLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 24,
    elevation: 8,
  },
  createDrawer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#E4DDD4',
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'android' ? 10 : 8,
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 10,
  },
  createDrawerInput: {
    color: THEME_TEXT,
    fontSize: 18,
    fontWeight: FONT_REGULAR,
    lineHeight: 26,
    marginTop: 4,
    maxHeight: 112,
    minHeight: 56,
    paddingVertical: 6,
  },
  createDrawerPicker: {
    marginTop: 4,
  },
  createDrawerPickerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  createDrawerPickerRowSelected: {
    backgroundColor: THEME_ACCENT_SOFT,
  },
  createDrawerPickerRowPressed: {
    backgroundColor: THEME_BG,
  },
  createDrawerPickerRowText: {
    color: '#2A2520',
    fontSize: 15,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
  },
  createDrawerPickerRowTextSelected: {
    color: THEME_ACCENT,
    fontWeight: FONT_MEDIUM,
  },
  createDrawerToolbar: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F0E9E1',
    flexDirection: 'row',
    gap: 2,
    marginTop: 10,
    minHeight: 48,
    paddingTop: 6,
  },
  createDrawerToolbarButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createDrawerToolbarButtonPressed: {
    backgroundColor: '#F3EEE7',
  },
  createDrawerToolbarButtonActive: {
    backgroundColor: THEME_ACCENT_SOFT,
  },
  createDrawerInboxChip: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    height: 40,
    maxWidth: 132,
    borderRadius: 12,
    paddingHorizontal: 10,
  },
  createDrawerInboxChipActive: {
    backgroundColor: THEME_ACCENT_SOFT,
  },
  createDrawerInboxChipText: {
    color: THEME_ACCENT,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: FONT_MEDIUM,
    lineHeight: 18,
  },
  createDrawerToolbarSpacer: {
    flex: 1,
  },
  createFabLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    elevation: 30,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingRight: HORIZONTAL_PADDING,
    paddingBottom: LIST_MENU_BOTTOM_OFFSET + 10,
  },
  createFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NAV_ACCENT,
    shadowColor: NAV_ACCENT,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  createFabPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
  createFabText: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: FONT_REGULAR,
    lineHeight: 32,
    marginTop: -2,
  },
  edgeBackZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: EDGE_BACK_WIDTH,
    zIndex: 30,
    elevation: 9,
  },
  edgeBackZoneLeft: {
    left: 0,
  },
  edgeBackZoneRight: {
    right: 0,
  },
  listMenuLayer: {
    position: 'absolute',
    bottom: LIST_MENU_BOTTOM_OFFSET,
    left: HORIZONTAL_PADDING,
    right: HORIZONTAL_PADDING,
    zIndex: 20,
    elevation: 7,
  },
  listMenu: {
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E4DDD4',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingBottom: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  listMenuBody: {
    flex: 1,
    minHeight: 0,
  },
  menuDragHandle: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
    paddingBottom: 4,
    paddingTop: 8,
  },
  menuDragPill: {
    backgroundColor: '#D8D0C8',
    borderRadius: 999,
    height: 5,
    width: 42,
  },
  listMenuFooterButton: {
    minHeight: 50,
    borderRadius: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8E2DA',
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 8,
    paddingHorizontal: 16,
  },
  listMenuBackIcon: {
    color: THEME_ACCENT,
    fontSize: 24,
    fontWeight: FONT_REGULAR,
    lineHeight: 26,
    marginRight: 8,
  },
  listMenuBackText: {
    color: '#2A2520',
    fontSize: 15,
    fontWeight: FONT_MEDIUM,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  listMenuList: {
    flex: 1,
  },
  listMenuRow: {
    height: LIST_MENU_ROW_HEIGHT,
    borderRadius: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F2EBE3',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  listMenuRowIndented: {
    paddingLeft: 28,
  },
  listMenuSubsectionMarker: {
    color: '#B4AAA0',
    fontSize: 14,
    fontWeight: FONT_REGULAR,
    lineHeight: 18,
    width: 16,
  },
  listMenuRowTitleSubsection: {
    color: '#5C554E',
    fontSize: 14,
    fontWeight: FONT_REGULAR,
  },
  listMenuRowMainPress: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    justifyContent: 'center',
    marginRight: 8,
  },
  listMenuRowPressed: {
    backgroundColor: '#F5F2ED',
  },
  listMenuRowSelected: {
    backgroundColor: THEME_ACCENT_SOFT,
  },
  clearFiltersRow: {
    marginTop: 2,
  },
  clearFiltersText: {
    color: '#8F4D46',
    fontSize: 15,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  filterTypeText: {
    color: '#A79F96',
    fontSize: 12,
    fontWeight: FONT_REGULAR,
    lineHeight: 16,
    letterSpacing: 0.1,
    textTransform: 'capitalize',
  },
  listMenuValueText: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: FONT_REGULAR,
    lineHeight: 16,
    letterSpacing: 0.1,
  },
  menuEmptyState: {
    height: LIST_MENU_ROW_HEIGHT * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuEmptyText: {
    color: '#8F877F',
    fontSize: 14,
    fontWeight: FONT_REGULAR,
    letterSpacing: 0,
  },
  listMenuRowTextWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listMenuRowTextStack: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingRight: 12,
  },
  listMenuRowSummary: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: FONT_REGULAR,
    lineHeight: 16,
    letterSpacing: 0.1,
    marginTop: 2,
  },
  listMenuApplyText: {
    color: THEME_ACCENT,
    fontSize: 13,
    fontWeight: FONT_MEDIUM,
    lineHeight: 18,
    marginLeft: 10,
  },
  listMenuPresetSwipeShell: {
    height: LIST_MENU_ROW_HEIGHT,
    borderRadius: 12,
    overflow: 'visible',
  },
  listMenuPresetSwipeContainer: {
    height: LIST_MENU_ROW_HEIGHT,
    borderRadius: 12,
    overflow: 'visible',
  },
  listMenuPresetSwipeChildren: {
    backgroundColor: 'transparent',
  },
  listMenuPresetRow: {
    height: LIST_MENU_ROW_HEIGHT,
    borderRadius: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F2EBE3',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  listMenuPresetSwipeActions: {
    width: PRESET_SWIPE_DELETE_WIDTH,
    height: LIST_MENU_ROW_HEIGHT,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: '#CF413A',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  listMenuPresetSwipeDelete: {
    width: PRESET_SWIPE_DELETE_WIDTH,
    height: LIST_MENU_ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#CF413A',
  },
  listMenuColorDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    flexShrink: 0,
  },
  listMenuRowTitle: {
    color: '#2A2520',
    fontSize: 15,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  listMenuArrow: {
    color: '#9B9289',
    fontSize: 20,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
  },
  listMenuCheck: {
    color: THEME_ACCENT,
    fontSize: 16,
    fontWeight: FONT_MEDIUM,
    lineHeight: 20,
    marginLeft: 12,
  },
  listMenuInlineCheck: {
    color: THEME_ACCENT,
    fontSize: 15,
    fontWeight: FONT_MEDIUM,
    lineHeight: 18,
    marginRight: 12,
  },
  listMenuArrowExpanded: {
    transform: [{ rotate: '90deg' }],
  },
  listMenuSubmenuZone: {
    flexShrink: 0,
    maxWidth: '52%',
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginLeft: 8,
    paddingLeft: 4,
    paddingRight: 4,
  },
  listMenuClearButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listMenuClearButtonPressed: {
    backgroundColor: '#F5EBE8',
  },
  listMenuClearButtonText: {
    color: '#A35D55',
    fontSize: 18,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
  },
  listMenuArrowButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listMenuArrowButtonPressed: {
    backgroundColor: THEME_ACCENT_SOFT,
  },
  listMenuChildCount: {
    color: '#B5ADA5',
    fontSize: 12,
    fontWeight: FONT_MEDIUM,
    lineHeight: 16,
    letterSpacing: 0.2,
  },
  pullMenu: {
    position: 'absolute',
    top: 8,
    left: HORIZONTAL_PADDING,
    right: HORIZONTAL_PADDING,
    zIndex: 10,
    minHeight: 140,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E4DDD4',
    gap: 4,
    padding: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  pullStage: {
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  pullStageActive: {
    backgroundColor: THEME_ACCENT_SOFT,
  },
  pullStageDisabled: {
    opacity: 0.45,
  },
  pullStageText: {
    color: '#706860',
    fontSize: 13,
    fontWeight: FONT_MEDIUM,
    lineHeight: 18,
    letterSpacing: 0.2,
  },
  pullStageTextActive: {
    color: THEME_ACCENT,
  },
  pullStageTextDisabled: {
    color: '#B5ADA5',
  },
  pullStageMark: {
    color: '#C4BCB3',
    fontSize: 12,
    fontWeight: FONT_SEMIBOLD,
    lineHeight: 18,
    letterSpacing: 0.2,
  },
  pullStageMarkActive: {
    color: THEME_ACCENT,
  },
  pullStageMarkDisabled: {
    color: '#C4BCB3',
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME_ACCENT,
    marginLeft: 10,
  },
  addButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: FONT_MEDIUM,
    lineHeight: 24,
  },
  listContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 100,
    paddingTop: 8,
    gap: 12,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  todoSectionCard: {
    backgroundColor: THEME_CARD,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  todoSectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  todoGroupHeaderPressed: {
    opacity: 0.72,
  },
  todoSectionHeaderMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  todoGroupChevronExpanded: {
    transform: [{ rotate: '180deg' }],
  },
  todoSectionTitle: {
    color: THEME_TEXT,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: FONT_SEMIBOLD,
    lineHeight: 22,
  },
  todoGroupCount: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 14,
    fontWeight: FONT_REGULAR,
    lineHeight: 18,
    minWidth: 16,
    textAlign: 'right',
  },
  todoSectionBody: {
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 0,
  },
  todoRowDivider: {
    backgroundColor: THEME_BORDER,
    height: StyleSheet.hairlineWidth,
    marginLeft: 38,
  },
  swipeShell: {
    minHeight: 56,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  swipeShellGrouped: {
    minHeight: 52,
  },
  todoSwipeableContainer: {
    minHeight: 56,
    borderRadius: 14,
    overflow: 'visible',
  },
  todoSwipeableChildren: {
    overflow: 'visible',
  },
  todoSwipeLeftActions: {
    width: TODO_LEFT_ACTION_MENU_WIDTH,
    height: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#CF413A',
  },
  todoSwipeRightActions: {
    width: TODO_RIGHT_ACTION_MENU_WIDTH,
    height: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: '#F19A38',
  },
  todoActionButton: {
    width: TODO_ACTION_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todoActionDone: {
    backgroundColor: '#3A63E8',
  },
  todoActionDelete: {
    backgroundColor: '#CF413A',
  },
  todoActionMore: {
    backgroundColor: '#F19A38',
  },
  todoActionPressed: {
    opacity: 0.78,
  },
  todoActionIcon: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: FONT_SEMIBOLD,
    lineHeight: 28,
  },
  todoRow: {
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: THEME_CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME_BORDER,
    alignItems: 'flex-start',
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  todoRowGrouped: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    minHeight: 52,
    paddingHorizontal: 0,
    paddingVertical: 12,
    shadowOpacity: 0,
    elevation: 0,
  },
  todoCheckboxPressable: {
    marginRight: 12,
    marginTop: 2,
  },
  todoCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#C7C7CC',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME_CARD,
  },
  todoCheckboxChecked: {
    backgroundColor: THEME_ACCENT,
    borderColor: THEME_ACCENT,
  },
  todoTextPressable: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  todoRowDone: {
    backgroundColor: '#FAFBFC',
    borderColor: THEME_BORDER,
  },
  todoRowMenuTarget: {
    backgroundColor: THEME_ACCENT_SOFT,
    borderWidth: 1,
    borderColor: '#B8C9FF',
    shadowColor: THEME_ACCENT,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 2,
  },
  todoColorRail: {
    alignSelf: 'stretch',
    borderRadius: 3,
    marginRight: 12,
    opacity: 0.9,
    width: 5,
  },
  todoColorRailDone: {
    opacity: 0.35,
  },
  todoColorDotRow: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 8,
  },
  todoColorDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  todoColorDotDone: {
    opacity: 0.35,
  },
  todoText: {
    color: THEME_TEXT,
    fontSize: 16,
    fontWeight: FONT_MEDIUM,
    lineHeight: 22,
    letterSpacing: 0,
  },
  todoTextDone: {
    color: THEME_TEXT_SECONDARY,
    fontWeight: FONT_REGULAR,
    textDecorationLine: 'line-through',
    textDecorationColor: '#C7C7CC',
  },
  todoMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    minHeight: 16,
  },
  todoMetaSpacer: {
    flex: 1,
  },
  todoMetaDate: {
    color: THEME_ACCENT,
    fontSize: 12,
    fontWeight: FONT_REGULAR,
    lineHeight: 16,
  },
  todoMetaDateOverdue: {
    color: THEME_DANGER,
  },
  todoMetaList: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: FONT_REGULAR,
    lineHeight: 16,
    marginLeft: 12,
  },
  searchFiltersPanel: {
    flex: 1,
  },
  searchFiltersContent: {
    flexGrow: 1,
    gap: 8,
    paddingBottom: 24,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: 8,
  },
  searchFiltersEmpty: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 48,
  },
  searchFiltersEmptyTitle: {
    color: THEME_TEXT,
    fontSize: 17,
    fontWeight: FONT_SEMIBOLD,
    letterSpacing: -0.2,
  },
  searchFiltersEmptyText: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 14,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
    textAlign: 'center',
  },
  searchFilterRow: {
    alignItems: 'center',
    backgroundColor: THEME_CARD,
    borderColor: THEME_BORDER,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchFilterRowText: {
    flex: 1,
    minWidth: 0,
  },
  searchFilterLabel: {
    color: THEME_TEXT,
    fontSize: 16,
    fontWeight: FONT_MEDIUM,
    letterSpacing: -0.1,
    lineHeight: 22,
  },
  searchFiltersMeta: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 13,
    fontWeight: FONT_REGULAR,
    lineHeight: 18,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 6,
  },
  emptyIcon: {
    fontSize: 32,
    color: '#C4BCB3',
    marginBottom: 8,
  },
  emptyTitle: {
    color: '#3A3530',
    fontSize: 17,
    fontWeight: FONT_SEMIBOLD,
    letterSpacing: -0.2,
  },
  emptyText: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 14,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  datePickerModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  datePickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  datePickerSheet: {
    backgroundColor: THEME_CARD,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  datePickerHeader: {
    alignItems: 'center',
    borderBottomColor: THEME_BORDER,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  datePickerHeaderTitle: {
    color: THEME_TEXT,
    fontSize: 16,
    fontWeight: FONT_SEMIBOLD,
  },
  datePickerHeaderButton: {
    minWidth: 64,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  datePickerHeaderButtonPressed: {
    opacity: 0.65,
  },
  datePickerHeaderButtonText: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 16,
    fontWeight: FONT_MEDIUM,
  },
  datePickerHeaderDone: {
    color: THEME_ACCENT,
    textAlign: 'right',
  },
  datePickerControl: {
    alignSelf: 'center',
  },
});
