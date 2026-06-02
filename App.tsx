import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { makeRedirectUri, TokenResponse } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
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
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import {
  FlatList as GestureFlatList,
  GestureHandlerRootView,
  PanGestureHandler,
  State,
  Swipeable,
  TouchableOpacity as GHTouchableOpacity,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';

import {
  ReminderTimeModal,
  type ReminderTimeModalHandle,
  type ReminderTimeModalSource,
} from './src/components/ReminderTimeModal';
import { RepeatReminderModal } from './src/components/RepeatReminderModal';
import { FilterConfigScreen } from './src/components/FilterConfigScreen';
import { SimpleCalendarModal } from './src/components/SimpleCalendarModal';
import { TodoRow } from './src/components/TodoRow';

import {
  CUSTOM_DATE_LABEL,
  formatDateDisplayLabel,
  formatDateFilterLabel,
  formatDateFilterValue,
  formatRemainingDaysLabel,
  getDateMenuClearValue,
  getDateMenuColorLookupValue,
  getDateMenuItemDisplayLabel,
  getInitialDatePickerValue,
  getSelectedCustomDateLabel,
  isCustomDateLabel,
  isDateFilterOverdue,
  isDateMenuItemSelected,
  startOfDay,
  toISODateString,
  todoMatchesSelectedDateFilters,
  type DateLabelDisplayMode,
} from './src/dates';
import { localTodoStore } from './src/storage/todoStore';
import {
  cloneTodo,
  cloneTodoFilters,
  getTodoTextMaxLength,
  makeTodo,
  normalizeTodoContent,
  normalizeTodoFilters,
  formatListLabel,
  normalizeTodoText,
  truncateTodoText,
  type DeletedTodo,
  type Todo,
  type TodoFilters,
} from './src/todos';
import { useInstantPress } from './src/hooks/useInstantPress';
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
import { isDevAppVariant } from './src/appVariant';
import {
  cloneFilterColors,
  FILTER_COLOR_SWATCHES,
  getFilterColorTheme,
  type FilterColorKey,
  type FilterColorSettings,
} from './src/filterColors';
import {
  cloneMetaTagVisibility,
  DEFAULT_META_TAG_VISIBILITY,
  formatMetaTagVisibilitySummary,
  META_TAG_KEYS,
  META_TAG_LABELS,
  metaTagVisibilityMatchesDefault,
  type HiddenMetaTagKind,
  type MetaTagKey,
  type MetaTagVisibility,
} from './src/metaTags';
import {
  appSettingsStore,
  clearListNodeDisplaySettings,
  cloneListMenuTree,
  cloneMenuPresets,
  collectListNodeLabels,
  DEFAULT_LIST_MENU_TREE,
  findListMenuNode,
  resolveListDisplaySettings,
  todoMatchesSelectedListFilters,
  updateListNodeDisplaySettings,
  type AppSettings,
  type ListOrderMode,
  type StoredListMenuNode,
  type StoredMenuPreset,
  type TodoGroupMode,
  type TodoSortMode,
} from './src/storage/appSettingsStore';
import {
  buildTodoListRows,
  compareTodosBySortMode,
  estimateTodoListOffsetForId,
  flattenTodoListRows,
  TODO_LIST_CONTENT_TOP_PADDING,
  TODO_LIST_ROW_GAP,
  TODO_ROW_DIVIDER_HEIGHT,
  type VisibleTodoListRow,
} from './src/todoListRows';
import { advanceRepeatingTodoAfterDone } from './src/todoRecurrence';
import {
  addTodoAlarmResponseListener,
  cancelTodoAlarm,
  consumeLastTodoAlarmNotificationResponse,
  reconcileTodoAlarms,
  syncTodoAlarm,
} from './src/todoAlarms';
import {
  decodeTodoReminder,
  encodeTodoReminder,
  DEFAULT_REMINDER_TIME,
  getDatePickerMenuDisplayLabel,
  hasTodoReminderTime,
  hasTodoRepeat,
  isDatePickerMenuItemSelected,
  isReminderPickerMenuLabel,
  REMINDER_PICKER_LABEL,
  REPEAT_PICKER_LABEL,
  type ReminderTime,
  type RepeatPreset,
} from './src/reminders';
import {
  DATE_MENU_ITEMS,
  DATE_PICKER_MENU_ITEMS,
  PRIORITY_MENU_ITEMS,
  TODO_GROUP_LABELS,
  TODO_GROUP_OPTIONS,
  TODO_SORT_LABELS,
  TODO_SORT_OPTIONS,
} from './src/todoOptions';

WebBrowser.maybeCompleteAuthSession();

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
const FILTER_KEYS: FilterKey[] = ['list', 'date', 'priority'];

type MenuMode =
  | 'date'
  | 'filters'
  | 'group'
  | 'lists'
  | 'main'
  | 'metaTags'
  | 'presets'
  | 'presetsQuickApply'
  | 'priority'
  | 'sort';

type SelectedFilters = TodoFilters;

type GoogleDriveAction = 'backup' | 'restore';

type NativeGoogleSignIn = typeof import('@react-native-google-signin/google-signin');

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
    }
  | {
      id: string;
      label: string;
      metaTagKey: MetaTagKey;
      type: 'metaTagOption';
    };

const MENU_SECTION_FILTER_KEYS: Partial<Record<MenuMode, FilterKey>> = {
  date: 'date',
  lists: 'list',
  priority: 'priority',
};

const countDateMenuSelections = (
  filters: TodoFilters,
  includeReminderRows: boolean,
) =>
  filters.date.length +
  (includeReminderRows && hasTodoReminderTime(filters.reminder) ? 1 : 0) +
  (includeReminderRows && hasTodoRepeat(filters.reminder) ? 1 : 0);

const menuSectionCanClear = (
  menuMode: MenuMode,
  filters: TodoFilters,
  activeFilterCount: number,
  sortMode: TodoSortMode,
  groupMode: TodoGroupMode,
  metaTagVisibility: MetaTagVisibility,
  listMenuTree: ListMenuNode[],
  activeListDisplay: {
    listLabel: string | null;
    isSubsectionView: boolean;
  },
  includeReminderRows: boolean,
  activeMenuPreset: MenuPreset | null,
): boolean => {
  const filterKey = MENU_SECTION_FILTER_KEYS[menuMode];
  if (filterKey) {
    if (filterKey === 'date') {
      return countDateMenuSelections(filters, includeReminderRows) > 0;
    }

    return filters[filterKey].length > 0;
  }

  if (menuMode === 'presets') {
    return activeMenuPreset !== null;
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

  if (menuMode === 'metaTags') {
    return !metaTagVisibilityMatchesDefault(metaTagVisibility);
  }

  return false;
};

const TOP_SAFE_GAP = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 12 : 16;
const HORIZONTAL_PADDING = 16;
const FONT_REGULAR = '400' as const;
const FONT_MEDIUM = '500' as const;
const FONT_SEMIBOLD = '600' as const;
const THEME_BG = '#F4F6F8';
const THEME_CARD = '#FFFFFF';
const THEME_TEXT = '#212121';
const THEME_TEXT_SECONDARY = '#8E8E93';
const THEME_TEXT_TERTIARY = '#A8ABB3';
const THEME_ACCENT = '#4C78FF';
const THEME_ACCENT_SOFT = '#E8EEFF';
const THEME_DANGER = '#D32F2F';
const THEME_DANGER_SOFT = '#D9645A';
const THEME_BORDER = '#E8EAED';
const CARD_BORDER_RADIUS = 12;
const CONTROL_BORDER_RADIUS = 10;
const PULL_MAX = 178;
const DOUBLE_TAP_DELAY = 300;
const EDGE_BACK_WIDTH = 28;
const LIST_MENU_HEIGHT_RATIO = 0.5;
const NAV_ACCENT = THEME_ACCENT;
const NAV_ICON_INACTIVE = THEME_TEXT_SECONDARY;
const BOTTOM_NAV_HEIGHT = 74;
// Menu overlay sits above bottomNav; a small gap keeps the sheet off the nav bar.
const LIST_MENU_BOTTOM_OFFSET = 8;
const LIST_MENU_OVERLAY_BOTTOM = BOTTOM_NAV_HEIGHT;
const LIST_MENU_ONE_HANDED_SCROLL_RATIO = 0.35;
const TODO_LIST_ONE_HANDED_SCROLL_RATIO = 0.7;
const MENU_DISMISS_RELEASE = 52;
const MENU_DISMISS_VELOCITY = 680;
const GOOGLE_IOS_LEGACY_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
const GOOGLE_IOS_CLIENT_ID = isDevAppVariant
  ? process.env.EXPO_PUBLIC_GOOGLE_IOS_DEV_CLIENT_ID ?? ''
  : process.env.EXPO_PUBLIC_GOOGLE_IOS_PROD_CLIENT_ID ?? GOOGLE_IOS_LEGACY_CLIENT_ID;
const GOOGLE_ANDROID_LEGACY_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';
const GOOGLE_ANDROID_CLIENT_ID = isDevAppVariant
  ? process.env.EXPO_PUBLIC_GOOGLE_ANDROID_DEV_CLIENT_ID ?? ''
  : process.env.EXPO_PUBLIC_GOOGLE_ANDROID_PROD_CLIENT_ID ?? GOOGLE_ANDROID_LEGACY_CLIENT_ID;
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const GOOGLE_ANDROID_PACKAGE_NAME = isDevAppVariant ? 'com.localtodo.app.dev' : 'com.localtodo.app';
const GOOGLE_REDIRECT_SCHEME = isDevAppVariant ? 'com.localtodo.app.dev' : 'com.localtodo.app';
const MISSING_GOOGLE_CLIENT_ID = 'missing-google-client-id.apps.googleusercontent.com';
const LIST_MENU_ROW_HEIGHT = 52;
const LIST_MENU_ICON_HIT_SLOP = 14;
const SETTINGS_SECTION_TOGGLE_HIT_SLOP = { bottom: 8, left: 8, right: 8, top: 8 };
const TODO_MENU_TARGET_TOP_OFFSET = 16;
const TODO_MENU_TARGET_HIGHLIGHT_DELAY_MS = 260;
const TODO_MENU_TARGET_HIGHLIGHT_OFFSET_TOLERANCE = 4;
const NEW_TODO_HIGHLIGHT_DURATION_MS = 3200;
const TODO_LIST_MAINTAIN_VISIBLE_CONTENT_POSITION = { disabled: true };
const TODO_GROUP_HEADER_PRESS_DELAY_MS = 120;
const SETTINGS_SAVE_DEBOUNCE_MS = 500;

const getTodoListItemKey = (item: VisibleTodoListRow) => {
  if (item.type === 'sectionHeader') {
    const collapseState = item.isCollapsed ? 'collapsed' : 'expanded';
    return `section:${item.id}:${collapseState}:${item.count}:${item.label}`;
  }

  return `${item.type}:${item.id}`;
};

const getTodoListItemType = (item: VisibleTodoListRow) => {
  if (item.type === 'sectionHeader') {
    return item.isCollapsed ? 'sectionHeaderCollapsed' : 'sectionHeaderExpanded';
  }

  if (item.type === 'groupedTodo') {
    if (item.isFirstInSection && item.isLastInSection) {
      return 'groupedTodoSingle';
    }

    if (item.isFirstInSection) {
      return 'groupedTodoFirst';
    }

    if (item.isLastInSection) {
      return 'groupedTodoLast';
    }
  }

  return item.type;
};
const PRESET_SWIPE_DELETE_WIDTH = 72;
const FILTER_KIND_LABELS: Record<FilterKey, string> = {
  list: 'List',
  date: 'Date',
  priority: 'Priority',
};

type SearchFilterItem = {
  displayLabel: string;
  filterKey: FilterKey;
  id: string;
  value: string;
};

const buildActiveFilterItems = (
  filters: SelectedFilters,
  dateLabelDisplayMode: DateLabelDisplayMode,
): SearchFilterItem[] =>
  FILTER_KEYS.flatMap((filterKey) =>
    filters[filterKey].map((value) => ({
      displayLabel: filterKey === 'date'
        ? (
          dateLabelDisplayMode === 'remaining'
            ? formatDateDisplayLabel(value, 'remaining')
            : formatDateFilterLabel(value)
        )
        : value,
      filterKey,
      id: `search-filter-${filterKey}-${value}`,
      value,
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
  reminder: [],
});

const getCreateTodoFilters = (
  listMenuTree: ListMenuNode[],
  filters: TodoFilters,
): SelectedFilters => {
  const fallback = getDefaultCreateDraftFilters(listMenuTree);
  const normalized = normalizeTodoFilters(filters);
  const knownListLabels = new Set(collectListNodeLabels(listMenuTree));
  const listLabel = normalized.list.find((label) => knownListLabels.has(label));
  const priorityLabel = normalized.priority.find((label) => (
    label !== 'None' && PRIORITY_MENU_ITEMS.includes(label)
  ));

  return {
    date: normalized.date[0] ? [normalized.date[0]] : [],
    list: listLabel ? [listLabel] : fallback.list,
    priority: priorityLabel ? [priorityLabel] : [],
    reminder: [...normalized.reminder],
  };
};

const hasRememberedCreateDraftFilters = (
  listMenuTree: ListMenuNode[],
  filters: TodoFilters,
) => {
  const normalized = normalizeTodoFilters(filters);
  const knownListLabels = new Set(collectListNodeLabels(listMenuTree));

  return (
    normalized.date.length > 0 ||
    normalized.reminder.length > 0 ||
    normalized.priority.some((label) => (
      label !== 'None' && PRIORITY_MENU_ITEMS.includes(label)
    )) ||
    normalized.list.some((label) => knownListLabels.has(label))
  );
};

const getRememberedCreateDraftFilters = (
  listMenuTree: ListMenuNode[],
  filters: TodoFilters,
): SelectedFilters => {
  const fallback = getDefaultCreateDraftFilters(listMenuTree);
  const normalized = getCreateTodoFilters(listMenuTree, filters);
  const hasRememberedFilters = hasRememberedCreateDraftFilters(listMenuTree, filters);

  return {
    ...normalized,
    date: normalized.date[0] || hasRememberedFilters ? normalized.date : fallback.date,
    reminder: [...normalized.reminder],
  };
};

const shouldHighlightCreatePriorityPicker = (filters: SelectedFilters) =>
  filters.priority.some((label) => label !== 'High');

const formatCreateDrawerDateLabel = (
  dateLabels: string[],
  dateLabelDisplayMode: DateLabelDisplayMode,
) => {
  const primary = dateLabels[0];

  if (!primary) {
    return 'No date';
  }

  if (dateLabelDisplayMode === 'remaining') {
    const remainingLabel = formatRemainingDaysLabel(primary);
    if (remainingLabel) {
      return remainingLabel;
    }

    return formatDateFilterLabel(primary);
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
const EMPTY_SELECTED_FILTERS: SelectedFilters = {
  date: [],
  list: [],
  priority: [],
  reminder: [],
};
const INITIAL_TODOS = Array.from({ length: 50 }, (_, index) => ({
  id: `seed-${index + 1}`,
  content: '',
  text: `Todo item ${index + 1}`,
  done: false,
  createdAt: Date.now() - index,
  filters: cloneTodoFilters(),
}));

const cloneInitialTodos = () => INITIAL_TODOS.map((todo) => ({
  ...todo,
  filters: cloneTodoFilters(todo.filters),
}));

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

const formatDeletedTodoTime = (value: number) =>
  new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  });

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
    return new Error(`${stagePrefix}Google Android OAuth setup does not match this build. Check package name ${GOOGLE_ANDROID_PACKAGE_NAME} and the SHA-1 certificate fingerprint.`);
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

const countFilters = (filters: SelectedFilters, includeReminderRows = false) =>
  countDateMenuSelections(filters, includeReminderRows) +
  filters.list.length +
  filters.priority.length;

const normalizeFilterValues = (filters: TodoFilters) => ({
  date: [...filters.date].sort(),
  list: [...filters.list].sort(),
  priority: [...filters.priority].sort(),
  reminder: [...filters.reminder].sort(),
});

const filtersEqual = (first: TodoFilters, second: TodoFilters): boolean =>
  JSON.stringify(normalizeFilterValues(first)) === JSON.stringify(normalizeFilterValues(second));

const getSharedTodoFilters = (items: Todo[]): TodoFilters => {
  if (items.length === 0) {
    return cloneTodoFilters();
  }

  const [firstItem, ...remainingItems] = items;
  const getSharedValues = (filterKey: keyof TodoFilters) =>
    firstItem.filters[filterKey].filter((value) =>
      remainingItems.every((item) => item.filters[filterKey].includes(value)),
    );

  return {
    date: getSharedValues('date'),
    list: getSharedValues('list'),
    priority: getSharedValues('priority'),
    reminder: getSharedValues('reminder'),
  };
};

const getMergedTodoFilters = (items: Todo[]): TodoFilters => {
  const merged = cloneTodoFilters();

  items.forEach((item) => {
    FILTER_KEYS.forEach((filterKey) => {
      item.filters[filterKey].forEach((value) => {
        if (!merged[filterKey].includes(value)) {
          merged[filterKey].push(value);
        }
      });
    });

    item.filters.reminder.forEach((value) => {
      if (!merged.reminder.includes(value)) {
        merged.reminder.push(value);
      }
    });
  });

  return merged;
};

const menuPresetMatchesState = (
  preset: MenuPreset,
  filters: SelectedFilters,
  sortMode: TodoSortMode,
  groupMode: TodoGroupMode,
  orderMode: ListOrderMode,
): boolean =>
  filtersEqual(preset.filters, filters) &&
  preset.todoSortMode === sortMode &&
  preset.todoGroupMode === groupMode &&
  preset.listOrderMode === orderMode;

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
  FILTER_KEYS.every((filterKey) => {
    const values = filters[filterKey];
    if (values.length === 0) {
      return true;
    }

    if (filterKey === 'list') {
      return todoMatchesSelectedListFilters(values, todo.filters.list, listMenuTree);
    }

    if (filterKey === 'date') {
      return todoMatchesSelectedDateFilters(todo.filters.date, values);
    }

    return values.some((value) => todo.filters[filterKey].includes(value));
  });

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
  const [keyboardOverlayInset, setKeyboardOverlayInset] = useState(0);
  const todoDetailCardMaxHeight = useMemo(() => {
    const baseMaxHeight = Math.round(windowHeight * 0.79);

    if (keyboardOverlayInset > 0) {
      const topReserve = TOP_SAFE_GAP + 24;
      return Math.max(220, windowHeight - keyboardOverlayInset - topReserve);
    }

    return baseMaxHeight;
  }, [keyboardOverlayInset, windowHeight]);
  const todoDetailContentInputMaxHeight = useMemo(() => {
    const baseMaxHeight = Math.max(176, Math.round(windowHeight * 0.42));

    if (keyboardOverlayInset > 0) {
      const chromeReserve = TOP_SAFE_GAP + 24 + 120;
      return Math.max(96, windowHeight - keyboardOverlayInset - chromeReserve);
    }

    return baseMaxHeight;
  }, [keyboardOverlayInset, windowHeight]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [searchResultIds, setSearchResultIds] = useState<string[] | null>(null);
  const [createDrawerVisible, setCreateDrawerVisible] = useState(false);
  const [createDraftContent, setCreateDraftContent] = useState('');
  const [createDraftText, setCreateDraftText] = useState('');
  const [createDraftFilters, setCreateDraftFilters] = useState<SelectedFilters>(
    () => getDefaultCreateDraftFilters(DEFAULT_LIST_MENU_TREE),
  );
  const [lastCreateTodoFilters, setLastCreateTodoFilters] = useState<SelectedFilters>(
    () => getDefaultCreateDraftFilters(DEFAULT_LIST_MENU_TREE),
  );
  const [createDrawerPicker, setCreateDrawerPicker] = useState<CreateDrawerPicker | null>(
    null,
  );
  const [createDraftPriorityFromPicker, setCreateDraftPriorityFromPicker] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [datePickerValue, setDatePickerValue] = useState(() => startOfDay(new Date()));
  const datePickerApplyRef = useRef<'create' | 'filters'>('filters');
  const reminderTimeModalRef = useRef<ReminderTimeModalHandle>(null);
  const [repeatReminderModalVisible, setRepeatReminderModalVisible] = useState(false);
  const repeatReminderApplyRef = useRef<'create' | 'activeTodo'>('create');
  const [repeatDraft, setRepeatDraft] = useState<RepeatPreset>('none');
  const [loaded, setLoaded] = useState(false);
  const [navTab, setNavTab] = useState<NavTab | null>(null);
  const [menuMode, setMenuMode] = useState<MenuMode | null>(null);
  const [activeTodoMenuId, setActiveTodoMenuId] = useState<string | null>(null);
  const [activeTodoMenuHighlightId, setActiveTodoMenuHighlightId] = useState<string | null>(null);
  const [newlyCreatedTodoHighlightId, setNewlyCreatedTodoHighlightId] = useState<string | null>(
    null,
  );
  const [activeTodoDetailId, setActiveTodoDetailId] = useState<string | null>(null);
  const [activeTodoDetailDraftContent, setActiveTodoDetailDraftContent] = useState('');
  const [activeTodoDetailDraftText, setActiveTodoDetailDraftText] = useState('');
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [filterConfigModalVisible, setFilterConfigModalVisible] = useState(false);
  const [presetSaveModalVisible, setPresetSaveModalVisible] = useState(false);
  const [presetSaveName, setPresetSaveName] = useState('');
  const [settingsBackupExpanded, setSettingsBackupExpanded] = useState(false);
  const [settingsColorsExpanded, setSettingsColorsExpanded] = useState(false);
  const [activeDeletedTodoDetailId, setActiveDeletedTodoDetailId] = useState<string | null>(null);
  const [settingsDeletedExpanded, setSettingsDeletedExpanded] = useState(false);
  const [settingsDoneExpanded, setSettingsDoneExpanded] = useState(false);
  const [settingsListsExpanded, setSettingsListsExpanded] = useState(false);
  const [deletedTodos, setDeletedTodos] = useState<DeletedTodo[]>([]);
  const [filterColors, setFilterColors] = useState<FilterColorSettings>(
    () => cloneFilterColors(),
  );
  const [hideDoneTodos, setHideDoneTodos] = useState(false);
  const [dateLabelDisplayMode, setDateLabelDisplayMode] = useState<DateLabelDisplayMode>('exact');
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
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedTodoIds, setSelectedTodoIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [todoGroupMode, setTodoGroupMode] = useState<TodoGroupMode>('none');
  const [collapsedTodoGroupIds, setCollapsedTodoGroupIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [todoSortMode, setTodoSortMode] = useState<TodoSortMode>('newest');
  const [metaTagVisibility, setMetaTagVisibility] = useState<MetaTagVisibility>(
    () => cloneMetaTagVisibility(),
  );
  const [newListName, setNewListName] = useState('');
  const [newSubsectionName, setNewSubsectionName] = useState('');
  const [subsectionParentIndex, setSubsectionParentIndex] = useState<number | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<SelectedFilters>(
    EMPTY_SELECTED_FILTERS,
  );
  const deferredSelectedFilters = useDeferredValue(selectedFilters);
  const [todoListFrameHeight, setTodoListFrameHeight] = useState(0);
  const searchInputRef = useRef<TextInput>(null);
  const createContentInputRef = useRef<TextInput>(null);
  const createInputRef = useRef<TextInput>(null);
  const presetSaveInputRef = useRef<TextInput>(null);
  const todoDetailContentInputRef = useRef<TextInput>(null);
  const todoDetailDraftTodoIdRef = useRef<string | null>(null);
  const listMenuRef = useRef<GestureFlatList<BottomMenuItem> | null>(null);
  const todoListRef = useRef<FlashListRef<VisibleTodoListRow> | null>(null);
  const searchRequestIdRef = useRef(0);
  const scrollOffsetY = useRef(0);
  const actualScrollOffsetY = useRef(0);
  const listMenuScrollOffsetY = useRef(0);
  const menuPullAnim = useRef(new Animated.Value(0)).current;
  const menuModeRef = useRef<MenuMode | null>(null);
  const activeTodoMenuIdRef = useRef<string | null>(null);
  const listMenuOpenRef = useRef(false);
  const pendingTodoMenuHighlightRef = useRef<{ id: string; offset: number } | null>(null);
  const todoMenuReturnOffsetRef = useRef<number | null>(null);
  const todoMenuHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newlyCreatedTodoHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const todosRef = useRef<Todo[]>(todos);
  const loadedRef = useRef(loaded);
  const pendingDeleteIdsRef = useRef<Set<string>>(pendingDeleteIds);
  const pendingTodoAlarmOpenIdRef = useRef<string | null>(null);
  todosRef.current = todos;
  loadedRef.current = loaded;
  pendingDeleteIdsRef.current = pendingDeleteIds;
  const menuDismissPullRef = useRef(0);
  const menuDismissHapticRef = useRef(0);
  const didApplyTodoListInitialOffsetRef = useRef(false);
  const hadTodoListRowsRef = useRef(false);
  const listTouchStartRef = useRef({ pageX: 0, pageY: 0, timestamp: 0 });
  const todoRowTouchStartRef = useRef({ pageX: 0, pageY: 0, timestamp: 0 });
  const lastListTapRef = useRef({ pageX: 0, pageY: 0, timestamp: 0 });
  const lastRegisteredListTapRef = useRef({ pageX: 0, pageY: 0, timestamp: 0 });
  const listMenuOpen = menuMode !== null;
  const submenuOpen = menuMode !== null && menuMode !== 'main';
  const todoSelectMode = selectedTodoIds.size > 0;
  const selectedTodoCount = selectedTodoIds.size;
  menuModeRef.current = menuMode;
  activeTodoMenuIdRef.current = activeTodoMenuId;
  listMenuOpenRef.current = listMenuOpen;
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
    redirectUri: makeRedirectUri({ scheme: GOOGLE_REDIRECT_SCHEME }),
    scopes: GOOGLE_AUTH_SCOPES,
    webClientId: GOOGLE_WEB_CLIENT_ID || MISSING_GOOGLE_CLIENT_ID,
  });
  const googleDriveActionReady =
    googleOAuthConfigured && (Platform.OS === 'android' || Boolean(googleRequest));
  const activeTodoCount = Math.max(0, todos.length - pendingDeleteIds.size);
  const getInstantPressHandlers = useInstantPress();

  useEffect(() => {
    let alive = true;

    const loadTodos = async () => {
      const [storedTodos, initialSeeded] = await Promise.all([
        localTodoStore.load(),
        localTodoStore.hasInitialSeeded(),
      ]);

      if (!initialSeeded && storedTodos.length === 0) {
        const seededTodos = cloneInitialTodos();
        await localTodoStore.replaceAll(seededTodos);
        await localTodoStore.markInitialSeeded();
        return seededTodos;
      }

      if (!initialSeeded) {
        await localTodoStore.markInitialSeeded();
      }

      return storedTodos;
    };

    loadTodos()
      .then((loadedTodos) => {
        if (!alive) {
          return;
        }

        setTodos(loadedTodos);
        reconcileTodoAlarms(loadedTodos).catch(() => undefined);
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
    let alive = true;

    Promise.all([
      appSettingsStore.load(),
      googleAuthStore.load(),
    ])
      .then(([settings, storedGoogleAuth]) => {
        if (!alive) {
          return;
        }

        const nextLastCreateTodoFilters = getRememberedCreateDraftFilters(
          settings.listMenuTree,
          settings.lastCreateTodoFilters,
        );

        setSelectedFilters(settings.selectedFilters);
        setDeletedTodos(settings.deletedTodos);
        setFilterColors(settings.filterColors);
        setGoogleDriveBackupEnabled(settings.googleDriveBackupEnabled);
        setGoogleDriveLastBackupAt(settings.googleDriveLastBackupAt);
        setGoogleDriveLastRestoreAt(settings.googleDriveLastRestoreAt);
        setHideDoneTodos(settings.hideDoneTodos);
        setDateLabelDisplayMode(settings.dateLabelDisplayMode);
        setListMenuTree(settings.listMenuTree);
        setListOrderMode(settings.listOrderMode);
        setMenuPresets(cloneMenuPresets(settings.menuPresets));
        setTodoGroupMode(settings.todoGroupMode);
        setCollapsedTodoGroupIds(new Set(settings.collapsedTodoGroupIds));
        setTodoSortMode(settings.todoSortMode);
        setMetaTagVisibility(cloneMetaTagVisibility(settings.metaTagVisibility));
        setLastCreateTodoFilters(nextLastCreateTodoFilters);
        setCreateDraftFilters(nextLastCreateTodoFilters);
        setCreateDraftPriorityFromPicker(
          shouldHighlightCreatePriorityPicker(nextLastCreateTodoFilters),
        );

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

  const createSettingsSnapshot = useCallback((
    overrides: Partial<AppSettings> = {},
  ): AppSettings => ({
    collapsedTodoGroupIds: [...collapsedTodoGroupIds],
    deletedTodos,
    filterColors,
    googleDriveBackupEnabled,
    googleDriveLastBackupAt,
    googleDriveLastRestoreAt,
    dateLabelDisplayMode,
    hideDoneTodos,
    lastCreateTodoFilters,
    listMenuTree,
    listOrderMode,
    menuPresets,
    metaTagVisibility,
    selectedFilters,
    todoGroupMode,
    todoSortMode,
    ...overrides,
  }), [
    collapsedTodoGroupIds,
    dateLabelDisplayMode,
    deletedTodos,
    filterColors,
    googleDriveBackupEnabled,
    googleDriveLastBackupAt,
    googleDriveLastRestoreAt,
    hideDoneTodos,
    lastCreateTodoFilters,
    listMenuTree,
    listOrderMode,
    menuPresets,
    metaTagVisibility,
    selectedFilters,
    todoGroupMode,
    todoSortMode,
  ]);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    const settings = createSettingsSnapshot();

    const saveTimer = setTimeout(() => {
      appSettingsStore.save(settings).catch(() => undefined);
    }, SETTINGS_SAVE_DEBOUNCE_MS);

    return () => clearTimeout(saveTimer);
  }, [
    createSettingsSnapshot,
    settingsLoaded,
  ]);

  const clearTodoMenuHighlightRequest = useCallback(() => {
    if (todoMenuHighlightTimerRef.current) {
      clearTimeout(todoMenuHighlightTimerRef.current);
      todoMenuHighlightTimerRef.current = null;
    }

    pendingTodoMenuHighlightRef.current = null;
  }, []);

  const clearNewlyCreatedTodoHighlight = useCallback(() => {
    if (newlyCreatedTodoHighlightTimerRef.current) {
      clearTimeout(newlyCreatedTodoHighlightTimerRef.current);
      newlyCreatedTodoHighlightTimerRef.current = null;
    }

    setNewlyCreatedTodoHighlightId(null);
  }, []);

  const highlightNewlyCreatedTodo = useCallback((id: string) => {
    if (newlyCreatedTodoHighlightTimerRef.current) {
      clearTimeout(newlyCreatedTodoHighlightTimerRef.current);
      newlyCreatedTodoHighlightTimerRef.current = null;
    }

    setNewlyCreatedTodoHighlightId(id);
    newlyCreatedTodoHighlightTimerRef.current = setTimeout(() => {
      newlyCreatedTodoHighlightTimerRef.current = null;
      setNewlyCreatedTodoHighlightId((current) => (
        current === id ? null : current
      ));
    }, NEW_TODO_HIGHLIGHT_DURATION_MS);
  }, []);

  const revealTodoMenuHighlight = useCallback((id: string) => {
    if (activeTodoMenuIdRef.current !== id || !listMenuOpenRef.current) {
      return;
    }

    if (todoMenuHighlightTimerRef.current) {
      clearTimeout(todoMenuHighlightTimerRef.current);
      todoMenuHighlightTimerRef.current = null;
    }

    pendingTodoMenuHighlightRef.current = null;
    setActiveTodoMenuHighlightId(id);
  }, []);

  const scheduleTodoMenuHighlight = useCallback(
    (id: string, targetOffset: number | null) => {
      clearTodoMenuHighlightRequest();

      if (targetOffset === null) {
        return;
      }

      if (
        Math.abs(actualScrollOffsetY.current - targetOffset) <=
          TODO_MENU_TARGET_HIGHLIGHT_OFFSET_TOLERANCE
      ) {
        requestAnimationFrame(() => revealTodoMenuHighlight(id));
        return;
      }

      pendingTodoMenuHighlightRef.current = { id, offset: targetOffset };
      todoMenuHighlightTimerRef.current = setTimeout(() => {
        todoMenuHighlightTimerRef.current = null;
        revealTodoMenuHighlight(id);
      }, TODO_MENU_TARGET_HIGHLIGHT_DELAY_MS);
    },
    [clearTodoMenuHighlightRequest, revealTodoMenuHighlight],
  );

  const maybeRevealPendingTodoMenuHighlight = useCallback(
    (offsetY: number) => {
      const pendingHighlight = pendingTodoMenuHighlightRef.current;

      if (!pendingHighlight) {
        return;
      }

      if (
        activeTodoMenuIdRef.current !== pendingHighlight.id ||
        !listMenuOpenRef.current
      ) {
        clearTodoMenuHighlightRequest();
        return;
      }

      if (
        Math.abs(offsetY - pendingHighlight.offset) >
          TODO_MENU_TARGET_HIGHLIGHT_OFFSET_TOLERANCE
      ) {
        return;
      }

      revealTodoMenuHighlight(pendingHighlight.id);
    },
    [clearTodoMenuHighlightRequest, revealTodoMenuHighlight],
  );

  useEffect(
    () => () => {
      clearTodoMenuHighlightRequest();
      clearNewlyCreatedTodoHighlight();
    },
    [clearNewlyCreatedTodoHighlight, clearTodoMenuHighlightRequest],
  );

  useEffect(() => {
    if (menuMode === null) {
      clearTodoMenuHighlightRequest();
      setActiveTodoMenuId(null);
      setActiveTodoMenuHighlightId(null);
    }
  }, [clearTodoMenuHighlightRequest, menuMode]);

  useEffect(() => {
    if (
      activeTodoMenuHighlightId !== null &&
      activeTodoMenuHighlightId !== activeTodoMenuId
    ) {
      clearTodoMenuHighlightRequest();
      setActiveTodoMenuHighlightId(null);
    }
  }, [
    activeTodoMenuHighlightId,
    activeTodoMenuId,
    clearTodoMenuHighlightRequest,
  ]);

  useEffect(() => {
    if (menuMode === null) {
      listMenuScrollOffsetY.current = 0;
      return undefined;
    }

    listMenuScrollOffsetY.current = listMenuOneHandedOffset;

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

  const restoreTodoMenuReturnOffset = useCallback(() => {
    const returnOffset = todoMenuReturnOffsetRef.current;
    todoMenuReturnOffsetRef.current = null;

    if (returnOffset === null) {
      return;
    }

    const nextOffset = Math.max(0, returnOffset);
    scrollOffsetY.current = nextOffset;
    actualScrollOffsetY.current = nextOffset;

    requestAnimationFrame(() => {
      todoListRef.current?.scrollToOffset({
        animated: true,
        offset: nextOffset,
      });
    });
  }, []);

  const closeListMenuState = useCallback(() => {
    clearTodoMenuHighlightRequest();
    setMenuMode(null);
    setActiveTodoMenuId(null);
    setActiveTodoMenuHighlightId(null);
    restoreTodoMenuReturnOffset();
    menuPullAnim.setValue(0);
    menuDismissPullRef.current = 0;
    menuDismissHapticRef.current = 0;
  }, [clearTodoMenuHighlightRequest, menuPullAnim, restoreTodoMenuReturnOffset]);

  const closeListMenu = useCallback(() => {
    closeListMenuState();
    Haptics.selectionAsync().catch(() => undefined);
  }, [closeListMenuState]);

  const exitTodoSelectMode = useCallback(() => {
    setSelectedTodoIds(new Set());
  }, []);

  const enterTodoSelectMode = useCallback((id: string) => {
    closeListMenuState();
    setSettingsModalVisible(false);
    setActiveTodoDetailId(null);
    setActiveTodoDetailDraftContent('');
    setActiveTodoDetailDraftText('');
    todoDetailDraftTodoIdRef.current = null;
    setSelectedTodoIds(new Set([id]));
  }, [closeListMenuState]);

  const toggleTodoSelection = useCallback((id: string) => {
    setSelectedTodoIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }, []);

  const closeTodoDetailModal = useCallback(() => {
    Keyboard.dismiss();
    setActiveTodoDetailId(null);
    setActiveTodoDetailDraftContent('');
    setActiveTodoDetailDraftText('');
    todoDetailDraftTodoIdRef.current = null;
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const closeDeletedTodoDetailModal = useCallback(() => {
    setActiveDeletedTodoDetailId(null);
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const openDeletedTodoDetailModal = useCallback((id: string) => {
    setActiveDeletedTodoDetailId(id);
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const openTodoDetailModal = useCallback((id: string) => {
    if (pendingDeleteIds.has(id)) {
      return;
    }

    Keyboard.dismiss();
    searchInputRef.current?.blur();
    const todo = todos.find((item) => item.id === id);

    if (listMenuOpen) {
      closeListMenu();
    }

    exitTodoSelectMode();
    setNavTab((current) => (current === 'search' ? null : current));
    setActiveTodoDetailDraftContent(todo?.content ?? '');
    setActiveTodoDetailDraftText(todo?.text ?? '');
    todoDetailDraftTodoIdRef.current = id;
    setActiveTodoDetailId(id);
    Haptics.selectionAsync().catch(() => undefined);
  }, [closeListMenu, exitTodoSelectMode, listMenuOpen, pendingDeleteIds, todos]);

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
    [dampMenuPullDistance, menuPullAnim],
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

      if (listMenuScrollOffsetY.current > 1) {
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

      if (listMenuScrollOffsetY.current > 1) {
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
    ],
  );

  const handleListMenuScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      listMenuScrollOffsetY.current = Math.max(0, event.nativeEvent.contentOffset.y);
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

  const closeFilterConfigModal = useCallback(() => {
    setFilterConfigModalVisible(false);
    setNavTab((current) => (current === 'calendar' ? null : current));
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const openFilterConfigModal = useCallback(() => {
    Keyboard.dismiss();
    closeListMenuState();
    setSettingsModalVisible(false);
    setFilterConfigModalVisible(true);
    Haptics.selectionAsync().catch(() => undefined);
  }, [closeListMenuState]);

  const closePresetSaveModal = useCallback(() => {
    Keyboard.dismiss();
    setPresetSaveModalVisible(false);
    setPresetSaveName('');
  }, []);

  const backToCreateDrawerInput = useCallback(() => {
    Keyboard.dismiss();
    setDatePickerVisible(false);
    reminderTimeModalRef.current?.close();
    setRepeatReminderModalVisible(false);
    setCreateDrawerPicker(null);
  }, []);

  const resetCreateDrawerState = useCallback((filters = lastCreateTodoFilters) => {
    const nextFilters = getRememberedCreateDraftFilters(listMenuTree, filters);
    setCreateDraftPriorityFromPicker(shouldHighlightCreatePriorityPicker(nextFilters));
    setCreateDraftContent('');
    setCreateDraftText('');
    setCreateDraftFilters(nextFilters);
    setDatePickerVisible(false);
    reminderTimeModalRef.current?.close();
    setRepeatReminderModalVisible(false);
    setRepeatDraft(decodeTodoReminder(nextFilters.reminder).repeat);
  }, [lastCreateTodoFilters, listMenuTree]);

  const openTodoAlarmDetail = useCallback((id: string) => {
    if (!loadedRef.current) {
      pendingTodoAlarmOpenIdRef.current = id;
      return;
    }

    const todo = todosRef.current.find((item) => item.id === id);
    if (!todo || pendingDeleteIdsRef.current.has(id)) {
      if (pendingTodoAlarmOpenIdRef.current === id) {
        pendingTodoAlarmOpenIdRef.current = null;
      }
      return;
    }

    pendingTodoAlarmOpenIdRef.current = null;
    Keyboard.dismiss();
    searchInputRef.current?.blur();
    closeListMenuState();
    resetCreateDrawerState();
    setActiveDeletedTodoDetailId(null);
    setCreateDrawerPicker(null);
    setCreateDrawerVisible(false);
    setDatePickerVisible(false);
    setPresetSaveModalVisible(false);
    setPresetSaveName('');
    setQuery('');
    reminderTimeModalRef.current?.close();
    setRepeatReminderModalVisible(false);
    setSettingsModalVisible(false);
    setNavTab(null);
    setActiveTodoDetailDraftContent(todo.content);
    setActiveTodoDetailDraftText(todo.text);
    todoDetailDraftTodoIdRef.current = id;
    setActiveTodoDetailId(id);
  }, [closeListMenuState, resetCreateDrawerState]);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    const todoId = pendingTodoAlarmOpenIdRef.current;
    if (todoId) {
      openTodoAlarmDetail(todoId);
    }
  }, [loaded, openTodoAlarmDetail, todos]);

  useEffect(() => {
    let alive = true;
    const openTodo = (todoId: string) => {
      if (alive) {
        openTodoAlarmDetail(todoId);
      }
    };

    consumeLastTodoAlarmNotificationResponse()
      .then((todoId) => {
        if (todoId) {
          openTodo(todoId);
        }
      })
      .catch(() => undefined);

    const subscription = addTodoAlarmResponseListener(openTodo);

    return () => {
      alive = false;
      subscription.remove();
    };
  }, [openTodoAlarmDetail]);

  const goBackInMenu = useCallback(() => {
    if (activeTodoDetailId) {
      closeTodoDetailModal();
      return true;
    }

    if (todoSelectMode) {
      exitTodoSelectMode();
      Haptics.selectionAsync().catch(() => undefined);
      return true;
    }

    if (datePickerVisible) {
      setDatePickerVisible(false);
      return true;
    }

    if (repeatReminderModalVisible) {
      setRepeatReminderModalVisible(false);
      return true;
    }

    if (createDrawerVisible) {
      if (createDrawerPicker) {
        backToCreateDrawerInput();
        return true;
      }

      setCreateDrawerVisible(false);
      resetCreateDrawerState();
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

    if (filterConfigModalVisible) {
      closeFilterConfigModal();
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
    activeTodoDetailId,
    backToCreateDrawerInput,
    closeListMenu,
    closePresetSaveModal,
    closeSettingsModal,
    closeTodoDetailModal,
    createDrawerPicker,
    createDrawerVisible,
    datePickerVisible,
    exitTodoSelectMode,
    menuMode,
    repeatReminderModalVisible,
    presetSaveModalVisible,
    resetCreateDrawerState,
    closeFilterConfigModal,
    filterConfigModalVisible,
    settingsModalVisible,
    submenuOpen,
    todoSelectMode,
  ]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      goBackInMenu,
    );

    return () => subscription.remove();
  }, [goBackInMenu]);

  const searchQuery = deferredQuery.trim();
  const todosById = useMemo(
    () => new Map(todos.map((todo) => [todo.id, todo])),
    [todos],
  );

  useEffect(() => {
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;

    if (!searchQuery) {
      setSearchResultIds(null);
      return undefined;
    }

    setSearchResultIds([]);

    let alive = true;
    localTodoStore.search(searchQuery)
      .then((matchedTodos) => {
        if (alive && searchRequestIdRef.current === requestId) {
          setSearchResultIds(matchedTodos.map((todo) => todo.id));
        }
      })
      .catch(() => {
        if (alive && searchRequestIdRef.current === requestId) {
          setSearchResultIds([]);
        }
      });

    return () => {
      alive = false;
    };
  }, [searchQuery]);

  const filteredTodos = useMemo(() => {
    const matchedTodos = searchQuery
      ? (searchResultIds ?? [])
        .map((id) => todosById.get(id))
        .filter((todo): todo is Todo => Boolean(todo))
      : todos;

    return matchedTodos
      .filter((todo) => !hideDoneTodos || !todo.done)
      .filter((todo) => todoMatchesFilters(todo, deferredSelectedFilters, listMenuTree));
  }, [
    deferredSelectedFilters,
    hideDoneTodos,
    listMenuTree,
    searchQuery,
    searchResultIds,
    todos,
    todosById,
  ]);

  const closeCreateDrawer = useCallback(() => {
    Keyboard.dismiss();
    setCreateDrawerVisible(false);
    setCreateDrawerPicker(null);
    resetCreateDrawerState();
  }, [resetCreateDrawerState]);

  const openCreateDrawer = useCallback((initialText = '') => {
    if (listMenuOpen) {
      closeListMenu();
    }

    exitTodoSelectMode();
    searchInputRef.current?.blur();
    setCreateDrawerPicker(null);
    resetCreateDrawerState();
    setCreateDraftText(
      truncateTodoText(
        initialText.trim().replace(/\s+/g, ' '),
        todoTextMaxLength,
      ),
    );
    Keyboard.dismiss();
    setCreateDrawerVisible(true);
    Haptics.selectionAsync().catch(() => undefined);
  }, [closeListMenu, exitTodoSelectMode, listMenuOpen, resetCreateDrawerState, todoTextMaxLength]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardOverlayInset(Math.max(0, event.endCoordinates.height));
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardOverlayInset(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [windowHeight]);

  useEffect(() => {
    if (!createDrawerVisible && !activeTodoDetailId) {
      setKeyboardOverlayInset(0);
    }
  }, [activeTodoDetailId, createDrawerVisible]);

  const createDrawerPickerMaxHeight = useMemo(() => {
    const toolbarReserve = 168;

    if (keyboardOverlayInset > 0) {
      return Math.max(120, windowHeight - keyboardOverlayInset - toolbarReserve);
    }

    if (createDrawerPicker === 'list') {
      return Math.max(120, windowHeight * 0.5);
    }

    return Math.max(120, windowHeight * 0.42);
  }, [keyboardOverlayInset, createDrawerPicker, windowHeight]);

  const submitCreateTodo = useCallback(() => {
    const text = truncateTodoText(
      createDraftText.trim().replace(/\s+/g, ' '),
      todoTextMaxLength,
    );
    const content = normalizeTodoContent(createDraftContent);

    if (!text) {
      return;
    }

    const exists = todos.some(
      (todo) => (
        !pendingDeleteIds.has(todo.id) &&
        normalizeTodoText(todo.text) === normalizeTodoText(text)
      ),
    );
    if (exists) {
      Keyboard.dismiss();
      closeCreateDrawer();
      return;
    }

    const todoFilters = getCreateTodoFilters(
      listMenuTree,
      createDraftFilters,
    );
    const nextLastCreateTodoFilters = getRememberedCreateDraftFilters(
      listMenuTree,
      todoFilters,
    );
    const todo = makeTodo(text, todoFilters, content);

    setLastCreateTodoFilters(nextLastCreateTodoFilters);
    setTodos((current) => [todo, ...current]);
    highlightNewlyCreatedTodo(todo.id);
    localTodoStore.upsert(todo).catch(() => undefined);
    syncTodoAlarm(todo).catch(() => undefined);
    Keyboard.dismiss();
    setCreateDrawerVisible(false);
    setCreateDrawerPicker(null);
    resetCreateDrawerState(nextLastCreateTodoFilters);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => undefined,
    );
  }, [
    closeCreateDrawer,
    createDraftContent,
    createDraftFilters,
    createDraftText,
    highlightNewlyCreatedTodo,
    listMenuTree,
    pendingDeleteIds,
    resetCreateDrawerState,
    todoTextMaxLength,
    todos,
  ]);

  const createDrawerCanSubmit = useMemo(
    () => createDraftText.trim().replace(/\s+/g, ' ').length > 0,
    [createDraftText],
  );

  const handleCreateDrawerTrailingPress = useCallback(() => {
    if (createDrawerPicker) {
      backToCreateDrawerInput();
      Haptics.selectionAsync().catch(() => undefined);
      return;
    }

    submitCreateTodo();
  }, [backToCreateDrawerInput, createDrawerPicker, submitCreateTodo]);

  const setCreateDraftFilterValue = useCallback((
    filterKey: FilterKey,
    label: string,
  ) => {
    if (filterKey === 'priority') {
      setCreateDraftPriorityFromPicker(label !== 'None');
    }

    const normalizedLabel = filterKey === 'list'
      ? formatListLabel(label)
      : filterKey === 'date'
        ? formatDateFilterValue(label)
        : label;

    setCreateDraftFilters((current) => ({
      ...current,
      [filterKey]:
        filterKey === 'priority' && label === 'None' ? [] : [normalizedLabel],
    }));
    setCreateDrawerPicker(null);
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const openCreateDrawerPicker = useCallback((picker: CreateDrawerPicker) => {
    Keyboard.dismiss();
    setDatePickerVisible(false);
    reminderTimeModalRef.current?.close();
    setRepeatReminderModalVisible(false);
    setCreateDrawerPicker(picker);
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const createDrawerPickerItems = useMemo(() => {
    if (createDrawerPicker === 'list') {
      const tree =
        listOrderMode === 'alphabetical' ? sortListMenuTree(listMenuTree) : listMenuTree;
      return tree.map((node) => node.label);
    }

    if (createDrawerPicker === 'date') {
      return DATE_PICKER_MENU_ITEMS;
    }

    if (createDrawerPicker === 'priority') {
      return PRIORITY_MENU_ITEMS;
    }

    return [];
  }, [createDrawerPicker, listMenuTree, listOrderMode]);

  const createDrawerDateLabel = useMemo(
    () => formatCreateDrawerDateLabel(createDraftFilters.date, dateLabelDisplayMode),
    [createDraftFilters.date, dateLabelDisplayMode],
  );

  const createDrawerListLabel = createDraftFilters.list[0] ?? 'Inbox';
  const createDrawerListPickerOpen = createDrawerPicker === 'list';
  const createDrawerListPickerHalfSheet =
    createDrawerListPickerOpen && keyboardOverlayInset === 0;
  const createDrawerListPickerSheetHeight = Math.round(windowHeight * LIST_MENU_HEIGHT_RATIO);
  const createDrawerListPickerTopSpace = Math.round(
    createDrawerListPickerSheetHeight * LIST_MENU_ONE_HANDED_SCROLL_RATIO,
  );
  const createDrawerPriorityHigh = createDraftFilters.priority[0] === 'High';
  const createDrawerDateActive = createDraftFilters.date.length > 0
    || hasTodoReminderTime(createDraftFilters.reminder)
    || hasTodoRepeat(createDraftFilters.reminder);

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
    const todoToDelete = todos.find((todo) => todo.id === id);

    if (!todoToDelete || pendingDeleteIds.has(id)) {
      return;
    }

    const deletedTodo: DeletedTodo = {
      ...cloneTodo(todoToDelete),
      deletedAt: Date.now(),
    };

    localTodoStore.delete(id).catch(() => undefined);
    cancelTodoAlarm(id).catch(() => undefined);
    setTodos((current) => current.filter((todo) => todo.id !== id));
    setDeletedTodos((current) => [
      deletedTodo,
      ...current.filter((todo) => todo.id !== id),
    ]);
    setActiveTodoMenuId((current) => (current === id ? null : current));
    setActiveTodoDetailId((current) => (current === id ? null : current));
    setSelectedTodoIds((current) => {
      if (!current.has(id)) {
        return current;
      }

      const next = new Set(current);
      next.delete(id);
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, [pendingDeleteIds, todos]);

  const restoreDeletedTodo = useCallback((id: string) => {
    const deletedTodo = deletedTodos.find((todo) => todo.id === id);

    if (!deletedTodo || todos.some((todo) => todo.id === id)) {
      return;
    }

    const restoredTodo: Todo = {
      id: deletedTodo.id,
      content: deletedTodo.content,
      text: deletedTodo.text,
      done: deletedTodo.done,
      createdAt: deletedTodo.createdAt,
      filters: cloneTodoFilters(deletedTodo.filters),
    };

    setTodos((current) => (
      current.some((todo) => todo.id === restoredTodo.id)
        ? current
        : [restoredTodo, ...current]
    ));
    const nextDeletedTodos = deletedTodos.filter((todo) => todo.id !== id);

    setDeletedTodos(nextDeletedTodos);
    setActiveDeletedTodoDetailId((current) => (current === id ? null : current));
    appSettingsStore.save(
      createSettingsSnapshot({ deletedTodos: nextDeletedTodos }),
    ).catch(() => undefined);
    localTodoStore.upsert(restoredTodo).catch(() => undefined);
    syncTodoAlarm(restoredTodo).catch(() => undefined);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, [createSettingsSnapshot, deletedTodos, todos]);

  const deleteDeletedTodoPermanently = useCallback((id: string) => {
    const deletedTodo = deletedTodos.find((todo) => todo.id === id);

    if (!deletedTodo) {
      return;
    }

    Alert.alert(
      'Delete permanently?',
      deletedTodo.text,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const nextDeletedTodos = deletedTodos.filter((todo) => todo.id !== id);
            setDeletedTodos(nextDeletedTodos);
            setActiveDeletedTodoDetailId((current) => (current === id ? null : current));
            appSettingsStore.save(
              createSettingsSnapshot({ deletedTodos: nextDeletedTodos }),
            ).catch(() => undefined);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
              () => undefined,
            );
          },
        },
      ],
    );
  }, [createSettingsSnapshot, deletedTodos]);

  const setTodoDone = useCallback((id: string, done: boolean) => {
    if (pendingDeleteIds.has(id)) {
      return;
    }

    const updatedTodo = todos.find((todo) => todo.id === id);
    const repeatedNextTodo = done && updatedTodo
      ? advanceRepeatingTodoAfterDone(updatedTodo)
      : null;
    const nextTodo = repeatedNextTodo ?? (updatedTodo ? { ...updatedTodo, done } : null);

    setTodos((current) =>
      current.map((todo) => (
        todo.id === id && nextTodo ? nextTodo : todo
      )),
    );
    if (done && nextTodo?.done && hideDoneTodos) {
      setActiveTodoMenuId((current) => (current === id ? null : current));
      setActiveTodoDetailId((current) => (current === id ? null : current));
    }
    if (nextTodo) {
      if (repeatedNextTodo) {
        localTodoStore.upsert(repeatedNextTodo).catch(() => undefined);
      } else {
        localTodoStore.updateDone(id, done).catch(() => undefined);
      }
      syncTodoAlarm(nextTodo).catch(() => undefined);
    } else if (done) {
      cancelTodoAlarm(id).catch(() => undefined);
    }
  }, [hideDoneTodos, pendingDeleteIds, todos]);

  const deleteSelectedTodos = useCallback(() => {
    const ids = [...selectedTodoIds];

    if (ids.length === 0) {
      return;
    }

    Alert.alert(
      ids.length === 1 ? 'Delete item?' : `Delete ${ids.length} items?`,
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            ids.forEach((id) => deleteTodo(id));
            exitTodoSelectMode();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
              () => undefined,
            );
          },
        },
      ],
    );
  }, [deleteTodo, exitTodoSelectMode, selectedTodoIds]);

  const markSelectedTodosDone = useCallback((done: boolean) => {
    selectedTodoIds.forEach((id) => setTodoDone(id, done));
    exitTodoSelectMode();
    Haptics.selectionAsync().catch(() => undefined);
  }, [exitTodoSelectMode, selectedTodoIds, setTodoDone]);

  const selectedTodosAllDone = useMemo(() => {
    if (selectedTodoIds.size === 0) {
      return false;
    }

    return [...selectedTodoIds].every((id) => todosById.get(id)?.done);
  }, [selectedTodoIds, todosById]);

  const updateTodoFiltersForIds = useCallback((
    ids: string[],
    updater: (filters: SelectedFilters) => SelectedFilters,
  ) => {
    const targetIds = new Set(ids.filter((id) => !pendingDeleteIds.has(id)));

    if (targetIds.size === 0) {
      return;
    }

    setTodos((current) => {
      const updatedTodos: Todo[] = [];
      const nextTodos = current.map((todo) => {
        if (!targetIds.has(todo.id)) {
          return todo;
        }

        const nextFilters = updater(cloneTodoFilters(todo.filters));
        const updatedTodo = { ...todo, filters: nextFilters };
        updatedTodos.push(updatedTodo);
        return updatedTodo;
      });

      if (updatedTodos.length > 0) {
        localTodoStore.upsertMany(updatedTodos).catch(() => undefined);
        updatedTodos.forEach((todo) => {
          syncTodoAlarm(todo).catch(() => undefined);
        });
      }

      return nextTodos;
    });
  }, [pendingDeleteIds]);

  const getCurrentTodoEditTargetIds = useCallback(() => {
    if (activeTodoMenuIdRef.current) {
      return pendingDeleteIds.has(activeTodoMenuIdRef.current)
        ? []
        : [activeTodoMenuIdRef.current];
    }

    return [...selectedTodoIds].filter((id) => !pendingDeleteIds.has(id));
  }, [pendingDeleteIds, selectedTodoIds]);

  const updateCurrentTodoTargetFilters = useCallback((
    updater: (filters: SelectedFilters) => SelectedFilters,
  ) => {
    const targetIds = getCurrentTodoEditTargetIds();

    if (targetIds.length > 0) {
      updateTodoFiltersForIds(targetIds, updater);
      return;
    }

    setSelectedFilters((current) => updater(cloneTodoFilters(current)));
  }, [getCurrentTodoEditTargetIds, updateTodoFiltersForIds]);

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
    } else {
      updateCurrentTodoTargetFilters(applyDate);
    }

    closeDatePicker();
    Haptics.selectionAsync().catch(() => undefined);
  }, [closeDatePicker, updateCurrentTodoTargetFilters]);

  const clearPickedDate = useCallback(() => {
    const clearDate = (current: SelectedFilters) => ({
      ...current,
      date: [],
    });

    if (datePickerApplyRef.current === 'create') {
      setCreateDraftFilters(clearDate);
    } else {
      updateCurrentTodoTargetFilters(clearDate);
    }

    closeDatePicker();
    Haptics.selectionAsync().catch(() => undefined);
  }, [closeDatePicker, updateCurrentTodoTargetFilters]);

  const clearCreateDraftDate = useCallback(() => {
    setCreateDraftFilters((current) => ({
      ...current,
      date: [],
    }));
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const openDatePicker = useCallback((
    source: 'create' | 'filters',
    dateLabels: string[],
  ) => {
    datePickerApplyRef.current = source;
    setDatePickerValue(getInitialDatePickerValue(dateLabels));
    setDatePickerVisible(true);
  }, []);

  const openCreateReminderModal = useCallback(() => {
    reminderTimeModalRef.current?.open({
      source: 'create',
      value: decodeTodoReminder(createDraftFilters.reminder).time,
    });
    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, [createDraftFilters.reminder]);

  const confirmReminderTime = useCallback((
    source: ReminderTimeModalSource,
    time: ReminderTime,
  ) => {
    if (source === 'create') {
      setCreateDraftFilters((draft) => {
        const current = decodeTodoReminder(draft.reminder);

        return {
          ...draft,
          reminder: encodeTodoReminder({ time, repeat: current.repeat }),
        };
      });
    } else {
      const targetIds = getCurrentTodoEditTargetIds();

      if (targetIds.length > 0) {
        updateTodoFiltersForIds(targetIds, (filters) => {
          const current = decodeTodoReminder(filters.reminder);

          return {
            ...filters,
            reminder: encodeTodoReminder({ time, repeat: current.repeat }),
          };
        });
      }
    }

    Haptics.selectionAsync().catch(() => undefined);
  }, [getCurrentTodoEditTargetIds, updateTodoFiltersForIds]);

  const openCreateRepeatModal = useCallback(() => {
    repeatReminderApplyRef.current = 'create';
    setRepeatDraft(decodeTodoReminder(createDraftFilters.reminder).repeat);
    setRepeatReminderModalVisible(true);
    Haptics.selectionAsync().catch(() => undefined);
  }, [createDraftFilters.reminder]);

  const closeCreateRepeatModal = useCallback(() => {
    setRepeatReminderModalVisible(false);
  }, []);

  const confirmCreateRepeat = useCallback((repeat: RepeatPreset) => {
    if (repeatReminderApplyRef.current === 'create') {
      setCreateDraftFilters((draft) => {
        const current = decodeTodoReminder(draft.reminder);
        const nextTime = repeat === 'none'
          ? current.time
          : current.time ?? { ...DEFAULT_REMINDER_TIME };

        return {
          ...draft,
          reminder: encodeTodoReminder({ time: nextTime, repeat }),
        };
      });
    } else {
      const targetIds = getCurrentTodoEditTargetIds();

      if (targetIds.length > 0) {
        updateTodoFiltersForIds(targetIds, (filters) => {
          const current = decodeTodoReminder(filters.reminder);
          const nextTime = repeat === 'none'
            ? current.time
            : current.time ?? { ...DEFAULT_REMINDER_TIME };

          return {
            ...filters,
            reminder: encodeTodoReminder({ time: nextTime, repeat }),
          };
        });
      }
    }

    setRepeatReminderModalVisible(false);
    Haptics.selectionAsync().catch(() => undefined);
  }, [getCurrentTodoEditTargetIds, updateTodoFiltersForIds]);

  const clearCreateReminderTime = useCallback(() => {
    setCreateDraftFilters((draft) => ({
      ...draft,
      reminder: encodeTodoReminder({ time: null, repeat: 'none' }),
    }));
    reminderTimeModalRef.current?.close();
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const clearCreateRepeat = useCallback(() => {
    setCreateDraftFilters((draft) => {
      const current = decodeTodoReminder(draft.reminder);

      return {
        ...draft,
        reminder: encodeTodoReminder({ time: current.time, repeat: 'none' }),
      };
    });
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const openActiveTodoReminderModal = useCallback(() => {
    const [firstTargetId] = getCurrentTodoEditTargetIds();

    if (!firstTargetId) {
      return;
    }

    const reminderValues = todos.find((todo) => todo.id === firstTargetId)?.filters.reminder ?? [];

    reminderTimeModalRef.current?.open({
      source: 'activeTodo',
      value: decodeTodoReminder(reminderValues).time,
    });
    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, [getCurrentTodoEditTargetIds, todos]);

  const openActiveTodoRepeatModal = useCallback(() => {
    const [firstTargetId] = getCurrentTodoEditTargetIds();

    if (!firstTargetId) {
      return;
    }

    const reminderValues = todos.find((todo) => todo.id === firstTargetId)?.filters.reminder ?? [];

    repeatReminderApplyRef.current = 'activeTodo';
    setRepeatDraft(decodeTodoReminder(reminderValues).repeat);
    setRepeatReminderModalVisible(true);
    Haptics.selectionAsync().catch(() => undefined);
  }, [getCurrentTodoEditTargetIds, todos]);

  const clearActiveTodoReminderTime = useCallback(() => {
    const targetIds = getCurrentTodoEditTargetIds();

    if (targetIds.length === 0) {
      return;
    }

    updateTodoFiltersForIds(targetIds, (filters) => ({
      ...filters,
      reminder: encodeTodoReminder({ time: null, repeat: 'none' }),
    }));
    reminderTimeModalRef.current?.close();
    Haptics.selectionAsync().catch(() => undefined);
  }, [getCurrentTodoEditTargetIds, updateTodoFiltersForIds]);

  const clearActiveTodoRepeat = useCallback(() => {
    const targetIds = getCurrentTodoEditTargetIds();

    if (targetIds.length === 0) {
      return;
    }

    updateTodoFiltersForIds(targetIds, (filters) => {
      const current = decodeTodoReminder(filters.reminder);

      return {
        ...filters,
        reminder: encodeTodoReminder({ time: current.time, repeat: 'none' }),
      };
    });
    Haptics.selectionAsync().catch(() => undefined);
  }, [getCurrentTodoEditTargetIds, updateTodoFiltersForIds]);

  const handleCreateDrawerDatePress = useCallback((label: string) => {
    if (label === REMINDER_PICKER_LABEL) {
      openCreateReminderModal();
      return;
    }

    if (label === REPEAT_PICKER_LABEL) {
      openCreateRepeatModal();
      return;
    }

    if (label === CUSTOM_DATE_LABEL) {
      openDatePicker('create', createDraftFilters.date);
      return;
    }

    if (isDateMenuItemSelected(label, createDraftFilters.date)) {
      clearCreateDraftDate();
      return;
    }

    setCreateDraftFilterValue('date', label);
  }, [
    clearCreateDraftDate,
    createDraftFilters.date,
    openCreateReminderModal,
    openCreateRepeatModal,
    openDatePicker,
    setCreateDraftFilterValue,
  ]);

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

  const markTodoRowTouchStart = useCallback((event: GestureResponderEvent) => {
    const { pageX, pageY, timestamp } = event.nativeEvent;
    todoRowTouchStartRef.current = { pageX, pageY, timestamp };
  }, []);

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

      if (todoSelectMode) {
        const todoRowTouchStart = todoRowTouchStartRef.current;
        const startedOnTodoRow =
          Math.abs(start.timestamp - todoRowTouchStart.timestamp) < 48 &&
          Math.hypot(
            start.pageX - todoRowTouchStart.pageX,
            start.pageY - todoRowTouchStart.pageY,
          ) < 6;

        if (!startedOnTodoRow) {
          lastListTapRef.current = { pageX: 0, pageY: 0, timestamp: 0 };
          exitTodoSelectMode();
          Haptics.selectionAsync().catch(() => undefined);
        }

        return;
      }

      registerListTap(pageX, pageY, timestamp);
    },
    [exitTodoSelectMode, registerListTap, todoSelectMode],
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
      const offsetY = Math.max(0, event.nativeEvent.contentOffset.y);
      scrollOffsetY.current = offsetY;
      actualScrollOffsetY.current = offsetY;
      maybeRevealPendingTodoMenuHighlight(offsetY);
    },
    [maybeRevealPendingTodoMenuHighlight],
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
    () => buildVisibleListMenuItems(
      orderedListMenuTree,
      Boolean(activeTodoMenuId) || todoSelectMode,
    ),
    [activeTodoMenuId, orderedListMenuTree, todoSelectMode],
  );
  const filterConfigListItems = useMemo(
    () => buildVisibleListMenuItems(orderedListMenuTree, true),
    [orderedListMenuTree],
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
  const todoListDisplay = useMemo(
    () => resolveListDisplaySettings(
      listMenuTree,
      deferredSelectedFilters.list,
      todoSortMode,
      todoGroupMode,
    ),
    [deferredSelectedFilters.list, listMenuTree, todoGroupMode, todoSortMode],
  );
  const todoListSortMode = todoListDisplay.sortMode;
  const todoListGroupMode = todoListDisplay.groupMode;
  const activeMenuPreset = useMemo(() => {
    if (activeTodoMenuId) {
      return null;
    }

    return menuPresets.find((preset) => menuPresetMatchesState(
      preset,
      selectedFilters,
      effectiveSortMode,
      effectiveGroupMode,
      listOrderMode,
    )) ?? null;
  }, [
    activeTodoMenuId,
    effectiveGroupMode,
    effectiveSortMode,
    listOrderMode,
    menuPresets,
    selectedFilters,
  ]);
  const todoListUseSubsectionLayout =
    todoListDisplay.isSubsectionView && todoListGroupMode === 'none';
  const sortedTodos = useMemo(
    () => [...filteredTodos].sort((first, second) => (
      compareTodosBySortMode(first, second, todoListSortMode)
    )),
    [filteredTodos, todoListSortMode],
  );
  const todoListRows = useMemo(
    () => buildTodoListRows(
      sortedTodos,
      todoListGroupMode,
      todoListSortMode,
      orderedListLabels,
      listMenuTree,
      deferredSelectedFilters.list,
      todoListUseSubsectionLayout,
      dateLabelDisplayMode,
    ),
    [
      dateLabelDisplayMode,
      deferredSelectedFilters.list,
      listMenuTree,
      orderedListLabels,
      sortedTodos,
      todoListGroupMode,
      todoListSortMode,
      todoListUseSubsectionLayout,
    ],
  );
  const visibleTodoListRows = useMemo(
    () => flattenTodoListRows(todoListRows, collapsedTodoGroupIds),
    [collapsedTodoGroupIds, todoListRows],
  );
  const pendingDeleteKey = useMemo(
    () => [...pendingDeleteIds].sort().join('|'),
    [pendingDeleteIds],
  );
  const selectedTodoKey = useMemo(
    () => [...selectedTodoIds].sort().join('|'),
    [selectedTodoIds],
  );
  const todoListExtraData = useMemo(
    () => ({
      activeTodoMenuHighlightId,
      activeTodoMenuId,
      menuMode,
      newlyCreatedTodoHighlightId,
      pendingDeleteKey,
      selectedTodoKey,
    }),
    [
      activeTodoMenuHighlightId,
      activeTodoMenuId,
      menuMode,
      newlyCreatedTodoHighlightId,
      pendingDeleteKey,
      selectedTodoKey,
    ],
  );
  const todoListOneHandedOffset = useMemo(() => {
    if (visibleTodoListRows.length === 0) {
      return 0;
    }

    const viewportHeight = todoListFrameHeight || windowHeight;

    return Math.max(
      LIST_MENU_ROW_HEIGHT,
      Math.round(
        (viewportHeight * TODO_LIST_ONE_HANDED_SCROLL_RATIO) /
          LIST_MENU_ROW_HEIGHT,
      ) * LIST_MENU_ROW_HEIGHT,
    );
  }, [todoListFrameHeight, visibleTodoListRows.length, windowHeight]);
  const todoListContentOffset = useMemo(
    () => ({ x: 0, y: todoListOneHandedOffset }),
    [todoListOneHandedOffset],
  );
  const selectedTodosForBulk = useMemo(
    () => todos.filter((todo) => (
      selectedTodoIds.has(todo.id) &&
      !pendingDeleteIds.has(todo.id)
    )),
    [pendingDeleteIds, selectedTodoIds, todos],
  );
  const bulkTodoSharedFilters = useMemo(
    () => (selectedTodosForBulk.length > 0
      ? getSharedTodoFilters(selectedTodosForBulk)
      : null),
    [selectedTodosForBulk],
  );
  const bulkTodoMenuFilters = useMemo(
    () => (selectedTodosForBulk.length > 0
      ? getMergedTodoFilters(selectedTodosForBulk)
      : null),
    [selectedTodosForBulk],
  );
  const activeTodoMenuFilters = useMemo(() => {
    if (activeTodoMenuId) {
      return todos.find((todo) => todo.id === activeTodoMenuId)?.filters ?? null;
    }

    return bulkTodoMenuFilters;
  }, [activeTodoMenuId, bulkTodoMenuFilters, todos]);
  const activeTodoMenuSelectionFilters = useMemo(() => {
    if (activeTodoMenuId) {
      return todos.find((todo) => todo.id === activeTodoMenuId)?.filters ?? null;
    }

    return bulkTodoSharedFilters;
  }, [activeTodoMenuId, bulkTodoSharedFilters, todos]);
  const activeTodoDetail = useMemo(
    () => todos.find((todo) => todo.id === activeTodoDetailId) ?? null,
    [activeTodoDetailId, todos],
  );
  const activeDeletedTodoDetail = useMemo(
    () => deletedTodos.find((todo) => todo.id === activeDeletedTodoDetailId) ?? null,
    [activeDeletedTodoDetailId, deletedTodos],
  );
  useEffect(() => {
    if (!activeDeletedTodoDetail && activeDeletedTodoDetailId !== null) {
      setActiveDeletedTodoDetailId(null);
    }
  }, [activeDeletedTodoDetail, activeDeletedTodoDetailId]);
  useEffect(() => {
    if (!activeTodoDetail) {
      if (activeTodoDetailId !== null) {
        setActiveTodoDetailId(null);
      }
      setActiveTodoDetailDraftContent('');
      setActiveTodoDetailDraftText('');
      todoDetailDraftTodoIdRef.current = null;
      return;
    }

    if (todoDetailDraftTodoIdRef.current === activeTodoDetail.id) {
      return;
    }

    setActiveTodoDetailDraftContent(activeTodoDetail.content);
    setActiveTodoDetailDraftText(activeTodoDetail.text);
    todoDetailDraftTodoIdRef.current = activeTodoDetail.id;
  }, [activeTodoDetail, activeTodoDetailId]);
  const activeTodoDetailDraftTextForSave = useMemo(
    () => truncateTodoText(
      activeTodoDetailDraftText.trim().replace(/\s+/g, ' '),
      todoTextMaxLength,
    ),
    [activeTodoDetailDraftText, todoTextMaxLength],
  );
  const activeTodoDetailDraftContentForSave = useMemo(
    () => normalizeTodoContent(activeTodoDetailDraftContent),
    [activeTodoDetailDraftContent],
  );
  const activeTodoDetailHasChanges = Boolean(
    activeTodoDetail &&
      (
        activeTodoDetail.text !== activeTodoDetailDraftTextForSave ||
        activeTodoDetail.content !== activeTodoDetailDraftContentForSave
      ),
  );
  const activeTodoDetailCanSave = Boolean(
    activeTodoDetail &&
      activeTodoDetailHasChanges &&
      activeTodoDetailDraftTextForSave.length > 0,
  );
  const saveActiveTodoDetail = useCallback(() => {
    if (!activeTodoDetail || !activeTodoDetailCanSave) {
      return;
    }

    const todoId = activeTodoDetail.id;
    const updatedTodo: Todo = {
      ...activeTodoDetail,
      content: activeTodoDetailDraftContentForSave,
      text: activeTodoDetailDraftTextForSave,
    };
    setTodos((current) =>
      current.map((todo) => (
        todo.id === todoId
          ? { ...todo, content: updatedTodo.content, text: updatedTodo.text }
          : todo
      )),
    );
    localTodoStore.upsert(updatedTodo).catch(() => undefined);
    syncTodoAlarm(updatedTodo).catch(() => undefined);
    Keyboard.dismiss();
    setActiveTodoDetailId(null);
    setActiveTodoDetailDraftContent('');
    setActiveTodoDetailDraftText('');
    todoDetailDraftTodoIdRef.current = null;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => undefined,
    );
  }, [
    activeTodoDetail,
    activeTodoDetailCanSave,
    activeTodoDetailDraftContentForSave,
    activeTodoDetailDraftTextForSave,
  ]);
  const menuFilters = activeTodoMenuFilters ?? selectedFilters;
  const menuSelectionFilters = activeTodoMenuSelectionFilters ?? selectedFilters;
  const hasTodoEditTargets = Boolean(activeTodoMenuId) || selectedTodosForBulk.length > 0;
  const includeActiveTodoReminderRows = hasTodoEditTargets;
  const activeFilterCount = countFilters(menuFilters, includeActiveTodoReminderRows);
  const searchFilterItems = useMemo(
    () => buildActiveFilterItems(selectedFilters, dateLabelDisplayMode),
    [dateLabelDisplayMode, selectedFilters],
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
      const dateMenuItems = includeActiveTodoReminderRows
        ? DATE_PICKER_MENU_ITEMS
        : DATE_MENU_ITEMS;

      return dateMenuItems.map((label) => ({
        filterKey: 'date',
        id: `date-${label}`,
        label,
        type: 'value',
      }));
    }

    if (menuMode === 'filters') {
      return FILTER_KEYS
        .flatMap((filterKey) => menuFilters[filterKey].map((label) => ({
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

    if (menuMode === 'metaTags') {
      return META_TAG_KEYS.map((key) => ({
        id: `meta-tag-${key}`,
        label: META_TAG_LABELS[key],
        metaTagKey: key,
        type: 'metaTagOption',
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
      );

      if (!hasTodoEditTargets) {
        rows.push({
          id: 'preset-save-current',
          label: 'Save current as preset',
          summary: currentPresetSummary,
          type: 'savePreset' as const,
        });
      }

      return rows;
    }

    if (todoSelectMode) {
      return [
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
          count: countDateMenuSelections(
            menuFilters,
            includeActiveTodoReminderRows,
          ) || undefined,
          id: 'main-date',
          label: 'Date',
          menuMode: 'date',
          type: 'menu',
        },
      ];
    }

    const rows: MenuRow[] = [
      {
        count: menuPresets.length || undefined,
        id: 'main-presets',
        label: 'Presets',
        menuMode: 'presets',
        type: 'menu',
        valueLabel: activeMenuPreset?.label,
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
        count: countDateMenuSelections(
          menuFilters,
          includeActiveTodoReminderRows,
        ) || undefined,
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
        id: 'main-meta-tags',
        label: 'Meta tags',
        menuMode: 'metaTags',
        type: 'menu',
        valueLabel: formatMetaTagVisibilitySummary(metaTagVisibility),
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
    activeMenuPreset,
    currentPresetSummary,
    hasTodoEditTargets,
    includeActiveTodoReminderRows,
    latestMenuPreset,
    listOrderMode,
    menuFilters,
    menuMode,
    menuPresets,
    effectiveGroupMode,
    effectiveSortMode,
    metaTagVisibility,
    todoSelectMode,
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
      actualScrollOffsetY.current = 0;
      return undefined;
    }

    if (!shouldApplyOffset) {
      return undefined;
    }

    didApplyTodoListInitialOffsetRef.current = true;
    scrollOffsetY.current = todoListOneHandedOffset;
    actualScrollOffsetY.current = todoListOneHandedOffset;

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
      const formattedValue = filterKey === 'date'
        ? formatDateFilterValue(value)
        : value;
      const hasValue = hasTodoEditTargets
        ? (
          filterKey === 'date'
            ? isDateMenuItemSelected(value, menuSelectionFilters.date)
            : menuSelectionFilters[filterKey].includes(value)
        )
        : currentValues.includes(value);

      if (filterKey === 'priority' && hasTodoEditTargets) {
        return {
          ...current,
          priority: value === 'None' ? [] : [value],
        };
      }

      if (filterKey === 'date' && hasTodoEditTargets) {
        return {
          ...current,
          date: formattedValue ? [formattedValue] : [],
        };
      }

      return {
        ...current,
        [filterKey]: hasValue
          ? currentValues.filter((item) => (
            filterKey === 'date'
              ? formatDateFilterValue(item) !== formattedValue
              : item !== value
          ))
          : [...currentValues, formattedValue || value],
      };
    };

    updateCurrentTodoTargetFilters(toggleValue);
    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, [
    hasTodoEditTargets,
    menuSelectionFilters,
    updateCurrentTodoTargetFilters,
  ]);

  const handleDateMenuLabelPress = useCallback((label: string) => {
    if (label === REMINDER_PICKER_LABEL) {
      openActiveTodoReminderModal();
      return;
    }

    if (label === REPEAT_PICKER_LABEL) {
      openActiveTodoRepeatModal();
      return;
    }

    if (label === CUSTOM_DATE_LABEL) {
      openDatePicker('filters', menuFilters.date);
      return;
    }

    toggleFilterValue('date', label);
  }, [
    menuFilters.date,
    openActiveTodoReminderModal,
    openActiveTodoRepeatModal,
    openDatePicker,
    toggleFilterValue,
  ]);

  const toggleListMenuItem = useCallback((item: VisibleListMenuItem) => {
    const toggleValue = (current: SelectedFilters): SelectedFilters => {
      const list = current.list;

      if (hasTodoEditTargets) {
        return { ...current, list: [item.label] };
      }

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

    updateCurrentTodoTargetFilters(toggleValue);

    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, [hasTodoEditTargets, listMenuTree, updateCurrentTodoTargetFilters]);

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

    updateCurrentTodoTargetFilters(removeValue);
    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, [listMenuTree, updateCurrentTodoTargetFilters]);

  const removeFilter = useCallback((filterKey: FilterKey, value: string) => {
    const removeValue = (current: SelectedFilters) => {
      const formattedValue = filterKey === 'date'
        ? formatDateFilterValue(value)
        : value;
      const nextValues = current[filterKey].filter((item) => {
        if (filterKey !== 'date') {
          return item !== value;
        }

        if (formattedValue === CUSTOM_DATE_LABEL) {
          return !isCustomDateLabel(item);
        }

        return formatDateFilterValue(item) !== formattedValue;
      });

      return { ...current, [filterKey]: nextValues };
    };

    updateCurrentTodoTargetFilters(removeValue);
    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, [updateCurrentTodoTargetFilters]);

  const clearAppliedMenuPreset = useCallback(() => {
    if (hasTodoEditTargets) {
      updateCurrentTodoTargetFilters(() => cloneTodoFilters());
    } else {
      setSelectedFilters(cloneTodoFilters());
      setTodoSortMode('newest');
      setTodoGroupMode('none');
      setListOrderMode('alphabetical');
    }

    closeListMenuState();
    Keyboard.dismiss();
    searchInputRef.current?.blur();
    setNavTab(null);
    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, [
    closeListMenuState,
    hasTodoEditTargets,
    updateCurrentTodoTargetFilters,
  ]);

  const clearFilters = useCallback(() => {
    clearAppliedMenuPreset();
  }, [clearAppliedMenuPreset]);

  const setFilterColor = useCallback((
    filterKey: FilterKey,
    value: string,
    color: string | null,
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
        return next;
      }

      todoListRef.current?.clearLayoutCacheOnUpdate();
      next.add(groupId);
      return next;
    });
  }, []);

  const toggleMetaTagVisibility = useCallback((key: MetaTagKey) => {
    setMetaTagVisibility((current) => ({
      ...current,
      [key]: !current[key],
    }));
    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, []);

  const toggleHideDoneTodos = useCallback(() => {
    setHideDoneTodos((current) => !current);
    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, []);

  const toggleDateLabelDisplayMode = useCallback(() => {
    setDateLabelDisplayMode((current) => (
      current === 'remaining' ? 'exact' : 'remaining'
    ));
    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, []);

  const getDateMenuDisplayLabel = useCallback(
    (menuLabel: string, dateLabels: string[]) =>
      getDateMenuItemDisplayLabel(menuLabel, dateLabels, dateLabelDisplayMode),
    [dateLabelDisplayMode],
  );

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
      const clearKey = (current: SelectedFilters) => {
        const nextFilters: SelectedFilters = {
          ...current,
          [filterKey]: [],
        };

        if (filterKey === 'date' && hasTodoEditTargets) {
          nextFilters.reminder = [];
        }

        return nextFilters;
      };

      updateCurrentTodoTargetFilters(clearKey);
      requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
      return;
    }

    if (section === 'filters') {
      clearFilters();
      return;
    }

    if (section === 'presets') {
      clearAppliedMenuPreset();
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
      return;
    }

    if (section === 'metaTags') {
      setMetaTagVisibility(cloneMetaTagVisibility(DEFAULT_META_TAG_VISIBILITY));
      requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
    }
  }, [
    clearAppliedMenuPreset,
    clearFilters,
    hasTodoEditTargets,
    listMenuTree,
    selectedFilters.list,
    todoGroupMode,
    todoSortMode,
    updateCurrentTodoTargetFilters,
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

    if (hasTodoEditTargets) {
      updateCurrentTodoTargetFilters(() => cloneTodoFilters(nextFilters));
    } else {
      setSelectedFilters(nextFilters);
      setListOrderMode(preset.listOrderMode);
      setTodoGroupMode(preset.todoGroupMode);
      setTodoSortMode(preset.todoSortMode);
    }

    closeListMenuState();
    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, [
    closeListMenuState,
    hasTodoEditTargets,
    updateCurrentTodoTargetFilters,
  ]);

  const removeMenuPreset = useCallback((id: string) => {
    const removed = menuPresets.find((preset) => preset.id === id);
    const shouldResetView = Boolean(
      removed &&
      !activeTodoMenuId &&
      menuPresetMatchesState(
        removed,
        selectedFilters,
        effectiveSortMode,
        effectiveGroupMode,
        listOrderMode,
      ),
    );

    setMenuPresets((current) => current.filter((preset) => preset.id !== id));

    if (shouldResetView) {
      clearAppliedMenuPreset();
      return;
    }

    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, [
    activeTodoMenuId,
    clearAppliedMenuPreset,
    effectiveGroupMode,
    effectiveSortMode,
    listOrderMode,
    menuPresets,
    selectedFilters,
  ]);

  const addSettingsList = useCallback(() => {
    const label = formatListLabel(newListName);

    if (!label) {
      return;
    }

    setListMenuTree((current) => {
      const duplicate = current.some(
        (item) => item.label.toLocaleLowerCase() === label.toLocaleLowerCase(),
      );
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
    const label = formatListLabel(newSubsectionName);

    if (!label) {
      return;
    }

    setListMenuTree((current) => {
      const parent = current[parentIndex];
      if (!parent) {
        return current;
      }

      const existingLabels = new Set(
        collectListNodeLabels(current).map((entry) => entry.toLocaleLowerCase()),
      );
      if (existingLabels.has(label.toLocaleLowerCase())) {
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
      setLastCreateTodoFilters((filters) => ({
        ...filters,
        list: filters.list.filter((label) => !removedLabels.has(label)),
      }));
      setTodos((items) => {
        const nextItems = items.map((todo) => ({
          ...todo,
          filters: {
            ...todo.filters,
            list: todo.filters.list.filter((label) => !removedLabels.has(label)),
          },
        }));
        localTodoStore
          .upsertMany(nextItems.filter((todo) => !pendingDeleteIds.has(todo.id)))
          .catch(() => undefined);
        return nextItems;
      });

      const children = parent.children.filter((_, index) => index !== childIndex);
      return current.map((item, index) => (
        index === parentIndex
          ? { ...item, children: children.length > 0 ? children : undefined }
          : item
      ));
    });
    Haptics.selectionAsync().catch(() => undefined);
  }, [pendingDeleteIds]);

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
      setLastCreateTodoFilters((filters) => ({
        ...filters,
        list: filters.list.filter((label) => !removedLabels.has(label)),
      }));
      setTodos((items) => {
        const nextItems = items.map((todo) => ({
          ...todo,
          filters: {
            ...todo.filters,
            list: todo.filters.list.filter((label) => !removedLabels.has(label)),
          },
        }));
        localTodoStore
          .upsertMany(nextItems.filter((todo) => !pendingDeleteIds.has(todo.id)))
          .catch(() => undefined);
        return nextItems;
      });
      setFilterColors((colors) => ({
        ...colors,
        list: Object.fromEntries(
          Object.entries(colors.list).filter(([label]) => !removedLabels.has(label)),
        ),
      }));

      return current.filter((_, itemIndex) => itemIndex !== index);
    });
    Haptics.selectionAsync().catch(() => undefined);
  }, [pendingDeleteIds]);

  const openSettingsModal = useCallback(() => {
    Keyboard.dismiss();
    closeListMenuState();
    setFilterConfigModalVisible(false);
    exitTodoSelectMode();
    setSettingsBackupExpanded(false);
    setSettingsColorsExpanded(false);
    setSettingsDeletedExpanded(false);
    setSettingsDoneExpanded(false);
    setSettingsListsExpanded(false);
    setSettingsModalVisible(true);
    Haptics.selectionAsync().catch(() => undefined);
  }, [closeListMenuState, exitTodoSelectMode]);

  const appHeaderTitle = useMemo(() => {
    if (todoSelectMode) {
      return selectedTodoCount === 1
        ? '1 selected'
        : `${selectedTodoCount} selected`;
    }

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
  }, [activeListDisplay.listLabel, menuMode, selectedFilters.list, selectedTodoCount, todoSelectMode]);

  const focusHeaderSearch = useCallback(() => {
    setNavTab('search');
    closeListMenuState();
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    Haptics.selectionAsync().catch(() => undefined);
  }, [closeListMenuState]);

  const closeHeaderSearch = useCallback(() => {
    Keyboard.dismiss();
    searchInputRef.current?.blur();
    setNavTab(null);
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const showTodoItems = useCallback(() => {
    Keyboard.dismiss();
    searchInputRef.current?.blur();
    closeListMenuState();
    exitTodoSelectMode();
    setSettingsModalVisible(false);
    setFilterConfigModalVisible(false);
    setNavTab(null);
    setQuery('');
    Haptics.selectionAsync().catch(() => undefined);
  }, [closeListMenuState, exitTodoSelectMode]);

  const handleNavTabPress = useCallback((tab: NavTab) => {
    const shouldKeepSelection = todoSelectMode && (tab === 'menu' || tab === 'calendar');

    setActiveTodoMenuId(null);

    if (!shouldKeepSelection) {
      exitTodoSelectMode();
    }

    const sameCalendarOpen =
      tab === 'calendar' &&
      (filterConfigModalVisible || (todoSelectMode && listMenuOpen && menuMode === 'date'));
    const sameMenuOpen =
      tab === 'menu' && listMenuOpen && (navTab === 'menu' || menuMode === 'main');

    if (sameCalendarOpen) {
      Keyboard.dismiss();
      searchInputRef.current?.blur();
      if (filterConfigModalVisible) {
        closeFilterConfigModal();
      } else {
        closeListMenu();
        setNavTab(null);
      }
      return;
    }

    if (sameMenuOpen) {
      Keyboard.dismiss();
      searchInputRef.current?.blur();
      closeListMenu();
      setNavTab(null);
      return;
    }

    if (tab === 'search' && navTab === 'search') {
      closeHeaderSearch();
      return;
    }

    if (tab === 'settings') {
      if (settingsModalVisible) {
        closeSettingsModal();
        return;
      }

      setNavTab('settings');
      openSettingsModal();
      return;
    }

    if (settingsModalVisible) {
      setSettingsModalVisible(false);
      setNavTab((current) => (current === 'settings' ? null : current));
    }

    switch (tab) {
      case 'calendar':
        if (shouldKeepSelection) {
          setFilterConfigModalVisible(false);
          setNavTab('calendar');
          Keyboard.dismiss();
          setMenuMode('date');
          break;
        }

        setNavTab('calendar');
        openFilterConfigModal();
        break;
      case 'menu':
        setNavTab('menu');
        Keyboard.dismiss();
        setMenuMode('main');
        break;
      case 'search':
        focusHeaderSearch();
        return;
      default:
        break;
    }

    Haptics.selectionAsync().catch(() => undefined);
  }, [
    closeHeaderSearch,
    closeFilterConfigModal,
    closeListMenu,
    closeSettingsModal,
    exitTodoSelectMode,
    filterConfigModalVisible,
    focusHeaderSearch,
    listMenuOpen,
    menuMode,
    navTab,
    openFilterConfigModal,
    openSettingsModal,
    settingsModalVisible,
    todoSelectMode,
  ]);

  useEffect(() => {
    if (!listMenuOpen && navTab === 'menu') {
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

    const backupTodos = todos.filter((todo) => !pendingDeleteIds.has(todo.id));
    const payload = createBackupPayload(backupTodos, {
      collapsedTodoGroupIds: [...collapsedTodoGroupIds],
      dateLabelDisplayMode,
      deletedTodos,
      filterColors,
      googleDriveBackupEnabled,
      googleDriveLastBackupAt,
      googleDriveLastRestoreAt,
      hideDoneTodos,
      lastCreateTodoFilters,
      listMenuTree,
      listOrderMode,
      menuPresets,
      selectedFilters,
      todoGroupMode,
      todoSortMode,
      metaTagVisibility,
    });
    await uploadDriveBackup(accessToken, payload);
    setGoogleDriveLastBackupAt(payload.exportedAt);
    setGoogleDriveBackupStatus(
      `Backed up ${backupTodos.length} items · ${formatBackupTime(payload.exportedAt)}`,
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, [
    collapsedTodoGroupIds,
    dateLabelDisplayMode,
    deletedTodos,
    filterColors,
    googleDriveBackupEnabled,
    googleDriveLastBackupAt,
    googleDriveLastRestoreAt,
    hideDoneTodos,
    lastCreateTodoFilters,
    listMenuTree,
    listOrderMode,
    menuPresets,
    metaTagVisibility,
    pendingDeleteIds,
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
    setPendingDeleteIds(new Set());
    await localTodoStore.replaceAll(backup.payload.todos);
    await localTodoStore.markInitialSeeded();
    setTodos(backup.payload.todos);
    reconcileTodoAlarms(backup.payload.todos).catch(() => undefined);
    setDeletedTodos(backup.payload.settings.deletedTodos);
    setSelectedFilters(normalizeTodoFilters(backup.payload.settings.selectedFilters));
    setFilterColors(backup.payload.settings.filterColors);
    setGoogleDriveBackupEnabled(backup.payload.settings.googleDriveBackupEnabled);
    setGoogleDriveLastBackupAt(backup.payload.settings.googleDriveLastBackupAt);
    setGoogleDriveLastRestoreAt(restoredAt);
    setHideDoneTodos(backup.payload.settings.hideDoneTodos);
    setDateLabelDisplayMode(
      backup.payload.settings.dateLabelDisplayMode === 'remaining' ? 'remaining' : 'exact',
    );
    const restoredListMenuTree =
      backup.payload.settings.listMenuTree.length > 0
        ? backup.payload.settings.listMenuTree
        : cloneListMenuTree(DEFAULT_LIST_MENU_TREE);
    const restoredLastCreateTodoFilters = getRememberedCreateDraftFilters(
      restoredListMenuTree,
      backup.payload.settings.lastCreateTodoFilters,
    );
    setListMenuTree(restoredListMenuTree);
    setListOrderMode(backup.payload.settings.listOrderMode);
    setMenuPresets(cloneMenuPresets(backup.payload.settings.menuPresets));
    setTodoGroupMode(backup.payload.settings.todoGroupMode);
    setCollapsedTodoGroupIds(new Set(backup.payload.settings.collapsedTodoGroupIds));
    setTodoSortMode(backup.payload.settings.todoSortMode);
    setMetaTagVisibility(cloneMetaTagVisibility(backup.payload.settings.metaTagVisibility));
    setLastCreateTodoFilters(restoredLastCreateTodoFilters);
    setCreateDraftFilters(restoredLastCreateTodoFilters);
    setCreateDraftPriorityFromPicker(
      shouldHighlightCreatePriorityPicker(restoredLastCreateTodoFilters),
    );
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

  const scrollTodoAboveMenu = useCallback((id: string) => {
    const list = todoListRef.current;

    if (!list) {
      return null;
    }

    const index = visibleTodoListRows.findIndex((row) => {
      if (row.type === 'todo') {
        return row.todo.id === id;
      }

      if (row.type === 'groupedTodo') {
        return row.todo.id === id;
      }

      return false;
    });

    if (index < 0) {
      return null;
    }

    const getTargetOffset = () => {
      const firstItemOffset = list.getFirstItemOffset();
      const layout = list.getLayout(index);

      if (layout) {
        return layout.y + firstItemOffset - TODO_MENU_TARGET_TOP_OFFSET;
      }

      const itemOffset = estimateTodoListOffsetForId(
        todoListRows,
        id,
        collapsedTodoGroupIds,
      );

      if (itemOffset === null) {
        return null;
      }

      return itemOffset + todoListOneHandedOffset - TODO_MENU_TARGET_TOP_OFFSET;
    };

    const targetOffset = getTargetOffset();

    if (targetOffset === null) {
      return null;
    }

    const nextOffset = Math.max(0, targetOffset);

    if (Math.abs(scrollOffsetY.current - nextOffset) < 1) {
      return nextOffset;
    }

    scrollOffsetY.current = nextOffset;
    list.scrollToOffset({
      animated: true,
      offset: nextOffset,
    });
    return nextOffset;
  }, [
    collapsedTodoGroupIds,
    todoListRows,
    todoListOneHandedOffset,
    visibleTodoListRows,
  ]);

  useEffect(() => {
    if (!newlyCreatedTodoHighlightId) {
      return;
    }

    const highlightedId = newlyCreatedTodoHighlightId;
    const isVisible = visibleTodoListRows.some((row) => (
      (row.type === 'todo' || row.type === 'groupedTodo') &&
      row.todo.id === highlightedId
    ));

    if (!isVisible) {
      return;
    }

    let cancelled = false;
    const scrollHighlightedTodoIntoView = () => {
      if (!cancelled) {
        scrollTodoAboveMenu(highlightedId);
      }
    };

    const frame = requestAnimationFrame(scrollHighlightedTodoIntoView);
    const retryTimers = [
      setTimeout(scrollHighlightedTodoIntoView, 120),
      setTimeout(scrollHighlightedTodoIntoView, 320),
    ];

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      retryTimers.forEach(clearTimeout);
    };
  }, [newlyCreatedTodoHighlightId, scrollTodoAboveMenu, visibleTodoListRows]);

  const requestTodoMenuTargetScroll = useCallback((
    id: string,
    options?: { revealHighlight?: boolean },
  ) => {
    const frames: number[] = [];
    let latestTargetOffset: number | null = null;
    const runScroll = () => {
      const targetOffset = scrollTodoAboveMenu(id);

      if (targetOffset !== null) {
        latestTargetOffset = targetOffset;
      }

      return targetOffset;
    };
    const finishScrollRequest = () => {
      if (options?.revealHighlight) {
        scheduleTodoMenuHighlight(id, latestTargetOffset);
      }
    };

    frames.push(requestAnimationFrame(() => {
      runScroll();
      frames.push(requestAnimationFrame(() => {
        runScroll();
        frames.push(requestAnimationFrame(() => {
          runScroll();
          finishScrollRequest();
        }));
      }));
    }));

    return () => {
      frames.forEach((frame) => cancelAnimationFrame(frame));
    };
  }, [scheduleTodoMenuHighlight, scrollTodoAboveMenu]);

  useEffect(() => {
    if (!activeTodoMenuId || !listMenuOpen) {
      return undefined;
    }

    return requestTodoMenuTargetScroll(activeTodoMenuId);
  }, [
    activeTodoMenuId,
    collapsedTodoGroupIds,
    listMenuOpen,
    requestTodoMenuTargetScroll,
    visibleTodoListRows,
  ]);

  const openMenuForTodoAction = useCallback((id: string) => {
    if (pendingDeleteIds.has(id)) {
      return;
    }

    todoMenuReturnOffsetRef.current = actualScrollOffsetY.current;
    setActiveTodoMenuId(id);
    setActiveTodoMenuHighlightId(null);
    Keyboard.dismiss();
    setMenuMode('main');
    requestTodoMenuTargetScroll(id, { revealHighlight: true });

    Haptics.selectionAsync().catch(() => undefined);
  }, [pendingDeleteIds, requestTodoMenuTargetScroll]);

  const groupedHiddenMetaTagKinds = useMemo((): HiddenMetaTagKind[] => {
    if (todoListGroupMode === 'date') return ['date'];
    if (todoListGroupMode === 'list') return ['list'];
    if (todoListGroupMode === 'priority') return ['priority'];
    return [];
  }, [todoListGroupMode]);

  const renderVisibleTodoRowGap = useCallback(
    (gapBefore: boolean) => (gapBefore ? <View style={styles.todoListRowGap} /> : null),
    [],
  );

  const renderTodoItem = useCallback(
    ({ item }: { item: VisibleTodoListRow }) => {
      if (item.type === 'sectionHeader') {
        const isExpanded = !item.isCollapsed && item.count > 0;

        return (
          <View>
            {renderVisibleTodoRowGap(item.gapBefore)}
            <View
              collapsable={false}
              style={[
                styles.todoSectionCardShadow,
                isExpanded && styles.todoSectionCardShadowExpanded,
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isExpanded }}
                accessibilityLabel={`${item.label}, ${item.count} items`}
                collapsable={false}
                unstable_pressDelay={TODO_GROUP_HEADER_PRESS_DELAY_MS}
                {...getInstantPressHandlers(
                  `todo-group:${item.id}`,
                  () => toggleTodoGroupCollapsed(item.id),
                  { stopPropagation: true },
                )}
                style={({ pressed }) => [
                  styles.todoSectionCard,
                  isExpanded && styles.todoSectionCardExpanded,
                  styles.todoSectionHeader,
                  pressed && styles.todoGroupHeaderPressed,
                ]}
              >
                <Text numberOfLines={1} style={styles.todoSectionTitle}>
                  {item.label}
                </Text>
                <View style={styles.todoSectionHeaderMeta}>
                  <Text style={styles.todoGroupCount}>{item.count}</Text>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    color={THEME_TEXT_SECONDARY}
                    size={18}
                  />
                </View>
              </Pressable>
            </View>
          </View>
        );
      }

      if (item.type === 'groupedTodo') {
        const isPendingDelete = pendingDeleteIds.has(item.todo.id);
        const isTodoMenuTarget =
          !isPendingDelete &&
          menuMode !== null &&
          activeTodoMenuId === item.todo.id;
        const isTodoMenuTargetHighlighted =
          isTodoMenuTarget &&
          activeTodoMenuHighlightId === item.todo.id;
        const isSelected = selectedTodoIds.has(item.todo.id);
        const isNewlyCreatedTodo =
          newlyCreatedTodoHighlightId === item.todo.id;

        return (
          <View>
            {renderVisibleTodoRowGap(item.gapBefore)}
            <View
              style={[
                styles.todoSectionGroupedShell,
                item.isLastInSection && styles.todoSectionGroupedShellLast,
              ]}
            >
              {!item.isFirstInSection ? <View style={styles.todoRowDivider} /> : null}
              <TodoRow
                dateLabelDisplayMode={dateLabelDisplayMode}
                filterColors={filterColors}
                hiddenMetaTagKinds={groupedHiddenMetaTagKinds}
                isSelected={isSelected}
                item={item.todo}
                isMenuTarget={isTodoMenuTarget}
                isMenuTargetHighlighted={isTodoMenuTargetHighlighted}
                isNewlyCreated={isNewlyCreatedTodo}
                isPendingDelete={isPendingDelete}
                layout="grouped"
                metaTagVisibility={metaTagVisibility}
                onDelete={deleteTodo}
                onEnterSelectMode={enterTodoSelectMode}
                onOpenDetail={openTodoDetailModal}
                onOpenMenu={openMenuForTodoAction}
                onSetDone={setTodoDone}
                onTouchStart={markTodoRowTouchStart}
                onToggleSelect={toggleTodoSelection}
                selectMode={todoSelectMode}
                sectionLabel={item.sectionLabel}
              />
            </View>
          </View>
        );
      }

      const isPendingDelete = pendingDeleteIds.has(item.todo.id);
      const isTodoMenuTarget =
        !isPendingDelete &&
        menuMode !== null &&
        activeTodoMenuId === item.todo.id;
      const isTodoMenuTargetHighlighted =
        isTodoMenuTarget &&
        activeTodoMenuHighlightId === item.todo.id;
      const isSelected = selectedTodoIds.has(item.todo.id);
      const isNewlyCreatedTodo =
        newlyCreatedTodoHighlightId === item.todo.id;

      return (
        <View>
          {renderVisibleTodoRowGap(item.gapBefore)}
          <TodoRow
            dateLabelDisplayMode={dateLabelDisplayMode}
            filterColors={filterColors}
            isSelected={isSelected}
            item={item.todo}
            isMenuTarget={isTodoMenuTarget}
            isMenuTargetHighlighted={isTodoMenuTargetHighlighted}
            isNewlyCreated={isNewlyCreatedTodo}
            isPendingDelete={isPendingDelete}
            metaTagVisibility={metaTagVisibility}
            onDelete={deleteTodo}
            onEnterSelectMode={enterTodoSelectMode}
            onOpenDetail={openTodoDetailModal}
            onOpenMenu={openMenuForTodoAction}
            onSetDone={setTodoDone}
            onTouchStart={markTodoRowTouchStart}
            onToggleSelect={toggleTodoSelection}
            selectMode={todoSelectMode}
          />
        </View>
      );
    },
    [
      activeTodoMenuId,
      activeTodoMenuHighlightId,
      dateLabelDisplayMode,
      deleteTodo,
      enterTodoSelectMode,
      filterColors,
      getInstantPressHandlers,
      groupedHiddenMetaTagKinds,
      menuMode,
      metaTagVisibility,
      markTodoRowTouchStart,
      newlyCreatedTodoHighlightId,
      openTodoDetailModal,
      openMenuForTodoAction,
      pendingDeleteIds,
      renderVisibleTodoRowGap,
      selectedTodoIds,
      setTodoDone,
      toggleTodoGroupCollapsed,
      toggleTodoSelection,
      todoSelectMode,
    ],
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.screen}>
        <View style={styles.appHeader}>
          {todoSelectMode ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel selection"
              onPress={() => {
                exitTodoSelectMode();
                Haptics.selectionAsync().catch(() => undefined);
              }}
              style={({ pressed }) => [
                styles.appHeaderSideButton,
                styles.appHeaderSideButtonLeft,
                pressed && styles.appHeaderSideButtonPressed,
              ]}
            >
              <Ionicons color={NAV_ACCENT} name="close" size={24} />
            </Pressable>
          ) : null}
          <Text numberOfLines={1} style={styles.appHeaderTitle}>
            {appHeaderTitle}
          </Text>
          {todoSelectMode ? (
            <View style={styles.appHeaderSelectActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={selectedTodosAllDone ? 'Mark selected active' : 'Mark selected done'}
                onPress={() => markSelectedTodosDone(!selectedTodosAllDone)}
                style={({ pressed }) => [
                  styles.appHeaderSideButton,
                  pressed && styles.appHeaderSideButtonPressed,
                ]}
              >
                <Ionicons
                  color={NAV_ACCENT}
                  name={selectedTodosAllDone ? 'arrow-undo' : 'checkmark'}
                  size={23}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete selected items"
                onPress={deleteSelectedTodos}
                style={({ pressed }) => [
                  styles.appHeaderSideButton,
                  pressed && styles.appHeaderSideButtonPressed,
                ]}
              >
                <Ionicons color="#D14A42" name="trash-outline" size={22} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Opens settings"
              accessibilityLabel="Settings"
              accessibilityState={{ selected: navTab === 'settings' }}
              onPress={() => handleNavTabPress('settings')}
              style={({ pressed }) => [
                styles.appHeaderSideButton,
                styles.appHeaderSideButtonRight,
                navTab === 'settings' && styles.appHeaderSettingsButtonActive,
                pressed && styles.appHeaderSideButtonPressed,
              ]}
            >
              <Ionicons
                color={navTab === 'settings' ? NAV_ACCENT : NAV_ICON_INACTIVE}
                name="cog-outline"
                size={23}
              />
            </Pressable>
          )}
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
                        item.value,
                      );

                      return (
                        <View key={item.id} style={styles.searchFilterRow}>
                          <View
                            style={[
                              styles.listMenuColorDot,
                              colorTheme
                                ? { backgroundColor: colorTheme.accent }
                                : styles.listMenuColorDotNoColor,
                            ]}
                          />
                          <View style={styles.searchFilterRowText}>
                            <Text style={styles.searchFilterLabel}>{item.displayLabel}</Text>
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
                <FlashList
                  ref={todoListRef}
                  alwaysBounceVertical={false}
                  bounces={false}
                  contentContainerStyle={[
                    styles.listContent,
                    hasTodoEditTargets &&
                      listMenuOpen && {
                        paddingBottom: listMenuHeight + LIST_MENU_BOTTOM_OFFSET + 104,
                      },
                    filteredTodos.length === 0 && styles.emptyListContent,
                  ]}
                  contentOffset={todoListContentOffset}
                  data={visibleTodoListRows}
                  extraData={todoListExtraData}
                  getItemType={getTodoListItemType}
                  keyboardDismissMode="on-drag"
                  keyboardShouldPersistTaps="handled"
                  keyExtractor={getTodoListItemKey}
                  maintainVisibleContentPosition={TODO_LIST_MAINTAIN_VISIBLE_CONTENT_POSITION}
                  ListEmptyComponent={
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyIcon}>
                        {query.trim() ? '⌕' : '✎'}
                      </Text>
                      <Text style={styles.emptyTitle}>
                        {query.trim()
                          ? 'No matching items'
                          : hideDoneTodos
                            ? 'No active items'
                            : 'No items yet'}
                      </Text>
                      <Text style={styles.emptyText}>
                        {query.trim()
                          ? 'Try a different search term.'
                          : hideDoneTodos
                            ? 'Done items are hidden.'
                            : 'Tap + in the bar below to add a todo.'}
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
                  renderItem={renderTodoItem}
                  scrollEventThrottle={16}
                  showsVerticalScrollIndicator={false}
                />
              )}
            </View>
          </View>

        </View>

        <View style={[
          styles.bottomNav,
          (settingsModalVisible || filterConfigModalVisible) && styles.bottomNavFlat,
        ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Opens the new todo drawer"
            accessibilityLabel="Add todo"
            onPress={() => openCreateDrawer()}
            style={({ pressed }) => [
              styles.bottomNavItem,
              pressed && styles.bottomNavItemPressed,
            ]}
          >
            <Ionicons color={NAV_ACCENT} name="add-circle-outline" size={30} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Filters"
            accessibilityState={{ selected: filterConfigModalVisible }}
            onPress={() => handleNavTabPress('calendar')}
            style={({ pressed }) => [
              styles.bottomNavItem,
              pressed && styles.bottomNavItemPressed,
            ]}
          >
            <Ionicons
              color={filterConfigModalVisible ? NAV_ACCENT : NAV_ICON_INACTIVE}
              name="funnel-outline"
              size={25}
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
              name="options-outline"
              size={25}
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
              size={25}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Shows the todo items list"
            accessibilityLabel="Show items"
            accessibilityState={{
              selected:
                navTab === null
                && !listMenuOpen
                && !settingsModalVisible
                && !filterConfigModalVisible,
            }}
            onPress={showTodoItems}
            style={({ pressed }) => [
              styles.bottomNavItem,
              pressed && styles.bottomNavItemPressed,
            ]}
          >
            <Ionicons
              color={
                navTab === null
                && !listMenuOpen
                && !settingsModalVisible
                && !filterConfigModalVisible
                  ? NAV_ACCENT
                  : NAV_ICON_INACTIVE
              }
              name="home-outline"
              size={25}
            />
          </Pressable>
        </View>


        </KeyboardAvoidingView>

        {listMenuOpen ? (
          <View pointerEvents="box-none" style={styles.listMenuOverlay}>
                <PanGestureHandler
                  key={submenuOpen ? 'submenu-backdrop-back-pan' : 'root-backdrop-close-pan'}
                  activeOffsetY={8}
                  enabled={listMenuOpen}
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
                    enabled={listMenuOpen}
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
                          <GestureFlatList
                            ref={listMenuRef}
                            key={menuMode ?? 'closed'}
                            alwaysBounceVertical={false}
                            bounces={false}
                            contentOffset={{ x: 0, y: listMenuOneHandedOffset }}
                            data={bottomMenuItems}
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
                            onScroll={handleListMenuScroll}
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
                              const displayLabel = item.filterKey === 'date'
                                ? (
                                  dateLabelDisplayMode === 'remaining'
                                    ? formatDateDisplayLabel(item.label, 'remaining')
                                    : formatDateFilterLabel(item.label)
                                )
                                : item.label;

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
                                          colorTheme
                                            ? { backgroundColor: colorTheme.accent }
                                            : styles.listMenuColorDotNoColor,
                                        ]}
                                      />
                                      <Text style={styles.listMenuRowTitle}>{displayLabel}</Text>
                                    </View>
                                  </Pressable>
                                  <View style={styles.listMenuSubmenuZone}>
                                    <Text style={[
                                      styles.filterTypeText,
                                      colorTheme
                                        ? { color: colorTheme.text }
                                        : styles.filterTypeTextNoColor,
                                    ]}>
                                      {item.filterKey}
                                    </Text>
                                    <Pressable
                                      accessibilityRole="button"
                                      accessibilityLabel={`Remove ${displayLabel}`}
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

                            if (item.type === 'metaTagOption') {
                              const isSelected = metaTagVisibility[item.metaTagKey];

                              return (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityState={{ selected: isSelected }}
                                  onPress={() => toggleMetaTagVisibility(item.metaTagKey)}
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
  	                              metaTagVisibility,
  	                              listMenuTree,
  	                              activeListDisplay,
                              includeActiveTodoReminderRows,
  	                              activeMenuPreset,
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

                            const isDateValue = item.filterKey === 'date';
                            const isReminderValue =
                              isDateValue && isReminderPickerMenuLabel(item.label);
                            const isSelected = isDateValue
                              ? isDatePickerMenuItemSelected(
                                item.label,
                                menuSelectionFilters.date,
                                menuSelectionFilters.reminder,
                                isDateMenuItemSelected,
                              )
                              : menuSelectionFilters[item.filterKey].includes(item.label);
                            const displayLabel = isDateValue
                              ? getDatePickerMenuDisplayLabel(
                                item.label,
                                menuFilters.date,
                                menuFilters.reminder,
                                getDateMenuDisplayLabel,
                              )
                              : item.label;
                            const colorLookupValue = isDateValue && !isReminderValue
                              ? getDateMenuColorLookupValue(item.label, menuFilters.date)
                              : item.label;
                            const colorTheme = isReminderValue
                              ? null
                              : getFilterColorTheme(
                                filterColors,
                                item.filterKey,
                                colorLookupValue,
                              );
                            const clearValue = isDateValue && !isReminderValue
                              ? getDateMenuClearValue(item.label, menuFilters.date)
                              : item.label;
                            const clearAccessibilityLabel = item.label === REMINDER_PICKER_LABEL
                              ? 'Clear reminder time'
                              : item.label === REPEAT_PICKER_LABEL
                                ? 'Clear repeating'
                                : `Clear ${displayLabel}`;

                            return (
                              <View style={styles.listMenuSelectableRow}>
                                <Pressable
                                  accessibilityRole="button"
                                  onPress={() => (
                                    item.filterKey === 'date'
                                      ? handleDateMenuLabelPress(item.label)
                                      : toggleFilterValue(item.filterKey, item.label)
                                  )}
                                  style={({ pressed }) => [
                                    styles.listMenuRow,
                                    (isSelected || pressed) && styles.listMenuRowSelected,
                                    colorTheme && (isSelected || pressed) && {
                                      backgroundColor: colorTheme.tint,
                                      borderBottomColor: colorTheme.border,
                                    },
                                  ]}
                                >
                                  <View style={[styles.listMenuRowTextWrap, styles.listMenuRowSelectableContent]}>
                                    <View
                                      style={[
                                        styles.listMenuColorDot,
                                        colorTheme
                                          ? { backgroundColor: colorTheme.accent }
                                          : styles.listMenuColorDotNoColor,
                                      ]}
                                    />
                                    <Text style={styles.listMenuRowTitle}>{displayLabel}</Text>
                                  </View>
                                </Pressable>
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={clearAccessibilityLabel}
                                  disabled={!isSelected}
                                  hitSlop={LIST_MENU_ICON_HIT_SLOP}
                                  onPress={() => {
                                    if (item.label === REMINDER_PICKER_LABEL) {
                                      clearActiveTodoReminderTime();
                                      return;
                                    }

                                    if (item.label === REPEAT_PICKER_LABEL) {
                                      clearActiveTodoRepeat();
                                      return;
                                    }

                                    if (clearValue) {
                                      removeFilter(item.filterKey, clearValue);
                                    }
                                  }}
                                  pointerEvents={isSelected ? 'auto' : 'none'}
                                  style={({ pressed }) => [
                                    styles.listMenuClearButton,
                                    styles.listMenuClearButtonOverlay,
                                    { opacity: isSelected ? 1 : 0 },
                                    pressed && styles.listMenuClearButtonPressed,
                                  ]}
                                >
                                  <Text style={[
                                    styles.listMenuClearButtonText,
                                    colorTheme ? { color: colorTheme.text } : styles.listMenuClearButtonTextNoColor,
                                  ]}>
                                    ×
                                  </Text>
                                </Pressable>
                              </View>
                            );
                          }

                          const isSelected = isListMenuItemSelected(
                            item,
                            menuSelectionFilters.list,
                            listMenuTree,
                          );
                          const listColorTheme = getFilterColorTheme(
                            filterColors,
                            'list',
                            item.isSubsection && item.parentLabel ? item.parentLabel : item.label,
                          );

                          return (
                            <View style={styles.listMenuSelectableRow}>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={
                                  item.isSubsection
                                    ? `${item.label} subsection of ${item.parentLabel}`
                                    : item.label
                                }
                                onPress={() => toggleListMenuItem(item)}
                                style={({ pressed }) => [
                                  styles.listMenuRow,
                                  item.depth > 0 && styles.listMenuRowIndented,
                                  (isSelected || pressed) && styles.listMenuRowSelected,
                                  listColorTheme && (isSelected || pressed) && {
                                    backgroundColor: listColorTheme.tint,
                                    borderBottomColor: listColorTheme.border,
                                  },
                                ]}
                              >
                                <View style={[styles.listMenuRowTextWrap, styles.listMenuRowSelectableContent]}>
                                  {item.isSubsection ? (
                                    <Text style={styles.listMenuSubsectionMarker}>└</Text>
                                  ) : (
                                    <View
                                      style={[
                                        styles.listMenuColorDot,
                                        listColorTheme
                                          ? { backgroundColor: listColorTheme.accent }
                                          : styles.listMenuColorDotNoColor,
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
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Clear ${item.label}`}
                                disabled={!isSelected}
                                hitSlop={LIST_MENU_ICON_HIT_SLOP}
                                onPress={() => removeListMenuItem(item)}
                                pointerEvents={isSelected ? 'auto' : 'none'}
                                style={({ pressed }) => [
                                  styles.listMenuClearButton,
                                  styles.listMenuClearButtonOverlay,
                                  { opacity: isSelected ? 1 : 0 },
                                  pressed && styles.listMenuClearButtonPressed,
                                ]}
                              >
                                <Text style={[
                                  styles.listMenuClearButtonText,
                                  listColorTheme
                                    ? { color: listColorTheme.text }
                                    : styles.listMenuClearButtonTextNoColor,
                                ]}>
                                  ×
                                </Text>
                              </Pressable>
                            </View>
                          );
                        }}
                        showsVerticalScrollIndicator={false}
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
          </View>
        ) : null}

        {activeTodoDetail ? (
          <View
            accessibilityViewIsModal
            style={styles.todoDetailOverlay}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close todo details"
              onPress={closeTodoDetailModal}
              style={styles.todoDetailBackdrop}
            />
            <View
              pointerEvents="box-none"
              style={[
                keyboardOverlayInset > 0
                  ? styles.todoDetailLayerKeyboard
                  : styles.todoDetailLayer,
                keyboardOverlayInset > 0
                  ? { bottom: keyboardOverlayInset }
                  : null,
              ]}
            >
            <View
              style={[styles.todoDetailCard, { maxHeight: todoDetailCardMaxHeight }]}
            >
              <View style={styles.todoDetailHeader}>
                <TextInput
                  autoCapitalize="sentences"
                  autoCorrect
                  multiline
                  onChangeText={setActiveTodoDetailDraftText}
                  onSubmitEditing={() => todoDetailContentInputRef.current?.focus()}
                  placeholder="Task title"
                  placeholderTextColor="#B5ADA5"
                  returnKeyType="next"
                  selectionColor="#2F6F62"
                  scrollEnabled={false}
                  style={styles.todoDetailTitleInput}
                  textAlignVertical="top"
                  value={activeTodoDetailDraftText}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    activeTodoDetailHasChanges ? 'Save todo changes' : 'Close todo details'
                  }
                  accessibilityState={{
                    disabled: activeTodoDetailHasChanges && !activeTodoDetailCanSave,
                  }}
                  disabled={activeTodoDetailHasChanges && !activeTodoDetailCanSave}
                  hitSlop={8}
                  onPress={activeTodoDetailHasChanges ? saveActiveTodoDetail : closeTodoDetailModal}
                  style={({ pressed }) => [
                    styles.todoDetailCloseButton,
                    activeTodoDetailHasChanges && styles.todoDetailSaveButton,
                    activeTodoDetailHasChanges &&
                      !activeTodoDetailCanSave &&
                      styles.todoDetailSaveButtonDisabled,
                    pressed && styles.todoDetailCloseButtonPressed,
                  ]}
                >
                  <Ionicons
                    color={
                      activeTodoDetailHasChanges
                        ? activeTodoDetailCanSave
                          ? THEME_ACCENT
                          : '#AFA8A0'
                        : '#2A2520'
                    }
                    name={activeTodoDetailHasChanges ? 'checkmark' : 'close'}
                    size={21}
                  />
                </Pressable>
              </View>
              <View style={styles.todoDetailContentContainer}>
                <TextInput
                  ref={todoDetailContentInputRef}
                  autoCapitalize="sentences"
                  autoCorrect
                  multiline
                  onChangeText={setActiveTodoDetailDraftContent}
                  placeholder="Content"
                  placeholderTextColor="#B5ADA5"
                  selectionColor="#2F6F62"
                  scrollEnabled
                  style={[
                    styles.todoDetailContentInput,
                    { maxHeight: todoDetailContentInputMaxHeight },
                  ]}
                  textAlignVertical="top"
                  value={activeTodoDetailDraftContent}
                />
              </View>
            </View>
            </View>
          </View>
        ) : null}

        <Modal
          animationType="fade"
          onRequestClose={closeDeletedTodoDetailModal}
          statusBarTranslucent={Platform.OS === 'android'}
          transparent
          visible={activeDeletedTodoDetail !== null}
        >
          <View style={styles.todoDetailModalRoot}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close deleted item details"
              onPress={closeDeletedTodoDetailModal}
              style={styles.todoDetailBackdrop}
            />
            {activeDeletedTodoDetail ? (
              <View
                accessibilityViewIsModal
                style={[styles.todoDetailCard, { maxHeight: todoDetailCardMaxHeight }]}
              >
                <View style={styles.deletedTodoDetailHeader}>
                  <View style={styles.deletedTodoDetailHeaderText}>
                    <Text style={styles.deletedTodoDetailEyebrow}>Deleted item</Text>
                    <Text style={styles.deletedTodoDetailTitle}>
                      {activeDeletedTodoDetail.text}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close deleted item details"
                    hitSlop={8}
                    onPress={closeDeletedTodoDetailModal}
                    style={({ pressed }) => [
                      styles.todoDetailCloseButton,
                      pressed && styles.todoDetailCloseButtonPressed,
                    ]}
                  >
                    <Ionicons color="#2A2520" name="close" size={21} />
                  </Pressable>
                </View>
                <ScrollView
                  contentContainerStyle={styles.deletedTodoDetailContentContainer}
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.deletedTodoDetailContentText}>
                    {activeDeletedTodoDetail.content.trim() || 'No content'}
                  </Text>
                  <Text style={styles.deletedTodoDetailMeta}>
                    Deleted {formatDeletedTodoTime(activeDeletedTodoDetail.deletedAt)}
                  </Text>
                </ScrollView>
                <View style={styles.deletedTodoDetailActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Restore ${activeDeletedTodoDetail.text}`}
                    onPress={() => restoreDeletedTodo(activeDeletedTodoDetail.id)}
                    style={({ pressed }) => [
                      styles.deletedTodoDetailRestoreButton,
                      pressed && styles.settingsSecondaryButtonPressed,
                    ]}
                  >
                    <Text style={styles.deletedTodoDetailRestoreButtonText}>Restore</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${activeDeletedTodoDetail.text}`}
                    onPress={() => deleteDeletedTodoPermanently(activeDeletedTodoDetail.id)}
                    style={({ pressed }) => [
                      styles.deletedTodoDetailDeleteButton,
                      pressed && styles.settingsSecondaryButtonPressed,
                    ]}
                  >
                    <Text style={styles.deletedTodoDetailDeleteButtonText}>
                      Delete
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </Modal>

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
              style={[
                styles.createDrawerLayer,
                { bottom: keyboardOverlayInset },
                createDrawerListPickerHalfSheet
                  ? { height: createDrawerListPickerSheetHeight }
                  : null,
              ]}
            >
              <View
                style={[
                  styles.createDrawer,
                  createDrawerListPickerHalfSheet && styles.createDrawerListPickerSheet,
                ]}
              >
                <View style={styles.menuDragHandle} accessibilityRole="adjustable">
                  <View style={styles.menuDragPill} />
                </View>
                {createDrawerPicker ? (
                  <ScrollView
                    contentContainerStyle={
                      createDrawerListPickerHalfSheet
                        ? [
                          styles.createDrawerListPickerContent,
                          { paddingTop: createDrawerListPickerTopSpace },
                        ]
                        : undefined
                    }
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    style={[
                      styles.createDrawerPicker,
                      { maxHeight: createDrawerPickerMaxHeight },
                      createDrawerListPickerHalfSheet && styles.createDrawerListPickerScroll,
                    ]}
                  >
                    {createDrawerPickerItems.map((label) => {
                      const selected =
                        createDrawerPicker === 'priority'
                          ? (
                            label === 'None'
                              ? createDraftFilters.priority.length === 0
                              : createDraftFilters.priority[0] === label
                          )
                          : createDrawerPicker === 'date'
                            ? isDatePickerMenuItemSelected(
                              label,
                              createDraftFilters.date,
                              createDraftFilters.reminder,
                              isDateMenuItemSelected,
                            )
                            : createDraftFilters[createDrawerPicker][0] === label;
                      const displayLabel = createDrawerPicker === 'date'
                        ? getDatePickerMenuDisplayLabel(
                          label,
                          createDraftFilters.date,
                          createDraftFilters.reminder,
                          getDateMenuDisplayLabel,
                        )
                        : label;
                      const showCustomDateClear = (
                        label === CUSTOM_DATE_LABEL &&
                        getSelectedCustomDateLabel(createDraftFilters.date) !== null
                      );
                      const showReminderClear = (
                        label === REMINDER_PICKER_LABEL &&
                        hasTodoReminderTime(createDraftFilters.reminder)
                      );
                      const showRepeatClear = (
                        label === REPEAT_PICKER_LABEL &&
                        hasTodoRepeat(createDraftFilters.reminder)
                      );
                      const showRowClear = showCustomDateClear || showReminderClear || showRepeatClear;
                      const useSplitDatePickerRow = (
                        createDrawerPicker === 'date' &&
                        (isReminderPickerMenuLabel(label) || showCustomDateClear)
                      );

                      if (useSplitDatePickerRow) {
                        return (
                          <View
                            key={`${createDrawerPicker}-${label}`}
                            style={[
                              styles.createDrawerPickerRow,
                              selected && styles.createDrawerPickerRowSelected,
                            ]}
                          >
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                              onPress={() => handleCreateDrawerDatePress(label)}
                              style={({ pressed }) => [
                                styles.createDrawerPickerRowMain,
                                pressed && styles.createDrawerPickerRowPressed,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.createDrawerPickerRowText,
                                  selected && styles.createDrawerPickerRowTextSelected,
                                ]}
                              >
                                {displayLabel}
                              </Text>
                            </Pressable>
                            {showRowClear ? (
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={
                                  label === CUSTOM_DATE_LABEL
                                    ? 'Clear date'
                                    : label === REMINDER_PICKER_LABEL
                                      ? 'Clear reminder time'
                                      : 'Clear repeating'
                                }
                                hitSlop={8}
                                onPress={() => {
                                  if (label === CUSTOM_DATE_LABEL) {
                                    clearCreateDraftDate();
                                    return;
                                  }

                                  if (label === REMINDER_PICKER_LABEL) {
                                    clearCreateReminderTime();
                                    return;
                                  }

                                  clearCreateRepeat();
                                }}
                                style={({ pressed }) => [
                                  styles.createDrawerPickerClearButton,
                                  pressed && styles.createDrawerPickerRowPressed,
                                ]}
                              >
                                <Ionicons color="#8C847C" name="close-circle" size={22} />
                              </Pressable>
                            ) : null}
                          </View>
                        );
                      }

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
                            {displayLabel}
                          </Text>
                          {selected ? (
                            <Ionicons color={THEME_ACCENT} name="checkmark" size={18} />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <View style={styles.createDrawerEditor}>
                    <TextInput
                      ref={createInputRef}
                      autoCapitalize="sentences"
                      autoCorrect
                      blurOnSubmit={false}
                      onChangeText={setCreateDraftText}
                      onSubmitEditing={() => createContentInputRef.current?.focus()}
                      placeholder="Task title"
                      placeholderTextColor="#B5ADA5"
                      returnKeyType="next"
                      selectionColor="#2F6F62"
                      style={styles.createDrawerTitleInput}
                      value={createDraftText}
                    />
                    <TextInput
                      ref={createContentInputRef}
                      autoCapitalize="sentences"
                      autoCorrect
                      multiline
                      onChangeText={setCreateDraftContent}
                      placeholder="Content"
                      placeholderTextColor="#B5ADA5"
                      selectionColor="#2F6F62"
                      scrollEnabled
                      style={styles.createDrawerContentInput}
                      textAlignVertical="top"
                      value={createDraftContent}
                    />
                  </View>
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
                      color={createDrawerDateActive ? '#2F6F62' : '#8C847C'}
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
                        : 'Create todo'
                    }
                    accessibilityState={{
                      disabled: !createDrawerPicker && !createDrawerCanSubmit,
                    }}
                    disabled={!createDrawerPicker && !createDrawerCanSubmit}
                    hitSlop={8}
                    onPress={handleCreateDrawerTrailingPress}
                    style={({ pressed }) => [
                      styles.createDrawerToolbarButton,
                      pressed && styles.createDrawerToolbarButtonPressed,
                    ]}
                  >
                    <Ionicons
                      color={
                        createDrawerPicker
                          ? '#8C847C'
                          : createDrawerCanSubmit
                            ? THEME_ACCENT
                            : '#C8C0B8'
                      }
                      name={createDrawerPicker ? 'arrow-back' : 'checkmark'}
                      size={24}
                    />
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </Modal>

        <SimpleCalendarModal
          onClear={clearPickedDate}
          onClose={closeDatePicker}
          onSelectDate={applyPickedDate}
          value={datePickerValue}
          visible={datePickerVisible}
        />

        <ReminderTimeModal
          ref={reminderTimeModalRef}
          onConfirm={confirmReminderTime}
        />

        <RepeatReminderModal
          onClose={closeCreateRepeatModal}
          onConfirm={confirmCreateRepeat}
          value={repeatDraft}
          visible={repeatReminderModalVisible}
        />

        <FilterConfigScreen
          dateLabelDisplayMode={dateLabelDisplayMode}
          filterColors={filterColors}
          filters={selectedFilters}
          isListItemSelected={(item) => (
            isListMenuItemSelected(item, selectedFilters.list, listMenuTree)
          )}
          listMenuItems={filterConfigListItems}
          metaTagVisibility={metaTagVisibility}
          groupMode={effectiveGroupMode}
          onClearFilters={clearFilters}
          onClearSection={clearMenuSection}
          onClose={closeFilterConfigModal}
          onDateMenuPress={handleDateMenuLabelPress}
          onRemoveFilter={removeFilter}
          onRemoveListItem={removeListMenuItem}
          onSelectGroup={selectTodoGroupMode}
          onSelectSort={selectTodoSortMode}
          onShowResults={showTodoItems}
          onToggleFilter={toggleFilterValue}
          onToggleListItem={toggleListMenuItem}
          onToggleDateLabelDisplayMode={toggleDateLabelDisplayMode}
          onToggleMetaTag={toggleMetaTagVisibility}
          resultCount={filteredTodos.length}
          sortMode={effectiveSortMode}
          visible={filterConfigModalVisible}
        />

        {settingsModalVisible ? (
          <View style={styles.settingsOverlay}>
            <View style={styles.settingsModal}>
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
                <View style={styles.settingsSectionHeader}>
                  <View style={styles.settingsRowTextWrap}>
                    <Text style={styles.settingsSectionTitle}>Date labels</Text>
                    <Text style={styles.settingsSectionSubtitle}>
                      {dateLabelDisplayMode === 'remaining' ? 'Days remaining' : 'Exact day'}
                    </Text>
                  </View>
                </View>

                <View style={styles.settingsCard}>
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityState={{ checked: dateLabelDisplayMode === 'remaining' }}
                    onPress={toggleDateLabelDisplayMode}
                    style={({ pressed }) => [
                      styles.settingsRow,
                      pressed && styles.settingsOptionRowPressed,
                    ]}
                  >
                    <View style={styles.settingsRowTextWrap}>
                      <Text style={styles.settingsRowTitle}>Show days remaining</Text>
                      <Text style={styles.settingsRowSubtitle}>
                        0 days, 1 day, 3 days… instead of Today, Tomorrow, Jun 5.
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.settingsStatusPill,
                        dateLabelDisplayMode === 'remaining' && styles.settingsStatusPillEnabled,
                      ]}
                    >
                      <Text
                        style={[
                          styles.settingsStatusText,
                          dateLabelDisplayMode === 'remaining' && styles.settingsStatusTextEnabled,
                        ]}
                      >
                        {dateLabelDisplayMode === 'remaining' ? 'Remaining' : 'Exact'}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              </View>

              <View style={styles.settingsSection}>
                <View style={styles.settingsSectionHeader}>
                  <View style={styles.settingsRowTextWrap}>
                    <Text style={styles.settingsSectionTitle}>Backup</Text>
                    <Text style={styles.settingsSectionSubtitle}>
                      Google Drive · {googleConnected ? 'Connected' : 'Not signed in'}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`${settingsBackupExpanded ? 'Collapse' : 'Expand'} Backup section`}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: settingsBackupExpanded }}
                    hitSlop={SETTINGS_SECTION_TOGGLE_HIT_SLOP}
                    onPress={() => setSettingsBackupExpanded((current) => !current)}
                    style={({ pressed }) => [
                      styles.settingsSectionChevronButton,
                      pressed && styles.settingsSectionChevronButtonPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.settingsSectionChevron,
                        settingsBackupExpanded && styles.settingsSectionChevronExpanded,
                      ]}
                    >
                      ›
                    </Text>
                  </Pressable>
                </View>

                {settingsBackupExpanded ? (
                  <View style={styles.settingsCard}>
                    <View style={styles.settingsRow}>
                      <View style={styles.settingsRowTextWrap}>
                        <Text style={styles.settingsRowTitle}>Backup all data</Text>
                        <Text style={styles.settingsRowSubtitle}>
                          {activeTodoCount} items · {selectedFilters.list.length + selectedFilters.priority.length + selectedFilters.date.length} filters
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
                <View style={styles.settingsSectionHeader}>
                  <View style={styles.settingsRowTextWrap}>
                    <Text style={styles.settingsSectionTitle}>Done items</Text>
                    <Text style={styles.settingsSectionSubtitle}>
                      {hideDoneTodos ? 'Hidden from lists' : 'Visible in lists'}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`${settingsDoneExpanded ? 'Collapse' : 'Expand'} Done items section`}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: settingsDoneExpanded }}
                    hitSlop={SETTINGS_SECTION_TOGGLE_HIT_SLOP}
                    onPress={() => setSettingsDoneExpanded((current) => !current)}
                    style={({ pressed }) => [
                      styles.settingsSectionChevronButton,
                      pressed && styles.settingsSectionChevronButtonPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.settingsSectionChevron,
                        settingsDoneExpanded && styles.settingsSectionChevronExpanded,
                      ]}
                    >
                      ›
                    </Text>
                  </Pressable>
                </View>

                {settingsDoneExpanded ? (
                  <View style={styles.settingsCard}>
                    <Pressable
                      accessibilityRole="switch"
                      accessibilityState={{ checked: hideDoneTodos }}
                      onPress={toggleHideDoneTodos}
                      style={({ pressed }) => [
                        styles.settingsRow,
                        pressed && styles.settingsOptionRowPressed,
                      ]}
                    >
                      <View style={styles.settingsRowTextWrap}>
                        <Text style={styles.settingsRowTitle}>Hide done items</Text>
                        <Text style={styles.settingsRowSubtitle}>Done todos stay saved.</Text>
                      </View>
                      <View
                        style={[
                          styles.settingsStatusPill,
                          hideDoneTodos && styles.settingsStatusPillEnabled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.settingsStatusText,
                            hideDoneTodos && styles.settingsStatusTextEnabled,
                          ]}
                        >
                          {hideDoneTodos ? 'Hidden' : 'Visible'}
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                ) : null}
              </View>

              <View style={styles.settingsSection}>
                <View style={styles.settingsSectionHeader}>
                  <View style={styles.settingsRowTextWrap}>
                    <Text style={styles.settingsSectionTitle}>Deleted items</Text>
                    <Text style={styles.settingsSectionSubtitle}>
                      {deletedTodos.length} {deletedTodos.length === 1 ? 'item' : 'items'}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`${settingsDeletedExpanded ? 'Collapse' : 'Expand'} Deleted items section`}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: settingsDeletedExpanded }}
                    hitSlop={SETTINGS_SECTION_TOGGLE_HIT_SLOP}
                    onPress={() => setSettingsDeletedExpanded((current) => !current)}
                    style={({ pressed }) => [
                      styles.settingsSectionChevronButton,
                      pressed && styles.settingsSectionChevronButtonPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.settingsSectionChevron,
                        settingsDeletedExpanded && styles.settingsSectionChevronExpanded,
                      ]}
                    >
                      ›
                    </Text>
                  </Pressable>
                </View>

                {settingsDeletedExpanded ? (
                  <View style={styles.settingsCard}>
                    {deletedTodos.length === 0 ? (
                      <Text style={styles.settingsEmptyText}>No deleted items</Text>
                    ) : (
                      <View style={styles.settingsDeletedList}>
                        {deletedTodos.map((todo) => {
                          const contentPreview = todo.content.trim().replace(/\s+/g, ' ');

                          return (
                            <Pressable
                              key={todo.id}
                              accessibilityHint="Shows title and content before restore or permanent delete"
                              accessibilityLabel={`Open deleted item ${todo.text}`}
                              accessibilityRole="button"
                              onPress={() => openDeletedTodoDetailModal(todo.id)}
                              style={({ pressed }) => [
                                styles.settingsDeletedTodoRow,
                                pressed && styles.settingsDeletedTodoRowPressed,
                              ]}
                            >
                              <View style={styles.settingsDeletedTodoTextWrap}>
                                <Text
                                  numberOfLines={1}
                                  style={styles.settingsDeletedTodoTitle}
                                >
                                  {todo.text}
                                </Text>
                                {contentPreview ? (
                                  <Text
                                    numberOfLines={1}
                                    style={styles.settingsDeletedTodoContent}
                                  >
                                    {contentPreview}
                                  </Text>
                                ) : null}
                                <Text
                                  numberOfLines={1}
                                  style={styles.settingsDeletedTodoMeta}
                                >
                                  Deleted {formatDeletedTodoTime(todo.deletedAt)}
                                </Text>
                              </View>
                              <View style={styles.settingsDeletedTodoOpenButton}>
                                <Ionicons color="#8F877F" name="chevron-forward" size={18} />
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </View>
                ) : null}
              </View>

              <View style={styles.settingsSection}>
                <View style={styles.settingsSectionHeader}>
                  <View style={styles.settingsRowTextWrap}>
                    <Text style={styles.settingsSectionTitle}>Lists</Text>
                    <Text style={styles.settingsSectionSubtitle}>
                      {listMenuTree.length} items · {listOrderMode === 'alphabetical' ? 'Alphabetical' : 'Manual order'}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`${settingsListsExpanded ? 'Collapse' : 'Expand'} Lists section`}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: settingsListsExpanded }}
                    hitSlop={SETTINGS_SECTION_TOGGLE_HIT_SLOP}
                    onPress={() => setSettingsListsExpanded((current) => !current)}
                    style={({ pressed }) => [
                      styles.settingsSectionChevronButton,
                      pressed && styles.settingsSectionChevronButtonPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.settingsSectionChevron,
                        settingsListsExpanded && styles.settingsSectionChevronExpanded,
                      ]}
                    >
                      ›
                    </Text>
                  </Pressable>
                </View>

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
                <View style={styles.settingsSectionHeader}>
                  <View style={styles.settingsRowTextWrap}>
                    <Text style={styles.settingsSectionTitle}>Colors</Text>
                    <Text style={styles.settingsSectionSubtitle}>
                      {settingsColorItemCount} items · Priority, dates, lists
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`${settingsColorsExpanded ? 'Collapse' : 'Expand'} Colors section`}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: settingsColorsExpanded }}
                    hitSlop={SETTINGS_SECTION_TOGGLE_HIT_SLOP}
                    onPress={() => setSettingsColorsExpanded((current) => !current)}
                    style={({ pressed }) => [
                      styles.settingsSectionChevronButton,
                      pressed && styles.settingsSectionChevronButtonPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.settingsSectionChevron,
                        settingsColorsExpanded && styles.settingsSectionChevronExpanded,
                      ]}
                    >
                      ›
                    </Text>
                  </Pressable>
                </View>

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
                          const noColorSelected = colorTheme === null;

                          return (
                            <View key={`${group.filterKey}-${value}`} style={styles.settingsColorRow}>
                              <View style={styles.settingsColorLabelWrap}>
                                <View
                                  style={[
                                    styles.settingsColorPreviewDot,
                                    colorTheme
                                      ? { backgroundColor: colorTheme.accent }
                                      : styles.settingsColorPreviewDotNoColor,
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
                                  const selected = swatch.isNoColor === true
                                    ? noColorSelected
                                    : Boolean(
                                      colorTheme
                                        && swatch.accent
                                        && swatch.accent.toUpperCase() === colorTheme.accent.toUpperCase(),
                                    );

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
                                          borderColor: swatch.accent ?? '#8F877F',
                                        },
                                        pressed && styles.settingsOptionRowPressed,
                                      ]}
                                    >
                                      {swatch.isNoColor ? (
                                        <View style={[
                                          styles.settingsColorSwatch,
                                          styles.settingsColorSwatchNoColor,
                                        ]}>
                                          <Ionicons color="#8F877F" name="remove" size={16} />
                                        </View>
                                      ) : (
                                        <View
                                          style={[
                                            styles.settingsColorSwatch,
                                            { backgroundColor: swatch.accent ?? 'transparent' },
                                          ]}
                                        />
                                      )}
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
            </View>
          </View>
        ) : null}
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
    position: 'relative',
  },
  listMenuOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: LIST_MENU_OVERLAY_BOTTOM,
    zIndex: 18,
    elevation: 7,
  },
  mainKeyboardAvoiding: {
    flex: 1,
    minHeight: 0,
  },
  settingsOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: LIST_MENU_OVERLAY_BOTTOM,
    zIndex: 19,
    backgroundColor: THEME_BG,
  },
  settingsModal: {
    flex: 1,
    backgroundColor: THEME_BG,
  },
  todoDetailModalRoot: {
    flex: 1,
  },
  todoDetailOverlay: {
    bottom: 0,
    elevation: 10,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 21,
  },
  todoDetailLayer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: TOP_SAFE_GAP + 24,
  },
  todoDetailLayerKeyboard: {
    left: 0,
    paddingBottom: 24,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: TOP_SAFE_GAP + 24,
    position: 'absolute',
    right: 0,
  },
  todoDetailBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30, 27, 24, 0.42)',
  },
  todoDetailCard: {
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderColor: '#E4DDD4',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 10,
  },
  todoDetailHeader: {
    alignItems: 'flex-start',
    borderBottomColor: '#F0E9E1',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 14,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  todoDetailTitleInput: {
    color: THEME_TEXT,
    flex: 1,
    fontSize: 21,
    fontWeight: FONT_SEMIBOLD,
    letterSpacing: 0,
    lineHeight: 27,
    maxHeight: 88,
    minHeight: 34,
    minWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  todoDetailCloseButton: {
    alignItems: 'center',
    backgroundColor: THEME_BG,
    borderColor: '#E8E2DA',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    marginTop: -2,
    width: 34,
  },
  todoDetailCloseButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
  todoDetailSaveButton: {
    backgroundColor: THEME_ACCENT_SOFT,
    borderColor: '#D6E0FF',
  },
  todoDetailSaveButtonDisabled: {
    backgroundColor: '#F2EFEA',
    borderColor: '#E8E2DA',
  },
  todoDetailContentContainer: {
    paddingBottom: 20,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  todoDetailContentInput: {
    color: '#3A332E',
    fontSize: 17,
    fontWeight: FONT_REGULAR,
    letterSpacing: 0,
    lineHeight: 25,
    minHeight: 165,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  deletedTodoDetailHeader: {
    alignItems: 'flex-start',
    borderBottomColor: '#F0E9E1',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 14,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  deletedTodoDetailHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  deletedTodoDetailEyebrow: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: FONT_MEDIUM,
    letterSpacing: 0,
    lineHeight: 16,
    marginBottom: 4,
  },
  deletedTodoDetailTitle: {
    color: THEME_TEXT,
    fontSize: 21,
    fontWeight: FONT_SEMIBOLD,
    letterSpacing: 0,
    lineHeight: 27,
  },
  deletedTodoDetailContentContainer: {
    paddingBottom: 18,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  deletedTodoDetailContentText: {
    color: '#3A332E',
    fontSize: 17,
    fontWeight: FONT_REGULAR,
    letterSpacing: 0,
    lineHeight: 25,
    minHeight: 96,
  },
  deletedTodoDetailMeta: {
    borderTopColor: '#F0E9E1',
    borderTopWidth: StyleSheet.hairlineWidth,
    color: THEME_TEXT_SECONDARY,
    fontSize: 13,
    fontWeight: FONT_REGULAR,
    letterSpacing: 0,
    lineHeight: 18,
    marginTop: 18,
    paddingTop: 12,
  },
  deletedTodoDetailActions: {
    borderTopColor: '#F0E9E1',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    padding: 14,
  },
  deletedTodoDetailRestoreButton: {
    alignItems: 'center',
    backgroundColor: THEME_ACCENT_SOFT,
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 0,
    paddingHorizontal: 12,
  },
  deletedTodoDetailRestoreButtonText: {
    color: THEME_ACCENT,
    fontSize: 15,
    fontWeight: FONT_MEDIUM,
    letterSpacing: 0,
    lineHeight: 20,
    textAlign: 'center',
  },
  deletedTodoDetailDeleteButton: {
    alignItems: 'center',
    backgroundColor: '#F8EDEA',
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 0,
    paddingHorizontal: 12,
  },
  deletedTodoDetailDeleteButtonText: {
    color: '#8F4D46',
    fontSize: 15,
    fontWeight: FONT_MEDIUM,
    letterSpacing: 0,
    lineHeight: 20,
    textAlign: 'center',
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
  settingsSectionChevronButton: {
    alignItems: 'center',
    borderRadius: 21,
    height: 42,
    justifyContent: 'center',
    marginLeft: 12,
    marginRight: 2,
    width: 42,
  },
  settingsSectionChevronButtonPressed: {
    backgroundColor: '#F6EFE8',
    opacity: 0.76,
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
    borderWidth: 1,
    borderColor: '#E4DED6',
    padding: 14,
    overflow: 'hidden',
  },
  settingsEmptyText: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 14,
    fontWeight: FONT_REGULAR,
    lineHeight: 19,
    letterSpacing: 0.1,
  },
  settingsDeletedList: {
    borderTopColor: '#F2EBE3',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  settingsDeletedTodoRow: {
    alignItems: 'center',
    borderBottomColor: '#F2EBE3',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 66,
    paddingVertical: 10,
  },
  settingsDeletedTodoRowPressed: {
    backgroundColor: '#FAF6F0',
  },
  settingsDeletedTodoTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  settingsDeletedTodoOpenButton: {
    alignItems: 'center',
    flexShrink: 0,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  settingsDeletedTodoTitle: {
    color: THEME_TEXT,
    fontSize: 15,
    fontWeight: FONT_MEDIUM,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  settingsDeletedTodoContent: {
    color: '#5F5B57',
    fontSize: 13,
    fontWeight: FONT_REGULAR,
    lineHeight: 18,
    marginTop: 2,
  },
  settingsDeletedTodoMeta: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: FONT_REGULAR,
    lineHeight: 16,
    marginTop: 3,
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
  settingsColorPreviewDotNoColor: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#A79F96',
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
  settingsColorSwatchNoColor: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DAD3CB',
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
    position: 'relative',
  },
  appHeaderTitle: {
    color: THEME_TEXT,
    fontSize: 20,
    fontWeight: FONT_SEMIBOLD,
    lineHeight: 26,
    letterSpacing: -0.2,
    paddingHorizontal: 48,
    textAlign: 'center',
    width: '100%',
  },
  appHeaderSideButton: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    top: Platform.OS === 'android' ? TOP_SAFE_GAP - 4 : 4,
    width: 36,
  },
  appHeaderSideButtonLeft: {
    left: HORIZONTAL_PADDING,
  },
  appHeaderSideButtonRight: {
    right: HORIZONTAL_PADDING,
  },
  appHeaderSideButtonPressed: {
    opacity: 0.72,
  },
  appHeaderSelectActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    position: 'absolute',
    right: HORIZONTAL_PADDING - 4,
    top: Platform.OS === 'android' ? TOP_SAFE_GAP - 4 : 4,
  },
  appHeaderSettingsButtonActive: {
    backgroundColor: THEME_ACCENT_SOFT,
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
    alignItems: 'stretch',
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E5E5EA',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    height: BOTTOM_NAV_HEIGHT,
    justifyContent: 'space-around',
    paddingBottom: 0,
    paddingTop: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  bottomNavFlat: {
    borderTopColor: 'transparent',
    borderTopWidth: 0,
    elevation: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  bottomNavItem: {
    alignItems: 'center',
    flex: 1,
    height: '100%',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  bottomNavItemPressed: {
    opacity: 0.72,
  },
  searchBox: {
    height: 48,
    borderRadius: CONTROL_BORDER_RADIUS,
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
    flex: 1,
    backgroundColor: 'rgba(34, 28, 24, 0.14)',
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
    paddingBottom: Platform.OS === 'android' ? 24 : 22,
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 10,
  },
  createDrawerListPickerSheet: {
    flex: 1,
    minHeight: 0,
  },
  createDrawerEditor: {
    marginTop: 4,
  },
  createDrawerTitleInput: {
    color: THEME_TEXT,
    fontSize: 22,
    fontWeight: FONT_SEMIBOLD,
    lineHeight: 29,
    minHeight: 44,
    paddingHorizontal: 0,
    paddingVertical: 5,
  },
  createDrawerContentInput: {
    color: '#3A332E',
    fontSize: 18,
    fontWeight: FONT_REGULAR,
    lineHeight: 26,
    maxHeight: 172,
    minHeight: 118,
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: 6,
  },
  createDrawerPicker: {
    marginTop: 4,
  },
  createDrawerListPickerScroll: {
    flex: 1,
    minHeight: 0,
  },
  createDrawerListPickerContent: {
    paddingBottom: 4,
  },
  createDrawerPickerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  createDrawerPickerRowMain: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingRight: 4,
  },
  createDrawerPickerClearButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
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
    elevation: 8,
  },
  listMenu: {
    borderRadius: CARD_BORDER_RADIUS,
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
  listMenuSelectableRow: {
    position: 'relative',
    height: LIST_MENU_ROW_HEIGHT,
  },
  listMenuRowSelectableContent: {
    flex: 1,
    minWidth: 0,
    paddingRight: 42,
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
  filterTypeTextNoColor: {
    color: '#8F877F',
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
  listMenuColorDotNoColor: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#A79F96',
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
  listMenuClearButtonOverlay: {
    position: 'absolute',
    right: 16,
    top: (LIST_MENU_ROW_HEIGHT - 34) / 2,
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
  listMenuClearButtonTextNoColor: {
    color: '#8F877F',
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
  listContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 100,
    paddingTop: TODO_LIST_CONTENT_TOP_PADDING,
  },
  todoListRowGap: {
    height: TODO_LIST_ROW_GAP,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  todoSectionCardShadow: {
    alignSelf: 'stretch',
    backgroundColor: THEME_CARD,
    borderRadius: CARD_BORDER_RADIUS,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
    width: '100%',
  },
  todoSectionCardShadowExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    elevation: 0,
    shadowOpacity: 0,
  },
  todoSectionCard: {
    backgroundColor: THEME_CARD,
    borderRadius: CARD_BORDER_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME_BORDER,
    overflow: 'hidden',
    width: '100%',
  },
  todoSectionCardExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  todoSectionGroupedShell: {
    backgroundColor: THEME_CARD,
    borderColor: THEME_BORDER,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: 16,
  },
  todoSectionGroupedShellLast: {
    borderBottomColor: THEME_BORDER,
    borderBottomLeftRadius: CARD_BORDER_RADIUS,
    borderBottomRightRadius: CARD_BORDER_RADIUS,
    borderBottomWidth: 1,
    elevation: 0,
    overflow: 'hidden',
    paddingBottom: 12,
    shadowOpacity: 0,
  },
  todoSectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: '100%',
  },
  todoGroupHeaderPressed: {
    opacity: 0.72,
  },
  todoSectionHeaderMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 8,
  },
  todoSectionTitle: {
    color: THEME_TEXT,
    flex: 1,
    fontSize: 18,
    fontWeight: FONT_SEMIBOLD,
    lineHeight: 22,
    marginRight: 12,
    minWidth: 0,
  },
  todoGroupCount: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 14,
    fontWeight: FONT_REGULAR,
    lineHeight: 18,
    minWidth: 16,
    textAlign: 'right',
  },
  todoRowDivider: {
    backgroundColor: THEME_BORDER,
    height: TODO_ROW_DIVIDER_HEIGHT,
    marginLeft: 38,
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
});
