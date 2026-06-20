import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { makeRedirectUri, TokenResponse } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  AppState,
  type AppStateStatus,
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
  ScrollView as GestureScrollView,
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
import { QuickPresetNav } from './src/components/QuickPresetNav';
import { SimpleCalendarModal } from './src/components/SimpleCalendarModal';
import { TodoRow } from './src/components/TodoRow';

import {
  CUSTOM_DATE_LABEL,
  DATED_DATE_LABEL,
  formatDateDisplayLabel,
  formatDateFilterLabel,
  formatDateFilterValue,
  formatRemainingDaysLabel,
  getDateMenuClearValue,
  getDateMenuColorLookupValue,
  getDateMenuItemsForDateLabels,
  getDateMenuItemDisplayLabel,
  getInitialDatePickerValue,
  getSelectedCustomDateLabel,
  isCustomDateLabel,
  isDateFilterOverdue,
  isDateMenuItemSelected,
  OVERDUE_DATE_LABEL,
  resolveDateFilterValueDate,
  startOfDay,
  toISODateString,
  todoMatchesSelectedDateFilters,
  type DateLabelDisplayMode,
} from './src/dates';
import { localTodoStore } from './src/storage/todoStore';
import {
  cloneDeletedTodos,
  cloneTodo,
  cloneTodoFilters,
  getTodoTextMaxLength,
  makeTodo,
  normalizeTodoContent,
  normalizeTodoFilters,
  pruneTodoFilters,
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
  deleteDriveBackupFile,
  downloadDriveBackup,
  DRIVE_BACKUP_SLOT_LIMIT,
  GOOGLE_AUTH_SCOPES,
  listDriveBackupSlots,
  uploadDriveBackup,
  type DriveBackupSlot,
  type DriveBackupScope,
} from './src/google/driveBackup';
import {
  googleAuthStore,
  type StoredGoogleAuth,
} from './src/google/googleAuthStore';
import { isDevAppVariant } from './src/appVariant';
import {
  countDevTestListMenuNodes,
  createDevTestTodos,
  DEV_TEST_MENU_PRESET_COUNT,
  DEV_TEST_TODO_COUNT,
  isDevTestMenuPreset,
  isDevTestTodo,
  mergeDevTestListMenuTree,
  mergeDevTestMenuPresets,
  removeDevTestListMenuNodes,
} from './src/dev/seedTestTodos';
import {
  cloneFilterColors,
  FILTER_COLOR_SWATCHES,
  getFilterColor,
  getFilterColorTheme,
  type FilterColorSettingKey,
  type FilterColorSettings,
} from './src/filterColors';
import {
  cloneMetaTagVisibility,
  DEFAULT_META_TAG_VISIBILITY,
  formatMetaTagVisibilitySummary,
  META_TAG_KEYS,
  META_TAG_LABELS,
  metaTagVisibilityEqual,
  metaTagVisibilityMatchesDefault,
  type HiddenMetaTagKind,
  type MetaTagKey,
  type MetaTagVisibility,
} from './src/metaTags';
import { resolveMaterialCommunityIconName } from './src/materialCommunityIconNames';
import { triggerSubtleHaptic } from './src/haptics';
import {
  appSettingsStore,
  clearListNodeDisplaySettings,
  cloneFilterConfigUiState,
  cloneListMenuTree,
  cloneMenuPresets,
  cloneQuickPresetNavIconNames,
  cloneQuickPresetNavPresetIds,
  collectListNodeLabels,
  DEFAULT_QUICK_PRESET_NAV_ICON_NAMES,
  DEFAULT_FILTER_CONFIG_UI_STATE,
  DEFAULT_LIST_MENU_TREE,
  findListMenuNode,
  QUICK_PRESET_DEFAULTS_VERSION,
  resolveListDisplaySettings,
  todoMatchesSelectedListFilters,
  updateListNodeDisplaySettings,
  type AppSettings,
  type FilterConfigUiState,
  type ListOrderMode,
  type StoredListMenuNode,
  type StoredMenuPreset,
  type StoredMenuPresetSection,
  type TodoGroupMode,
  type TodoSortMode,
} from './src/storage/appSettingsStore';
import {
  buildMenuPresetByListLabel,
  buildQuickPresetNavItems,
  isAllListsBoardPresetLabel,
  isListScopedPreset,
  QUICK_LIST_PRESET_ID_PREFIX,
  type QuickPresetNavItem,
} from './src/presets';
import {
  buildTodoListRows,
  createTodoSortComparator,
  estimateTodoListOffsetForId,
  flattenTodoListRows,
  TODO_GROUPED_ROW_ESTIMATE,
  TODO_LIST_CONTENT_TOP_PADDING,
  TODO_LIST_ROW_GAP,
  TODO_ROW_DIVIDER_HEIGHT,
  type VisibleTodoListRow,
} from './src/todoListRows';
import { getEffectiveTodoDateLabels } from './src/todoDates';
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
  getDatePickerMenuDisplayLabel,
  hasRepeatingItemsFilter,
  hasTodoReminderTime,
  hasTodoRepeat,
  isDatePickerMenuItemSelected,
  isReminderPickerMenuLabel,
  REMINDER_PICKER_LABEL,
  REPEATING_ITEMS_FILTER_LABEL,
  REPEATING_ITEMS_FILTER_VALUE,
  removeRepeatStatusFilters,
  REPEAT_PICKER_LABEL,
  toggleRepeatingItemsFilterValue,
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

const DATE_STATUS_REFRESH_BUFFER_MS = 1000;

const getDateStatusKey = (date = new Date()) => toISODateString(startOfDay(date));

const getMillisecondsUntilNextDateStatusRefresh = (date = new Date()) => {
  const nextDay = startOfDay(date);
  nextDay.setDate(nextDay.getDate() + 1);

  return Math.max(
    DATE_STATUS_REFRESH_BUFFER_MS,
    nextDay.getTime() - date.getTime() + DATE_STATUS_REFRESH_BUFFER_MS,
  );
};

type ListMenuNode = StoredListMenuNode;
type MenuPreset = StoredMenuPreset;
type MenuPresetSection = StoredMenuPresetSection;

type SearchKeywordEditTarget =
  | { kind: 'list'; listIndex: number }
  | { kind: 'preset'; presetId: string };

type UndoSnapshot = {
  dateLabelDisplayMode: DateLabelDisplayMode;
  deletedTodos: DeletedTodo[];
  filterColors: FilterColorSettings;
  googleDriveBackupEnabled: boolean;
  hideDoneTodos: boolean;
  lastCreateTodoFilters: TodoFilters;
  listMenuTree: ListMenuNode[];
  listOrderMode: ListOrderMode;
  menuPresets: MenuPreset[];
  metaTagVisibility: MetaTagVisibility;
  quickPresetNavIconNames: string[];
  quickPresetNavPresetIds: Array<string | null>;
  avoidedFilters: TodoFilters;
  requiredFilters: TodoFilters;
  selectedFilters: TodoFilters;
  showOverdueMetaTags: boolean;
  todoGroupMode: TodoGroupMode;
  todoSortMode: TodoSortMode;
  todos: Todo[];
};

type UndoHistoryEntry = {
  id: number;
  label: string;
  snapshot: UndoSnapshot;
};

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

type GoogleDriveAction = 'backup' | 'manage' | 'restore';
type GoogleDriveBackupPickerMode = 'backup' | 'manage' | 'restore';
type GoogleDriveBackupPickerState = {
  accessToken: string;
  mode: GoogleDriveBackupPickerMode;
  scope: DriveBackupScope;
  slots: DriveBackupSlot[];
};
type GoogleDriveBackupPickerSelection =
  | { slot: DriveBackupSlot; type: 'slot' }
  | null;

type NativeGoogleSignIn = typeof import('@react-native-google-signin/google-signin');

type MenuRow =
  | {
      count: number;
      id: string;
      label: string;
      type: 'deleteAction';
    }
  | {
      id: string;
      label: string;
      type: 'clearFilters';
    }
  | {
      id: string;
      label: string;
      pinned: boolean;
      type: 'pinAction';
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
      id: string;
      label: string;
      preset: MenuPreset;
      section: MenuPresetSection;
      summary: string;
      type: 'presetSection';
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

type BottomMenuItem = MenuRow | VisibleListMenuItem;

const MENU_SECTION_FILTER_KEYS: Partial<Record<MenuMode, FilterKey>> = {
  date: 'date',
  lists: 'list',
  priority: 'priority',
};

const REPEAT_STATUS_FILTER_ITEMS = [
  {
    displayLabel: REPEATING_ITEMS_FILTER_LABEL,
    id: 'repeating-items',
    value: REPEATING_ITEMS_FILTER_VALUE,
  },
];

const isRepeatStatusFilterValue = (value: string) =>
  value === REPEATING_ITEMS_FILTER_VALUE;

const getRepeatStatusFilterDisplayLabel = (_value: string) => REPEATING_ITEMS_FILTER_LABEL;

const hasRepeatStatusFilter = (values: string[]) =>
  hasRepeatingItemsFilter(values);

const countRepeatStatusFilters = (values: string[]) =>
  REPEAT_STATUS_FILTER_ITEMS.filter((item) => values.includes(item.value)).length;

const countDateMenuSelections = (
  filters: TodoFilters,
  includeReminderRows: boolean,
) =>
  filters.date.length +
  (!includeReminderRows ? countRepeatStatusFilters(filters.reminder) : 0) +
  (includeReminderRows && hasTodoReminderTime(filters.reminder) ? 1 : 0) +
  (includeReminderRows && hasTodoRepeat(filters.reminder) ? 1 : 0);

const menuSectionCanClear = (
  menuMode: MenuMode,
  filters: TodoFilters,
  avoidedFilters: TodoFilters,
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
      return (
        countDateMenuSelections(filters, includeReminderRows) +
        countDateMenuSelections(avoidedFilters, includeReminderRows)
      ) > 0;
    }

    return filters[filterKey].length + avoidedFilters[filterKey].length > 0;
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
const TODO_DETAIL_SELECTION_COLOR = '#C0C0C0';
const TODO_DETAIL_CONTENT_VISIBLE_LINES = 6;
const TODO_DETAIL_CONTENT_INPUT_MIN_HEIGHT = 165;
const TODO_DETAIL_CONTENT_EXTRA_LINES = 5;
const CARD_BORDER_RADIUS = 12;
const CONTROL_BORDER_RADIUS = 10;
const PULL_MAX = 178;
const DOUBLE_TAP_DELAY = 300;
const EDGE_BACK_WIDTH = 28;
const LIST_MENU_HEIGHT_RATIO = 0.5;
const NAV_ACCENT = THEME_ACCENT;
const NAV_ICON_INACTIVE = THEME_TEXT_SECONDARY;
const QUICK_PRESET_NAV_ICON_ROW_HEIGHT = 40;
const QUICK_PRESET_NAV_HEIGHT = QUICK_PRESET_NAV_ICON_ROW_HEIGHT;
const BOTTOM_NAV_PRIMARY_HEIGHT = 48;
const BOTTOM_NAV_HEIGHT = QUICK_PRESET_NAV_HEIGHT + BOTTOM_NAV_PRIMARY_HEIGHT;
const BOTTOM_NAV_BOTTOM_GAP = Platform.OS === 'android' ? 10 : 0;
const BOTTOM_NAV_RESERVED_HEIGHT = BOTTOM_NAV_HEIGHT + BOTTOM_NAV_BOTTOM_GAP;
const HEADER_SEARCH_ROW_HEIGHT = 64;
type MaterialCommunityIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
const toMaterialCommunityIconName = (iconName: string): MaterialCommunityIconName => (
  iconName as MaterialCommunityIconName
);
const QUICK_PRESET_NAV_ICON_CHOICES = [
  ...DEFAULT_QUICK_PRESET_NAV_ICON_NAMES,
  'snail',
  'duck',
  'fish',
  'paw',
  'flower-outline',
  'horse-variant',
].map(toMaterialCommunityIconName);

type ListIconGroup = {
  icons: MaterialCommunityIconName[];
  title: string;
};

const LIST_ICON_GROUPS: ListIconGroup[] = [
  {
    title: 'Animals',
    icons: [
      ...DEFAULT_QUICK_PRESET_NAV_ICON_NAMES,
      'snail',
      'duck',
      'fish',
      'paw',
      'horse-variant',
      'bird',
      'elephant',
      'panda',
      'koala',
      'sheep',
      'pig-variant',
      'cow',
      'snake',
      'spider',
      'bat',
      'mouse-variant',
      'donkey',
      'turkey',
    ].map(toMaterialCommunityIconName),
  },
  {
    title: 'Sea life',
    icons: [
      'dolphin',
      'shark',
      'jellyfish',
      'fish',
      'turtle',
      'waves',
      'sail-boat',
      'anchor',
    ].map(toMaterialCommunityIconName),
  },
  {
    title: 'Nature',
    icons: [
      'flower-outline',
      'leaf',
      'tree-outline',
      'seed-outline',
      'clover',
      'cactus',
      'pine-tree',
      'palm-tree',
      'mushroom-outline',
      'grass',
      'sprout',
      'fruit-cherries',
      'fruit-grapes',
      'carrot',
      'food-apple-outline',
    ].map(toMaterialCommunityIconName),
  },
  {
    title: 'Sky & weather',
    icons: [
      'star-four-points',
      'star-outline',
      'moon-waning-crescent',
      'weather-sunny',
      'weather-night',
      'weather-partly-cloudy',
      'weather-rainy',
      'weather-snowy',
      'umbrella-outline',
      'rocket-launch-outline',
      'airplane',
    ].map(toMaterialCommunityIconName),
  },
  {
    title: 'Cute & fun',
    icons: [
      'heart-outline',
      'gift-outline',
      'music-note',
      'palette-outline',
      'puzzle-outline',
      'balloon',
      'teddy-bear',
      'party-popper',
      'emoticon-happy-outline',
      'hand-heart-outline',
    ].map(toMaterialCommunityIconName),
  },
];
// Menu overlay sits above both nav rows; a small gap keeps the sheet off the nav bar.
const LIST_MENU_BOTTOM_OFFSET = 8;
const LIST_MENU_OVERLAY_BOTTOM = BOTTOM_NAV_RESERVED_HEIGHT;
const LIST_MENU_ONE_HANDED_SCROLL_RATIO = 0.35;
const TODO_LIST_ONE_HANDED_SCROLL_RATIO = 0.7;
const MENU_DISMISS_RELEASE = 52;
const CREATE_DRAWER_LIST_PICKER_CHROME_HEIGHT = 116;

const formatTodoDetailDraftContentForEditing = (content: string) => {
  const normalized = normalizeTodoContent(content);

  return `${normalized}${'\n'.repeat(TODO_DETAIL_CONTENT_EXTRA_LINES)}`;
};
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
const GOOGLE_SIGN_IN_REQUIRED_MESSAGE = 'Google sign in is required.';
const GOOGLE_SESSION_EXPIRED_MESSAGE = 'Google session expired. Sign in again.';
const getAndroidGoogleSignInConfig = () => ({
  scopes: GOOGLE_AUTH_SCOPES,
  ...(GOOGLE_WEB_CLIENT_ID ? { webClientId: GOOGLE_WEB_CLIENT_ID } : {}),
});
const LIST_MENU_ROW_HEIGHT = 52;
const LIST_MENU_ICON_HIT_SLOP = 14;
const SETTINGS_SECTION_TOGGLE_HIT_SLOP = { bottom: 8, left: 8, right: 8, top: 8 };
const TODO_MENU_TARGET_TOP_OFFSET = 16;
const TODO_MENU_TARGET_HIGHLIGHT_DELAY_MS = 260;
const TODO_MENU_TARGET_HIGHLIGHT_OFFSET_TOLERANCE = 4;
const EDITED_TODO_HIGHLIGHT_DURATION_MS = 650;
const NEW_TODO_HIGHLIGHT_DURATION_MS = EDITED_TODO_HIGHLIGHT_DURATION_MS;
const REPEATING_TODO_COMPLETION_FEEDBACK_MS = 420;
const UNDO_HISTORY_LIMIT = 20;
const undoLabelUsesToast = (label: string) => (
  label.startsWith('Complete') ||
  label.startsWith('Reopen') ||
  label.startsWith('Delete')
);
const TODO_LIST_MAINTAIN_VISIBLE_CONTENT_POSITION = { disabled: true };
const QUICK_PRESET_NAV_DOUBLE_TAP_MS = 350;
const QUICK_PRESET_NAV_PRESS_DELAY_MS = 70;
const SETTINGS_SAVE_DEBOUNCE_MS = 500;
const AUTO_BACKUP_DEBOUNCE_MS = 2500;
const EMPTY_VISIBLE_TODO_LIST_ROWS: VisibleTodoListRow[] = [];
const EMPTY_LIST_GROUP_LABELS: string[] = [];
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

  if (item.type === 'groupedTodoBatch') {
    return 'groupedTodoBatch';
  }

  return item.type;
};

const getAppTodoListItemKey = (item: AppTodoListRow) => {
  if (item.type === 'searchPresetHeader') {
    const collapseState = item.isCollapsed ? 'collapsed' : 'expanded';
    return `search-preset:${item.preset.id}:${collapseState}:${item.count}:${item.matchesQuery ? 1 : 0}`;
  }

  if (item.type === 'searchListHeader') {
    const collapseState = item.isCollapsed ? 'collapsed' : 'expanded';
    return `search-list:${item.node.label}:${collapseState}:${item.count}:${item.matchesQuery ? 1 : 0}`;
  }

  if (
    item.type === 'searchPresetTodo' ||
    item.type === 'searchListTodo' ||
    item.type === 'searchItemTodo'
  ) {
    return item.id;
  }

  return getTodoListItemKey(item);
};

const getAppTodoListItemType = (item: AppTodoListRow) => {
  if (item.type === 'searchPresetHeader') {
    const collapseState = item.isCollapsed ? 'collapsed' : 'expanded';
    return `searchPresetHeader:${item.preset.id}:${collapseState}`;
  }

  if (item.type === 'searchListHeader') {
    const collapseState = item.isCollapsed ? 'collapsed' : 'expanded';
    return `searchListHeader:${item.id}:${collapseState}`;
  }

  if (item.type === 'searchPresetTodo') {
    return 'searchPresetTodo';
  }

  if (item.type === 'searchListTodo') {
    return 'searchListTodo';
  }

  if (item.type === 'searchItemTodo') {
    return 'searchItemTodo';
  }

  return getTodoListItemType(item);
};

const buildSearchListRows = (
  searchPresetItems: SearchPresetItem[],
  collapsedSearchPresetIds: Set<string>,
  searchPresetTodosByPresetId: Map<string, Todo[]>,
): Array<SearchPresetHeaderRow | SearchPresetTodoRow> => {
  const rows: Array<SearchPresetHeaderRow | SearchPresetTodoRow> = [];
  let hasPreviousRow = false;

  searchPresetItems.forEach((item) => {
    const isCollapsed = collapsedSearchPresetIds.has(item.preset.id);
    rows.push({
      type: 'searchPresetHeader',
      count: item.count,
      gapBefore: hasPreviousRow,
      id: `search-preset:${item.preset.id}`,
      isCollapsed,
      matchesQuery: item.matchesQuery,
      preset: item.preset,
    });
    hasPreviousRow = true;

    if (isCollapsed) {
      return;
    }

    const presetTodos = searchPresetTodosByPresetId.get(item.preset.id) ?? [];

    presetTodos.forEach((todo, todoIndex) => {
      rows.push({
        type: 'searchPresetTodo',
        gapBefore: false,
        id: `search-preset-todo:${item.preset.id}:${todo.id}`,
        isFirstInPreset: todoIndex === 0,
        isLastInPreset: todoIndex === presetTodos.length - 1,
        presetId: item.preset.id,
        todo,
      });
      hasPreviousRow = true;
    });
  });

  return rows;
};

const buildSearchListMenuRows = (
  searchListMenuItems: SearchListMenuItem[],
  collapsedSearchListLabels: Set<string>,
  searchListMenuTodosByLabel: Map<string, Todo[]>,
): Array<SearchListHeaderRow | SearchListTodoRow> => {
  const rows: Array<SearchListHeaderRow | SearchListTodoRow> = [];
  let hasPreviousRow = false;

  searchListMenuItems.forEach((item) => {
    const isCollapsed = collapsedSearchListLabels.has(item.node.label);
    rows.push({
      type: 'searchListHeader',
      count: item.count,
      gapBefore: hasPreviousRow,
      id: `search-list:${item.node.label}`,
      isCollapsed,
      listIndex: item.listIndex,
      matchesQuery: item.matchesQuery,
      node: item.node,
    });
    hasPreviousRow = true;

    if (isCollapsed) {
      return;
    }

    const listTodos = searchListMenuTodosByLabel.get(item.node.label) ?? [];

    listTodos.forEach((todo, todoIndex) => {
      rows.push({
        type: 'searchListTodo',
        gapBefore: false,
        id: `search-list-todo:${item.node.label}:${todo.id}`,
        isFirstInList: todoIndex === 0,
        isLastInList: todoIndex === listTodos.length - 1,
        listLabel: item.node.label,
        todo,
      });
      hasPreviousRow = true;
    });
  });

  return rows;
};

const buildItemSearchRows = (todos: Todo[]): SearchItemTodoRow[] =>
  todos.map((todo, index) => ({
    type: 'searchItemTodo',
    gapBefore: index > 0,
    id: `search-item:${todo.id}`,
    isFirst: index === 0,
    isLast: index === todos.length - 1,
    todo,
  }));

const PRESET_SWIPE_DELETE_WIDTH = 72;
const BACKUP_SLOT_SWIPE_DELETE_WIDTH = PRESET_SWIPE_DELETE_WIDTH;
const SETTINGS_LIST_ROW_HEIGHT = 54;
const SETTINGS_LIST_SWIPE_DELETE_WIDTH = PRESET_SWIPE_DELETE_WIDTH;
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

type SearchMode = 'preset' | 'item';

type SearchPresetItem = {
  count: number;
  index: number;
  matchesQuery: boolean;
  preset: MenuPreset;
  score: number;
};

type SearchListMenuItem = {
  count: number;
  index: number;
  listIndex: number;
  matchesQuery: boolean;
  node: ListMenuNode;
  score: number;
};

type SearchPresetHeaderRow = {
  count: number;
  gapBefore: boolean;
  id: string;
  isCollapsed: boolean;
  matchesQuery: boolean;
  preset: MenuPreset;
  type: 'searchPresetHeader';
};

type SearchPresetTodoRow = {
  gapBefore: boolean;
  id: string;
  isFirstInPreset: boolean;
  isLastInPreset: boolean;
  presetId: string;
  todo: Todo;
  type: 'searchPresetTodo';
};

type SearchListHeaderRow = {
  count: number;
  gapBefore: boolean;
  id: string;
  isCollapsed: boolean;
  listIndex: number;
  matchesQuery: boolean;
  node: ListMenuNode;
  type: 'searchListHeader';
};

type SearchListTodoRow = {
  gapBefore: boolean;
  id: string;
  isFirstInList: boolean;
  isLastInList: boolean;
  listLabel: string;
  todo: Todo;
  type: 'searchListTodo';
};

type SearchItemTodoRow = {
  gapBefore: boolean;
  id: string;
  isFirst: boolean;
  isLast: boolean;
  todo: Todo;
  type: 'searchItemTodo';
};

type AppTodoListRow =
  | VisibleTodoListRow
  | SearchPresetHeaderRow
  | SearchPresetTodoRow
  | SearchListHeaderRow
  | SearchListTodoRow
  | SearchItemTodoRow;

const PRESET_SEARCH_NO_MATCH_SCORE = Number.POSITIVE_INFINITY;

const normalizePresetSearchInput = (value: string) =>
  normalizeTodoText(value).replace(/\s+/g, ' ').trim();

const normalizePresetSearchKeywords = (value: string) =>
  value.replace(/\s+/g, ' ').trim();

const isOrderedSubsequence = (needle: string, haystack: string) => {
  if (!needle) {
    return true;
  }

  let searchStart = 0;

  for (const char of needle) {
    const index = haystack.indexOf(char, searchStart);

    if (index < 0) {
      return false;
    }

    searchStart = index + 1;
  }

  return true;
};

const getOrderedSubsequenceScore = (needle: string, haystack: string) => {
  if (!isOrderedSubsequence(needle, haystack)) {
    return PRESET_SEARCH_NO_MATCH_SCORE;
  }

  let searchStart = 0;
  let previousIndex = -1;
  let gapScore = 0;

  for (const char of needle) {
    const index = haystack.indexOf(char, searchStart);

    if (previousIndex >= 0) {
      gapScore += index - previousIndex - 1;
    } else {
      gapScore += index;
    }

    previousIndex = index;
    searchStart = index + 1;
  }

  return gapScore + Math.max(0, haystack.length - needle.length) / 100;
};

const getPresetSearchWordScore = (term: string, word: string) => {
  if (!term || !word) {
    return PRESET_SEARCH_NO_MATCH_SCORE;
  }

  if (word === term) {
    return 0;
  }

  if (word.startsWith(term)) {
    return 1 + Math.max(0, word.length - term.length) / 100;
  }

  const substringIndex = word.indexOf(term);
  if (substringIndex >= 0) {
    return 2 + substringIndex / 10 + Math.max(0, word.length - term.length) / 100;
  }

  const subsequenceScore = getOrderedSubsequenceScore(term, word);
  return Number.isFinite(subsequenceScore) ? 4 + subsequenceScore : PRESET_SEARCH_NO_MATCH_SCORE;
};

const getSearchTextScore = (
  label: string,
  searchKeywords: string | undefined,
  query: string,
) => {
  const normalizedQuery = normalizePresetSearchInput(query);
  const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean);

  if (queryTerms.length === 0) {
    return 0;
  }

  const searchableText = normalizePresetSearchInput([
    label,
    searchKeywords ?? '',
  ].join(' '));
  const searchableWords = searchableText.split(/\s+/).filter(Boolean);
  const compactSearchableText = searchableWords.join('');

  if (!searchableWords.length) {
    return PRESET_SEARCH_NO_MATCH_SCORE;
  }

  let totalScore = 0;

  for (const term of queryTerms) {
    const wordScore = searchableWords.reduce(
      (bestScore, word) => Math.min(bestScore, getPresetSearchWordScore(term, word)),
      PRESET_SEARCH_NO_MATCH_SCORE,
    );
    const compactScore = getPresetSearchWordScore(term, compactSearchableText) + 8;
    const termScore = Math.min(wordScore, compactScore);

    if (!Number.isFinite(termScore)) {
      return PRESET_SEARCH_NO_MATCH_SCORE;
    }

    totalScore += termScore;
  }

  const compactQueryScore = getPresetSearchWordScore(queryTerms.join(''), compactSearchableText);
  return Math.min(totalScore, compactQueryScore + 3);
};

const getPresetSearchScore = (preset: MenuPreset, query: string) =>
  getSearchTextScore(
    '',
    [
      preset.searchKeywords ?? '',
      ...(preset.sections ?? []).map((section) => section.label),
    ].join(' '),
    query,
  );

const getListMenuSearchScore = (node: ListMenuNode, query: string) =>
  getSearchTextScore('', node.searchKeywords, query);

const buildActiveFilterItems = (
  filters: SelectedFilters,
  dateLabelDisplayMode: DateLabelDisplayMode,
): SearchFilterItem[] =>
  [
    ...FILTER_KEYS.flatMap((filterKey) =>
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
    ),
    ...REPEAT_STATUS_FILTER_ITEMS.flatMap((item) => (
      filters.reminder.includes(item.value)
        ? [{
            displayLabel: item.displayLabel,
            filterKey: 'date' as const,
            id: `search-filter-${item.id}`,
            value: item.value,
          }]
        : []
    )),
  ];

type NavTab = 'calendar' | 'menu' | 'search' | 'settings';

type CreateDrawerPicker = 'date' | 'list' | 'priority';
const CREATE_DRAWER_NO_LIST_PICKER_VALUE = '__create_drawer_no_list__';
const CREATE_DRAWER_NO_LIST_LABEL = '--';

const LIST_SUBSECTION_NOT_SECTIONED_LABEL = 'Not Sectioned';
const CREATE_SECTION_DEFAULT_REPEAT: RepeatPreset = 'daily';

const uniqueCreateFilterValues = (values: string[]) => {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value || seen.has(value)) {
      return false;
    }

    seen.add(value);
    return true;
  });
};

const mergeCreateSectionFilters = (...filters: TodoFilters[]): TodoFilters => ({
  date: uniqueCreateFilterValues(filters.flatMap((filter) => filter.date)),
  list: uniqueCreateFilterValues(filters.flatMap((filter) => filter.list)),
  priority: uniqueCreateFilterValues(filters.flatMap((filter) => filter.priority)),
  reminder: uniqueCreateFilterValues(filters.flatMap((filter) => filter.reminder)),
});

const getOverdueCreateDateLabel = () => {
  const date = startOfDay(new Date());
  date.setDate(date.getDate() - 1);
  return toISODateString(date);
};

const getCreatableDateLabel = (label: string): string => {
  const formattedLabel = formatDateFilterValue(label);

  if (!formattedLabel) {
    return '';
  }

  if (formattedLabel === OVERDUE_DATE_LABEL) {
    return getOverdueCreateDateLabel();
  }

  if (formattedLabel === DATED_DATE_LABEL) {
    return 'Today';
  }

  return formattedLabel;
};

const getCreatableReminderValues = (values: string[]) => {
  const reminderValues = removeRepeatStatusFilters(values);

  if (!hasRepeatingItemsFilter(values)) {
    return reminderValues;
  }

  const currentReminder = decodeTodoReminder(reminderValues);
  if (currentReminder.repeat !== 'none') {
    return reminderValues;
  }

  return encodeTodoReminder({
    time: currentReminder.time,
    repeat: CREATE_SECTION_DEFAULT_REPEAT,
  });
};

const getCreateFiltersForSectionHeader = (
  sectionId: string,
  sectionLabel: string,
  currentFilters: TodoFilters = cloneTodoFilters(),
): TodoFilters => {
  const base = cloneTodoFilters(currentFilters);

  if (sectionId.startsWith('group-list-')) {
    const key = sectionId.slice('group-list-'.length);
    if (key === 'No list') {
      return { ...base, list: [] };
    }

    const notSectionedSuffix = `::${LIST_SUBSECTION_NOT_SECTIONED_LABEL}`;
    if (key.endsWith(notSectionedSuffix)) {
      const parentLabel = key.slice(0, -notSectionedSuffix.length);
      return { ...base, list: [parentLabel] };
    }

    return { ...base, list: [key] };
  }

  if (sectionId.startsWith('group-priority-')) {
    const key = sectionId.slice('group-priority-'.length);
    if (key === 'No priority') {
      return { ...base, priority: [] };
    }

    return { ...base, priority: [key] };
  }

  if (sectionId.startsWith('group-date-')) {
    const key = sectionId.slice('group-date-'.length);
    if (key === 'No date') {
      return { ...base, date: [] };
    }

    return { ...base, date: [key] };
  }

  if (sectionId.startsWith('subsection-')) {
    if (sectionLabel === LIST_SUBSECTION_NOT_SECTIONED_LABEL) {
      const prefix = 'subsection-';
      const suffix = `-${LIST_SUBSECTION_NOT_SECTIONED_LABEL}`;
      if (sectionId.endsWith(suffix)) {
        const parentLabel = sectionId.slice(prefix.length, -suffix.length);
        return { ...base, list: [parentLabel] };
      }
    }

    return { ...base, list: [sectionLabel] };
  }

  return base;
};

const canCreateFromSectionHeader = (sectionId: string, sectionLabel: string) => {
  if (!sectionId.startsWith('group-status-')) {
    return true;
  }

  return sectionLabel === 'Active';
};

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
  const hasUnknownListLabel = normalized.list.some((label) => !knownListLabels.has(label));
  const priorityLabel = normalized.priority.find((label) => (
    label !== 'None' && PRIORITY_MENU_ITEMS.includes(label)
  ));
  const reminderValues = getCreatableReminderValues(normalized.reminder);
  const creatableDateLabel = normalized.date[0]
    ? getCreatableDateLabel(normalized.date[0])
    : '';

  return {
    date: creatableDateLabel ? [creatableDateLabel] : [],
    list: listLabel ? [listLabel] : hasUnknownListLabel ? fallback.list : [],
    priority: priorityLabel ? [priorityLabel] : [],
    reminder: reminderValues,
  };
};

const hasRememberedCreateDraftFilters = (
  listMenuTree: ListMenuNode[],
  filters: TodoFilters,
) => {
  const normalized = normalizeTodoFilters(filters);
  const knownListLabels = new Set(collectListNodeLabels(listMenuTree));
  const reminderValues = getCreatableReminderValues(normalized.reminder);

  return (
    normalized.date.length > 0 ||
    reminderValues.length > 0 ||
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
    list: normalized.list[0] || hasRememberedFilters ? normalized.list : fallback.list,
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
const LEGACY_INITIAL_TODO_COUNT = 50;

const isEmptyTodoFilters = (filters: TodoFilters) =>
  filters.date.length === 0 &&
  filters.list.length === 0 &&
  filters.priority.length === 0 &&
  filters.reminder.length === 0;

const isInitialSeedTodo = (todo: Todo) => {
  const match = /^seed-(\d+)$/.exec(todo.id);

  if (!match) {
    return false;
  }

  const seedNumber = Number(match[1]);

  return (
    Number.isInteger(seedNumber) &&
    seedNumber >= 1 &&
    seedNumber <= LEGACY_INITIAL_TODO_COUNT &&
    todo.content === '' &&
    todo.text === `Todo item ${seedNumber}` &&
    todo.pinned === false &&
    todo.done === false &&
    isEmptyTodoFilters(todo.filters)
  );
};

const removeInitialSeedTodos = (todos: Todo[]) =>
  todos.filter((todo) => !isInitialSeedTodo(todo));

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

const formatDriveBackupFileSize = (value?: string) => {
  const bytes = Number(value);

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return `${Math.ceil(bytes / 1024)} KB`;
};

const formatDriveBackupSlotTitle = (slot: DriveBackupSlot) => `Slot ${slot.slot}`;

const formatDriveBackupSlotSubtitle = (slot: DriveBackupSlot) => {
  const file = slot.file;
  if (!file) {
    return 'Empty slot';
  }
  const modifiedAt = formatBackupTime(file.modifiedTime ?? null);
  const fileSize = formatDriveBackupFileSize(file.size);

  return [
    modifiedAt ? `Saved ${modifiedAt}` : 'Saved backup',
    fileSize,
  ].filter(Boolean).join(' · ');
};

const DRIVE_BACKUP_VARIANT_LABEL = isDevAppVariant ? 'Dev' : 'Prod';
const DRIVE_BACKUP_VARIANT_LOWER_LABEL = DRIVE_BACKUP_VARIANT_LABEL.toLocaleLowerCase();
const DRIVE_BACKUP_CONFIG_HINT = isDevAppVariant
  ? 'Add the EXPO_PUBLIC_GOOGLE_*_DEV_CLIENT_ID for this build and rebuild.'
  : 'Add the EXPO_PUBLIC_GOOGLE_*_PROD_CLIENT_ID for this build and rebuild.';

const formatDriveBackupScopeLabel = (_scope: DriveBackupScope) =>
  `${DRIVE_BACKUP_VARIANT_LOWER_LABEL} backup`;

const formatDriveBackupScopePluralLabel = (_scope: DriveBackupScope) =>
  `${DRIVE_BACKUP_VARIANT_LOWER_LABEL} backups`;

const getFilledDriveBackupSlots = (slots: DriveBackupSlot[]) => (
  slots.filter((slot) => slot.file)
);

type GoogleDriveBackupSlotRowProps = {
  actionLabel: string;
  disabled: boolean;
  listOnly?: boolean;
  onDelete: () => void;
  onPress: () => void;
  scrollGestureRef?: React.RefObject<React.ComponentRef<typeof GestureScrollView> | null>;
  slot: DriveBackupSlot;
};

function GoogleDriveBackupSlotRow({
  actionLabel,
  disabled,
  listOnly = false,
  onDelete,
  onPress,
  scrollGestureRef,
  slot,
}: GoogleDriveBackupSlotRowProps) {
  const canDelete = Boolean(slot.file);
  const title = formatDriveBackupSlotTitle(slot);
  const subtitle = formatDriveBackupSlotSubtitle(slot);
  const renderRightActions = useCallback(
    () => (
      <View style={styles.googleDrivePickerSwipeActions}>
        <GHTouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Delete ${title}`}
          activeOpacity={0.82}
          onPress={onDelete}
          style={styles.googleDrivePickerSwipeDelete}
        >
          <Ionicons color="#FFFFFF" name="trash-outline" size={22} />
        </GHTouchableOpacity>
      </View>
    ),
    [onDelete, title],
  );

  return (
    <View style={styles.googleDrivePickerSwipeShell}>
      <Swipeable
        childrenContainerStyle={styles.googleDrivePickerSwipeChildren}
        containerStyle={styles.googleDrivePickerSwipeContainer}
        dragOffsetFromLeftEdge={12}
        dragOffsetFromRightEdge={12}
        friction={1.1}
        overshootRight={false}
        renderRightActions={canDelete ? renderRightActions : undefined}
        rightThreshold={BACKUP_SLOT_SWIPE_DELETE_WIDTH}
        simultaneousHandlers={scrollGestureRef}
      >
        {listOnly ? (
          <View
            accessibilityHint={canDelete ? 'Swipe left to delete this backup.' : undefined}
            accessibilityLabel={`${title}. ${subtitle}`}
            accessibilityRole="text"
            style={[
              styles.googleDrivePickerChoice,
              slot.file && styles.googleDrivePickerChoiceFilled,
            ]}
          >
            <View style={styles.googleDrivePickerChoiceTextWrap}>
              <Text
                numberOfLines={1}
                style={styles.googleDrivePickerChoiceTitle}
              >
                {title}
              </Text>
              <Text
                numberOfLines={2}
                style={styles.googleDrivePickerChoiceSubtitle}
              >
                {subtitle}
              </Text>
            </View>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            accessibilityHint={canDelete ? 'Swipe left to delete this backup.' : undefined}
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [
              styles.googleDrivePickerChoice,
              slot.file && styles.googleDrivePickerChoiceFilled,
              disabled && styles.googleDrivePickerChoiceDisabled,
              pressed && !disabled && styles.googleDrivePickerChoicePressed,
            ]}
          >
            <View style={styles.googleDrivePickerChoiceTextWrap}>
              <Text
                numberOfLines={1}
                style={styles.googleDrivePickerChoiceTitle}
              >
                {title}
              </Text>
              <Text
                numberOfLines={2}
                style={styles.googleDrivePickerChoiceSubtitle}
              >
                {subtitle}
              </Text>
            </View>
            <Text
              style={[
                styles.googleDrivePickerChoiceAction,
                disabled && styles.googleDrivePickerChoiceActionDisabled,
              ]}
            >
              {actionLabel}
            </Text>
          </Pressable>
        )}
      </Swipeable>
    </View>
  );
}

const MemoizedGoogleDriveBackupSlotRow = React.memo(GoogleDriveBackupSlotRow);

const formatDeletedTodoTime = (value: number) =>
  new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  });

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

const isGoogleAuthRecoveryError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  return (
    message === GOOGLE_SIGN_IN_REQUIRED_MESSAGE ||
    message === GOOGLE_SESSION_EXPIRED_MESSAGE ||
    normalizedMessage.includes('invalid_grant') ||
    normalizedMessage.includes('invalid credentials') ||
    normalizedMessage.includes('invalid authentication credentials') ||
    normalizedMessage.includes('missing required authentication credential') ||
    normalizedMessage.includes('expected oauth 2 access token') ||
    normalizedMessage.includes('insufficient authentication scopes') ||
    normalizedMessage.includes('login required') ||
    normalizedMessage.includes('unauthorized') ||
    normalizedMessage.includes('status 401') ||
    normalizedMessage.includes('token has been expired') ||
    normalizedMessage.includes('expired or revoked')
  );
};

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

const filterValueListsEqual = (first: string[], second: string[]) => {
  if (first.length !== second.length) {
    return false;
  }

  const firstValues = [...first].sort();
  const secondValues = [...second].sort();

  return firstValues.every((value, index) => value === secondValues[index]);
};

const dateFilterValuesIncludeExactDay = (
  dateLabels: string[],
  date: Date,
  now = new Date(),
): boolean => {
  const targetDay = startOfDay(date).getTime();

  return dateLabels.some((label) => {
    const formattedLabel = formatDateFilterValue(label);
    const isExactDayLabel =
      isCustomDateLabel(formattedLabel) ||
      formattedLabel === 'Today' ||
      formattedLabel === 'Tomorrow';

    return (
      isExactDayLabel &&
      resolveDateFilterValueDate(formattedLabel, now)?.getTime() === targetDay
    );
  });
};

const filtersEqual = (first: TodoFilters, second: TodoFilters): boolean =>
  JSON.stringify(normalizeFilterValues(first)) === JSON.stringify(normalizeFilterValues(second));

const hasAnyFilterValues = (filters: TodoFilters): boolean =>
  filters.date.length > 0 ||
  filters.list.length > 0 ||
  filters.priority.length > 0 ||
  filters.reminder.length > 0;

const hasAnyRequiredFilters = hasAnyFilterValues;

const isFilterValueInFilters = (
  filters: TodoFilters,
  filterKey: FilterKey,
  value: string,
): boolean => {
  if (isRepeatStatusFilterValue(value)) {
    return filters.reminder.includes(value);
  }

  const filterValue = filterKey === 'date' ? formatDateFilterValue(value) : value;
  return filters[filterKey].some((item) => (
    filterKey === 'date'
      ? formatDateFilterValue(item) === filterValue
      : item === filterValue
  ));
};

const isFilterValueRequired = isFilterValueInFilters;
const isFilterValueAvoided = isFilterValueInFilters;

const addFilterValueToRequiredFilters = (
  filters: TodoFilters,
  filterKey: FilterKey,
  value: string,
): TodoFilters => {
  const clonedFilters = cloneTodoFilters(filters);

  if (isRepeatStatusFilterValue(value)) {
    return filters.reminder.includes(value)
      ? clonedFilters
      : {
          ...clonedFilters,
          reminder: [...removeRepeatStatusFilters(clonedFilters.reminder), value],
        };
  }

  if (isFilterValueRequired(filters, filterKey, value)) {
    return clonedFilters;
  }

  const storedValue = filterKey === 'date' ? formatDateFilterValue(value) : value;
  return {
    ...clonedFilters,
    [filterKey]: [...clonedFilters[filterKey], storedValue || value],
  };
};

const removeFilterValueFromRequiredFilters = (
  filters: TodoFilters,
  filterKey: FilterKey,
  value: string,
): TodoFilters => {
  const clonedFilters = cloneTodoFilters(filters);

  if (isRepeatStatusFilterValue(value)) {
    return {
      ...clonedFilters,
      reminder: clonedFilters.reminder.filter((item) => item !== value),
    };
  }

  const formattedValue = filterKey === 'date'
    ? formatDateFilterValue(value)
    : value;
  const nextValues = clonedFilters[filterKey].filter((item) => {
    if (filterKey !== 'date') {
      return item !== value;
    }

    if (formattedValue === CUSTOM_DATE_LABEL) {
      return !isCustomDateLabel(item);
    }

    return formatDateFilterValue(item) !== formattedValue;
  });

  return { ...clonedFilters, [filterKey]: nextValues };
};

const addFilterValueToAvoidedFilters = addFilterValueToRequiredFilters;
const removeFilterValueFromAvoidedFilters = removeFilterValueFromRequiredFilters;

const removeSelectedValuesFromAvoidedFilters = (
  filters: TodoFilters,
  selectedFilters: TodoFilters,
): TodoFilters => ({
  date: filters.date.filter((value) => !selectedFilters.date.some((selectedValue) => (
    formatDateFilterValue(selectedValue) === formatDateFilterValue(value)
  ))),
  list: filters.list.filter((value) => !selectedFilters.list.includes(value)),
  priority: filters.priority.filter((value) => !selectedFilters.priority.includes(value)),
  reminder: filters.reminder.filter((value) => !selectedFilters.reminder.includes(value)),
});

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

const syncListDisplaySettingsForSingleListPreset = (
  tree: ListMenuNode[],
  listFilters: string[],
  sortMode: TodoSortMode,
  groupMode: TodoGroupMode,
) => {
  if (listFilters.length !== 1) {
    return tree;
  }

  const display = resolveListDisplaySettings(
    tree,
    listFilters,
    sortMode,
    groupMode,
  );

  if (!display.listLabel) {
    return tree;
  }

  return updateListNodeDisplaySettings(
    tree,
    display.listLabel,
    display.isSubsectionView,
    { groupMode, sortMode },
  );
};

const menuPresetMatchesState = (
  preset: MenuPreset,
  filters: SelectedFilters,
  requiredFilters: SelectedFilters,
  avoidedFilters: SelectedFilters,
  sortMode: TodoSortMode,
  groupMode: TodoGroupMode,
  orderMode: ListOrderMode,
  metaTagVisibility: MetaTagVisibility,
): boolean =>
  filtersEqual(preset.filters, filters) &&
  filtersEqual(preset.requiredFilters, pruneTodoFilters(requiredFilters, filters)) &&
  filtersEqual(preset.avoidedFilters, avoidedFilters) &&
  preset.todoSortMode === sortMode &&
  preset.todoGroupMode === groupMode &&
  preset.listOrderMode === orderMode &&
  (
    preset.metaTagVisibility
      ? metaTagVisibilityEqual(preset.metaTagVisibility, metaTagVisibility)
      : true
  );

const formatPresetCount = (count: number, label: string) =>
  `${count} ${label}${count === 1 ? '' : 's'}`;

const formatPresetSummary = (
  filters: SelectedFilters,
  requiredFilters: SelectedFilters,
  avoidedFilters: SelectedFilters,
  sortMode: TodoSortMode,
  groupMode: TodoGroupMode,
  orderMode: ListOrderMode,
  metaTagVisibility?: MetaTagVisibility,
) => {
  const requiredFilterCount = countFilters(pruneTodoFilters(requiredFilters, filters));
  const avoidedFilterCount = countFilters(avoidedFilters);
  const parts = [
    filters.list.length > 0 ? formatPresetCount(filters.list.length, 'list') : null,
    filters.priority.length > 0 ? formatPresetCount(filters.priority.length, 'priority') : null,
    filters.date.length > 0 ? formatPresetCount(filters.date.length, 'date') : null,
    hasRepeatingItemsFilter(filters.reminder) ? REPEATING_ITEMS_FILTER_LABEL : null,
    requiredFilterCount > 0 ? `${requiredFilterCount} must` : null,
    avoidedFilterCount > 0 ? `${avoidedFilterCount} avoid` : null,
    `Sort ${TODO_SORT_LABELS[sortMode]}`,
    `Group ${TODO_GROUP_LABELS[groupMode]}`,
    orderMode === 'alphabetical' ? 'Lists A to Z' : 'Manual lists',
    metaTagVisibility && !metaTagVisibilityMatchesDefault(metaTagVisibility)
      ? `Meta ${formatMetaTagVisibilitySummary(metaTagVisibility)}`
      : null,
  ].filter((part): part is string => Boolean(part));

  return parts.join(' · ');
};

const formatPresetSectionLabel = (
  filters: SelectedFilters,
  dateLabelDisplayMode: DateLabelDisplayMode,
) => {
  // Sections are created from the current menu view, so the label favors the
  // filters that make that view recognizable at a glance.
  const activeFilterItems = buildActiveFilterItems(filters, dateLabelDisplayMode);
  const listLabels = activeFilterItems
    .filter((item) => item.filterKey === 'list')
    .map((item) => item.displayLabel);
  const dateLabels = activeFilterItems
    .filter((item) => item.filterKey === 'date')
    .map((item) => item.displayLabel);
  const priorityLabels = activeFilterItems
    .filter((item) => item.filterKey === 'priority')
    .map((item) => item.displayLabel);
  const labels = [
    ...listLabels.slice(0, 1),
    ...dateLabels.slice(0, 2),
    ...priorityLabels.slice(0, 1),
  ];
  const hiddenCount =
    listLabels.length + dateLabels.length + priorityLabels.length - labels.length;

  if (labels.length === 0) {
    return 'All items';
  }

  return hiddenCount > 0
    ? `${labels.join(' · ')} +${hiddenCount}`
    : labels.join(' · ');
};

const getUniquePresetSectionLabel = (
  sections: MenuPresetSection[] | undefined,
  label: string,
) => {
  const existingLabels = new Set(
    (sections ?? []).map((section) => section.label.toLocaleLowerCase()),
  );

  if (!existingLabels.has(label.toLocaleLowerCase())) {
    return label;
  }

  let suffix = 2;
  let candidate = `${label} ${suffix}`;
  while (existingLabels.has(candidate.toLocaleLowerCase())) {
    suffix += 1;
    candidate = `${label} ${suffix}`;
  }

  return candidate;
};

// A section is a complete mini-preset. Duplicate checks must compare display
// modes as well as the selected, required, and avoided filter families.
const presetSectionMatchesState = (
  section: MenuPresetSection,
  filters: SelectedFilters,
  requiredFilters: SelectedFilters,
  avoidedFilters: SelectedFilters,
  sortMode: TodoSortMode,
  groupMode: TodoGroupMode,
  orderMode: ListOrderMode,
  metaTagVisibility: MetaTagVisibility,
) =>
  filtersEqual(section.filters, filters) &&
  filtersEqual(section.requiredFilters, pruneTodoFilters(requiredFilters, filters)) &&
  filtersEqual(section.avoidedFilters, avoidedFilters) &&
  section.todoSortMode === sortMode &&
  section.todoGroupMode === groupMode &&
  section.listOrderMode === orderMode &&
  (
    section.metaTagVisibility
      ? metaTagVisibilityEqual(section.metaTagVisibility, metaTagVisibility)
      : true
  );

const getQuickPresetNavDetail = (
  preset: MenuPreset,
  dateLabelDisplayMode: DateLabelDisplayMode,
) => {
  const activeFilterItems = buildActiveFilterItems(preset.filters, dateLabelDisplayMode);
  const requiredFilterItems = buildActiveFilterItems(preset.requiredFilters, dateLabelDisplayMode);
  const avoidedFilterItems = buildActiveFilterItems(preset.avoidedFilters, dateLabelDisplayMode);
  const filterParts = FILTER_KEYS.flatMap((filterKey) => {
    const labels = activeFilterItems
      .filter((item) => item.filterKey === filterKey)
      .map((item) => item.displayLabel);

    return labels.length > 0
      ? [`${FILTER_KIND_LABELS[filterKey]} (${labels.join(', ')})`]
      : [];
  });
  const requiredFilterLabels = requiredFilterItems.map((item) => item.displayLabel);
  const avoidedFilterLabels = avoidedFilterItems.map((item) => item.displayLabel);
  const viewParts = [
    requiredFilterLabels.length > 0 ? `Must (${requiredFilterLabels.join(', ')})` : null,
    avoidedFilterLabels.length > 0 ? `Avoid (${avoidedFilterLabels.join(', ')})` : null,
    preset.todoGroupMode !== 'none' ? `Group (${TODO_GROUP_LABELS[preset.todoGroupMode]})` : null,
    `Sort (${TODO_SORT_LABELS[preset.todoSortMode]})`,
    preset.listOrderMode === 'manual' ? 'Lists (Manual)' : null,
  ].filter((part): part is string => Boolean(part));
  const detailParts = [...filterParts, ...viewParts];

  return {
    details: detailParts,
    title: preset.label,
  };
};

const todoMatchesDateFilterGroup = (
  todo: Todo,
  filters: SelectedFilters,
  now = new Date(),
) => {
  const hasDateFilters = filters.date.length > 0;
  const hasRepeatingFilter = hasRepeatingItemsFilter(filters.reminder);

  if (!hasDateFilters && !hasRepeatingFilter) {
    return true;
  }

  const todoRepeats = hasTodoRepeat(todo.filters.reminder);
  if (hasRepeatingFilter && todoRepeats) {
    return true;
  }

  if (!hasDateFilters) {
    return false;
  }

  return todoMatchesSelectedDateFilters(
    getEffectiveTodoDateLabels(todo, now),
    filters.date,
    now,
    todo.createdAt,
  );
};

const getOptionalSelectedFilters = (
  filters: SelectedFilters,
  requiredFilters: SelectedFilters,
): SelectedFilters => ({
  date: filters.date.filter((value) => !isFilterValueRequired(requiredFilters, 'date', value)),
  list: filters.list.filter((value) => !isFilterValueRequired(requiredFilters, 'list', value)),
  priority: filters.priority.filter((value) => (
    !isFilterValueRequired(requiredFilters, 'priority', value)
  )),
  reminder: filters.reminder.filter((value) => (
    !requiredFilters.reminder.includes(value)
  )),
});

const todoMatchesRequiredFilters = (
  todo: Todo,
  requiredFilters: SelectedFilters,
  listMenuTree: ListMenuNode[],
  now = new Date(),
): boolean => {
  if (!hasAnyRequiredFilters(requiredFilters)) {
    return true;
  }

  const effectiveDateLabels = requiredFilters.date.length > 0
    ? getEffectiveTodoDateLabels(todo, now)
    : [];
  const requiredReminderValues = removeRepeatStatusFilters(requiredFilters.reminder);
  const todoRepeats = hasTodoRepeat(todo.filters.reminder);

  return (
    requiredFilters.list.every((value) => (
      todoMatchesSelectedListFilters([value], todo.filters.list, listMenuTree)
    )) &&
    requiredFilters.date.every((value) => (
      todoMatchesSelectedDateFilters(effectiveDateLabels, [value], now, todo.createdAt)
    )) &&
    requiredFilters.priority.every((value) => todo.filters.priority.includes(value)) &&
    requiredReminderValues.every((value) => todo.filters.reminder.includes(value)) &&
    (
      !hasRepeatingItemsFilter(requiredFilters.reminder) ||
      todoRepeats
    )
  );
};

const todoMatchesAvoidedFilters = (
  todo: Todo,
  avoidedFilters: SelectedFilters,
  listMenuTree: ListMenuNode[],
  now = new Date(),
): boolean => {
  if (!hasAnyFilterValues(avoidedFilters)) {
    return false;
  }

  const effectiveDateLabels = avoidedFilters.date.length > 0
    ? getEffectiveTodoDateLabels(todo, now)
    : [];
  const avoidedReminderValues = removeRepeatStatusFilters(avoidedFilters.reminder);
  const todoRepeats = hasTodoRepeat(todo.filters.reminder);

  return (
    avoidedFilters.list.some((value) => (
      todoMatchesSelectedListFilters([value], todo.filters.list, listMenuTree)
    )) ||
    avoidedFilters.date.some((value) => (
      todoMatchesSelectedDateFilters(effectiveDateLabels, [value], now, todo.createdAt)
    )) ||
    avoidedFilters.priority.some((value) => todo.filters.priority.includes(value)) ||
    avoidedReminderValues.some((value) => todo.filters.reminder.includes(value)) ||
    (
      hasRepeatingItemsFilter(avoidedFilters.reminder) &&
      todoRepeats
    )
  );
};

const todoMatchesAnyOptionalFilter = (
  todo: Todo,
  optionalFilters: SelectedFilters,
  listMenuTree: ListMenuNode[],
  now = new Date(),
): boolean => {
  if (!hasAnyRequiredFilters(optionalFilters)) {
    return true;
  }

  const effectiveDateLabels = optionalFilters.date.length > 0
    ? getEffectiveTodoDateLabels(todo, now)
    : [];
  const optionalReminderValues = removeRepeatStatusFilters(optionalFilters.reminder);
  const todoRepeats = hasTodoRepeat(todo.filters.reminder);

  return (
    optionalFilters.list.some((value) => (
      todoMatchesSelectedListFilters([value], todo.filters.list, listMenuTree)
    )) ||
    optionalFilters.date.some((value) => (
      todoMatchesSelectedDateFilters(effectiveDateLabels, [value], now, todo.createdAt)
    )) ||
    optionalFilters.priority.some((value) => todo.filters.priority.includes(value)) ||
    optionalReminderValues.some((value) => todo.filters.reminder.includes(value)) ||
    (
      hasRepeatingItemsFilter(optionalFilters.reminder) &&
      todoRepeats
    )
  );
};

const todoMatchesFilters = (
  todo: Todo,
  filters: SelectedFilters,
  listMenuTree: ListMenuNode[],
  now = new Date(),
  requiredFilters: SelectedFilters = EMPTY_SELECTED_FILTERS,
  avoidedFilters: SelectedFilters = EMPTY_SELECTED_FILTERS,
) => {
  const optionalFilters = getOptionalSelectedFilters(filters, requiredFilters);

  return (
    !todoMatchesAvoidedFilters(todo, avoidedFilters, listMenuTree, now) &&
    todoMatchesRequiredFilters(todo, requiredFilters, listMenuTree, now) &&
    todoMatchesAnyOptionalFilter(todo, optionalFilters, listMenuTree, now)
  );
};

const getFiltersAfterCreateReveal = (
  todo: Todo,
  filters: SelectedFilters,
  listMenuTree: ListMenuNode[],
  now = new Date(),
): SelectedFilters => {
  const dateGroupMatches = todoMatchesDateFilterGroup(todo, filters, now);
  const priorityMatches =
    filters.priority.length === 0 ||
    filters.priority.some((value) => todo.filters.priority.includes(value));

  return {
    date: dateGroupMatches ? [...filters.date] : [],
    list: todoMatchesSelectedListFilters(filters.list, todo.filters.list, listMenuTree)
      ? [...filters.list]
      : [],
    priority: priorityMatches ? [...filters.priority] : [],
    reminder: !dateGroupMatches && hasRepeatStatusFilter(filters.reminder)
      ? removeRepeatStatusFilters(filters.reminder)
      : [...filters.reminder],
  };
};

type MenuPresetSwipeRowProps = {
  actionLabel: 'Apply' | 'Edit';
  isSection?: boolean;
  label: string;
  onDelete: () => void;
  onPress: () => void;
  onSecondaryPress?: () => void;
  secondaryAccessibilityLabel?: string;
  summary: string;
};

function MenuPresetSwipeRow({
  actionLabel,
  isSection = false,
  label,
  onDelete,
  onPress,
  onSecondaryPress,
  secondaryAccessibilityLabel,
  summary,
}: MenuPresetSwipeRowProps) {
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
        <View
          style={[
            styles.listMenuPresetRow,
            isSection && styles.listMenuPresetSectionRow,
          ]}
        >
          <GHTouchableOpacity
            accessibilityRole="button"
            accessibilityHint={
              actionLabel === 'Edit'
                ? 'Opens this list in the filter menu for editing'
                : 'Applies this list section'
            }
            accessibilityLabel={`${actionLabel} list ${label}`}
            activeOpacity={1}
            onPress={onPress}
            style={styles.listMenuPresetMainPress}
          >
            <View style={styles.listMenuRowTextStack}>
              <Text
                numberOfLines={1}
                style={[
                  styles.listMenuRowTitle,
                  isSection && styles.listMenuPresetSectionTitle,
                ]}
              >
                {label}
              </Text>
              <Text numberOfLines={1} style={styles.listMenuRowSummary}>
                {summary}
              </Text>
            </View>
          </GHTouchableOpacity>
          <View style={styles.listMenuPresetActions}>
            {onSecondaryPress ? (
              <Pressable
                accessibilityLabel={secondaryAccessibilityLabel ?? `Add section to ${label}`}
                accessibilityRole="button"
                hitSlop={LIST_MENU_ICON_HIT_SLOP}
                onPress={onSecondaryPress}
                style={({ pressed }) => [
                  styles.listMenuPresetIconAction,
                  pressed && styles.listMenuClearButtonPressed,
                ]}
              >
                <Ionicons color={THEME_ACCENT} name="add-circle-outline" size={20} />
              </Pressable>
            ) : null}
            <GHTouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`${actionLabel} list ${label}`}
              activeOpacity={0.74}
              onPress={onPress}
              style={styles.listMenuPresetActionButton}
            >
              <Text style={styles.listMenuApplyText}>{actionLabel}</Text>
            </GHTouchableOpacity>
          </View>
        </View>
      </Swipeable>
    </View>
  );
}

const MemoizedMenuPresetSwipeRow = React.memo(MenuPresetSwipeRow);

type SettingsListSwipeRowProps = {
  isIconPickerOpen: boolean;
  label: string;
  listIconName?: string;
  onDelete: () => void;
  onIconPress: () => void;
  onMainPress: () => void;
  onPinPress: () => void;
  showInNavbar: boolean;
};

function SettingsListSwipeRow({
  isIconPickerOpen,
  label,
  listIconName,
  onDelete,
  onIconPress,
  onMainPress,
  onPinPress,
  showInNavbar,
}: SettingsListSwipeRowProps) {
  const renderedIconName = resolveMaterialCommunityIconName(listIconName, 'paw');
  const renderRightActions = useCallback(
    () => (
      <View style={styles.settingsListSwipeActions}>
        <GHTouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Delete ${label}`}
          activeOpacity={0.82}
          onPress={onDelete}
          style={styles.settingsListSwipeDelete}
        >
          <Ionicons color="#FFFFFF" name="trash-outline" size={22} />
        </GHTouchableOpacity>
      </View>
    ),
    [label, onDelete],
  );

  return (
    <View style={styles.settingsListSwipeShell}>
      <Swipeable
        childrenContainerStyle={styles.settingsListSwipeChildren}
        containerStyle={styles.settingsListSwipeContainer}
        friction={1.1}
        overshootRight={false}
        renderRightActions={renderRightActions}
        rightThreshold={SETTINGS_LIST_SWIPE_DELETE_WIDTH}
      >
        <View
          style={styles.settingsListRow}
        >
          <View style={styles.settingsListRowContent}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: isIconPickerOpen }}
              accessibilityLabel={`Choose icon for ${label}`}
              onPress={onIconPress}
              style={({ pressed }) => [
                styles.settingsListIconButton,
                isIconPickerOpen && styles.settingsListIconButtonActive,
                pressed && styles.settingsOptionRowPressed,
              ]}
            >
              <MaterialCommunityIcons
                color={listIconName ? THEME_ACCENT : THEME_TEXT}
                name={toMaterialCommunityIconName(renderedIconName)}
                size={17}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Tap to edit list name and search keywords."
              accessibilityLabel={label}
              onPress={onMainPress}
              style={({ pressed }) => [
                styles.settingsListMainPress,
                pressed && styles.settingsListRowPressed,
              ]}
            >
              <Text
                numberOfLines={1}
                style={styles.settingsListTitle}
              >
                {label}
              </Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: showInNavbar }}
            accessibilityLabel={
              showInNavbar
                ? `Unpin ${label} from navbar`
                : `Pin ${label} to navbar`
            }
            onPress={onPinPress}
            style={({ pressed }) => [
              styles.settingsListPinButton,
              showInNavbar && styles.settingsListPinButtonActive,
              pressed && styles.settingsOptionRowPressed,
            ]}
          >
            <Ionicons
              color={showInNavbar ? THEME_ACCENT : THEME_TEXT}
              name={showInNavbar ? 'pin' : 'pin-outline'}
              size={18}
            />
          </Pressable>
        </View>
      </Swipeable>
    </View>
  );
}

const MemoizedSettingsListSwipeRow = React.memo(SettingsListSwipeRow);

type SettingsListReorderRowProps = {
  canReorder: boolean;
  iconPickerIndex: number | null;
  index: number;
  isReorderHighlighted: boolean;
  item: ListMenuNode;
  onDelete: () => void;
  onIconPickerChange: (index: number | null) => void;
  onMainPress: () => void;
  onPinPress: () => void;
  onReorderHandlePress: (index: number) => void;
  onSetIcon: (index: number, iconName: string | null) => void;
};

function SettingsListReorderRow({
  canReorder,
  iconPickerIndex,
  index,
  isReorderHighlighted,
  item,
  onDelete,
  onIconPickerChange,
  onMainPress,
  onPinPress,
  onReorderHandlePress,
  onSetIcon,
}: SettingsListReorderRowProps) {
  const listIconName = item.iconName;
  const showInNavbar = item.showInNavbar !== false;
  const isIconPickerOpen = iconPickerIndex === index;

  return (
    <View
      style={[
        styles.settingsListGroup,
        isReorderHighlighted && styles.settingsListGroupReorderSelected,
      ]}
    >
      <View style={styles.settingsListRowSlot}>
        <View style={styles.settingsListRowWrap}>
          {canReorder ? (
            <Pressable
              accessibilityHint="Tap another list handle to swap positions."
              accessibilityLabel={`Reorder ${item.label}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isReorderHighlighted }}
              onPress={() => onReorderHandlePress(index)}
              style={({ pressed }) => [
                styles.settingsListDragHandle,
                isReorderHighlighted && styles.settingsListDragHandleSelected,
                pressed && styles.settingsOptionRowPressed,
              ]}
            >
              <Ionicons
                color={isReorderHighlighted ? THEME_ACCENT : THEME_TEXT}
                name="reorder-three"
                size={22}
              />
            </Pressable>
          ) : null}
          <View style={styles.settingsListSwipeWrap}>
            <MemoizedSettingsListSwipeRow
              isIconPickerOpen={isIconPickerOpen}
              label={item.label}
              listIconName={listIconName}
              onDelete={onDelete}
              onIconPress={() => {
                onIconPickerChange(isIconPickerOpen ? null : index);
                triggerSubtleHaptic();
              }}
              onMainPress={onMainPress}
              onPinPress={onPinPress}
              showInNavbar={showInNavbar}
            />
          </View>
        </View>
      </View>
      {isIconPickerOpen ? (
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          style={styles.settingsListIconChoicesScroll}
          contentContainerStyle={styles.settingsListIconChoices}
        >
          <View style={styles.settingsListIconChoicesHeader}>
            <Pressable
              accessibilityLabel={`Close icon picker for ${item.label}`}
              accessibilityRole="button"
              onPress={() => {
                onIconPickerChange(null);
                triggerSubtleHaptic();
              }}
              style={({ pressed }) => [
                styles.settingsListIconCloseButton,
                pressed && styles.settingsOptionRowPressed,
              ]}
            >
              <Ionicons color={THEME_TEXT} name="close" size={18} />
            </Pressable>
          </View>
          <View style={styles.settingsListIconGroupGrid}>
            <Pressable
              accessibilityLabel={`Remove icon from ${item.label}`}
              accessibilityRole="button"
              accessibilityState={{ selected: !listIconName }}
              onPress={() => onSetIcon(index, null)}
              style={({ pressed }) => [
                styles.settingsListIconChoiceButton,
                !listIconName && styles.settingsListIconChoiceButtonSelected,
                pressed && styles.settingsOptionRowPressed,
              ]}
            >
              <View style={styles.settingsListIconChoiceEmpty} />
            </Pressable>
          </View>
          {LIST_ICON_GROUPS.map((group) => (
            <View
              key={`${item.label}-${group.title}`}
              style={styles.settingsListIconGroup}
            >
              <Text style={styles.settingsListIconGroupTitle}>
                {group.title}
              </Text>
              <View style={styles.settingsListIconGroupGrid}>
                {group.icons.map((iconName) => {
                  const selected = listIconName === iconName;

                  return (
                    <Pressable
                      accessibilityLabel={`Use ${iconName} icon for ${item.label}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={`${item.label}-${group.title}-${iconName}`}
                      onPress={() => onSetIcon(index, iconName)}
                      style={({ pressed }) => [
                        styles.settingsListIconChoiceButton,
                        selected && styles.settingsListIconChoiceButtonSelected,
                        pressed && styles.settingsOptionRowPressed,
                      ]}
                    >
                      <MaterialCommunityIcons
                        color={selected ? THEME_ACCENT : THEME_TEXT}
                        name={iconName}
                        size={18}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const MemoizedSettingsListReorderRow = React.memo(SettingsListReorderRow);

const SETTINGS_LIST_SWAP_FLASH_MS = 320;

type SettingsListEditorProps = {
  iconPickerIndex: number | null;
  items: ListMenuNode[];
  onDelete: (index: number) => void;
  onIconPickerChange: (index: number | null) => void;
  onMainPress: (index: number) => void;
  onPinPress: (index: number) => void;
  onSetIcon: (index: number, iconName: string | null) => void;
  onSwap: (fromIndex: number, toIndex: number) => void;
  reorderCancelNonce: number;
};

function SettingsListEditor({
  iconPickerIndex,
  items,
  onDelete,
  onIconPickerChange,
  onMainPress,
  onPinPress,
  onSetIcon,
  onSwap,
  reorderCancelNonce,
}: SettingsListEditorProps) {
  const swapFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedReorderIndex, setSelectedReorderIndex] = useState<number | null>(null);
  const [swapFlashIndices, setSwapFlashIndices] = useState<number[]>([]);

  const clearSwapFlash = useCallback(() => {
    if (swapFlashTimeoutRef.current) {
      clearTimeout(swapFlashTimeoutRef.current);
      swapFlashTimeoutRef.current = null;
    }
    setSwapFlashIndices([]);
  }, []);

  const resetReorderSelection = useCallback(() => {
    clearSwapFlash();
    setSelectedReorderIndex(null);
  }, [clearSwapFlash]);

  useEffect(() => {
    resetReorderSelection();
  }, [reorderCancelNonce, resetReorderSelection]);

  useEffect(() => () => {
    if (swapFlashTimeoutRef.current) {
      clearTimeout(swapFlashTimeoutRef.current);
    }
  }, []);

  const handleReorderHandlePress = useCallback((index: number) => {
    onIconPickerChange(null);

    if (selectedReorderIndex === null) {
      setSelectedReorderIndex(index);
      triggerSubtleHaptic();
      return;
    }

    if (selectedReorderIndex === index) {
      resetReorderSelection();
      return;
    }

    const fromIndex = selectedReorderIndex;
    const toIndex = index;
    setSelectedReorderIndex(null);
    setSwapFlashIndices([fromIndex, toIndex]);
    onSwap(fromIndex, toIndex);
    triggerSubtleHaptic();

    if (swapFlashTimeoutRef.current) {
      clearTimeout(swapFlashTimeoutRef.current);
    }
    swapFlashTimeoutRef.current = setTimeout(() => {
      swapFlashTimeoutRef.current = null;
      setSwapFlashIndices([]);
    }, SETTINGS_LIST_SWAP_FLASH_MS);
  }, [onIconPickerChange, onSwap, resetReorderSelection, selectedReorderIndex]);

  const canReorder = items.length > 1;

  return (
    <View style={styles.settingsListEditor}>
      {items.map((item, index) => (
        <MemoizedSettingsListReorderRow
          key={item.label}
          canReorder={canReorder}
          iconPickerIndex={iconPickerIndex}
          index={index}
          isReorderHighlighted={
            selectedReorderIndex === index
            || swapFlashIndices.includes(index)
          }
          item={item}
          onDelete={() => onDelete(index)}
          onIconPickerChange={onIconPickerChange}
          onMainPress={() => onMainPress(index)}
          onPinPress={() => onPinPress(index)}
          onReorderHandlePress={handleReorderHandlePress}
          onSetIcon={onSetIcon}
        />
      ))}
    </View>
  );
}

const MemoizedSettingsListEditor = React.memo(SettingsListEditor);

type SettingsColorItem = {
  displayLabel?: string;
  filterKey: FilterColorSettingKey;
  sourceLabel: string;
  value: string;
};

type SettingsColorRowProps = SettingsColorItem & {
  onSelectColor: (
    filterKey: FilterColorSettingKey,
    value: string,
    color: string | null,
  ) => void;
  selectedAccent: string | null;
};

function SettingsColorRow({
  displayLabel,
  filterKey,
  onSelectColor,
  selectedAccent,
  sourceLabel,
  value,
}: SettingsColorRowProps) {
  const label = displayLabel ?? value;
  const selectedAccentKey = selectedAccent?.toUpperCase() ?? null;
  const noColorSelected = selectedAccent === null;

  return (
    <View style={styles.settingsColorRow}>
      <View style={styles.settingsColorLabelWrap}>
        <View
          style={[
            styles.settingsColorPreviewDot,
            selectedAccent
              ? { backgroundColor: selectedAccent }
              : styles.settingsColorPreviewDotNoColor,
          ]}
        />
        <View style={styles.settingsColorLabelTextWrap}>
          <Text
            ellipsizeMode="tail"
            numberOfLines={1}
            style={styles.settingsColorLabel}
          >
            {label}
          </Text>
          <Text
            ellipsizeMode="tail"
            numberOfLines={1}
            style={styles.settingsColorSourceLabel}
          >
            {sourceLabel}
          </Text>
        </View>
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
              selectedAccentKey &&
              swatch.accent &&
              swatch.accent.toUpperCase() === selectedAccentKey,
            );

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Set ${label} to ${swatch.label}`}
              accessibilityState={{ selected }}
              key={swatch.id}
              onPress={() => onSelectColor(filterKey, value, swatch.accent)}
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
}

const MemoizedSettingsColorRow = React.memo(SettingsColorRow);

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
  const deletedTodoDetailCardMaxHeight = useMemo(() => {
    const verticalReserve = (TOP_SAFE_GAP + 24) * 2;
    const availableHeight = Math.max(220, windowHeight - verticalReserve);

    return Math.min(420, availableHeight, Math.max(260, Math.round(availableHeight * 0.72)));
  }, [windowHeight]);
  const todoDetailContentInputMaxHeight = useMemo(() => {
    const baseMaxHeight = Math.max(176, Math.round(windowHeight * 0.42));

    if (keyboardOverlayInset > 0) {
      const chromeReserve = TOP_SAFE_GAP + 24 + 120;
      return Math.max(96, windowHeight - keyboardOverlayInset - chromeReserve);
    }

    return baseMaxHeight;
  }, [keyboardOverlayInset, windowHeight]);
  const googleDrivePickerModalLayout = useMemo(() => {
    const cardHeight = Math.round(windowHeight * 0.92);

    return { cardHeight };
  }, [windowHeight]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [searchMode, setSearchMode] = useState<SearchMode>('preset');
  const [itemSearchState, setItemSearchState] = useState<{
    ids: string[];
    query: string;
  } | null>(null);
  const [notificationTodoRevealId, setNotificationTodoRevealId] = useState<string | null>(null);
  const [createDrawerVisible, setCreateDrawerVisible] = useState(false);
  const [createDraftContent, setCreateDraftContent] = useState('');
  const [createDraftText, setCreateDraftText] = useState('');
  const [createDraftPinned, setCreateDraftPinned] = useState(false);
  const [createFromSettingsCueVisible, setCreateFromSettingsCueVisible] = useState(false);
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
  const [dateStatusKey, setDateStatusKey] = useState(() => getDateStatusKey());
  const datePickerApplyRef = useRef<'create' | 'filters'>('filters');
  const datePickerDateLabelsRef = useRef<string[]>([]);
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
  const [recentlyEditedTodoIds, setRecentlyEditedTodoIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [undoHistory, setUndoHistory] = useState<UndoHistoryEntry[]>([]);
  const [redoHistory, setRedoHistory] = useState<UndoHistoryEntry[]>([]);
  const [undoToastEntryId, setUndoToastEntryId] = useState<number | null>(null);
  const [repeatingTodoCompletionFeedbackIds, setRepeatingTodoCompletionFeedbackIds] =
    useState<Set<string>>(() => new Set());
  const [activeTodoDetailId, setActiveTodoDetailId] = useState<string | null>(null);
  const [activeTodoDetailDraftContent, setActiveTodoDetailDraftContent] = useState('');
  const [activeTodoDetailDraftText, setActiveTodoDetailDraftText] = useState('');
  const [activeTodoDetailContentSelection, setActiveTodoDetailContentSelection] = useState({
    end: 0,
    start: 0,
  });
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [filterConfigModalVisible, setFilterConfigModalVisible] = useState(false);
  const [presetSaveModalVisible, setPresetSaveModalVisible] = useState(false);
  const [presetSaveName, setPresetSaveName] = useState('');
  const [searchKeywordEditTarget, setSearchKeywordEditTarget] = useState<
    SearchKeywordEditTarget | null
  >(null);
  const [searchKeywordDraft, setSearchKeywordDraft] = useState('');
  const [searchKeywordTitleDraft, setSearchKeywordTitleDraft] = useState('');
  const searchKeywordModalVisible = searchKeywordEditTarget !== null;
  const [editingMenuPresetId, setEditingMenuPresetId] = useState<string | null>(null);
  const [openMenuPresetId, setOpenMenuPresetId] = useState<string | null>(null);
  const [openQuickPresetNavSlotNumber, setOpenQuickPresetNavSlotNumber] = useState<number | null>(
    null,
  );
  const [heldQuickPresetNavSlotNumber, setHeldQuickPresetNavSlotNumber] = useState<number | null>(
    null,
  );
  const [settingsBackupExpanded, setSettingsBackupExpanded] = useState(false);
  const [settingsColorsExpanded, setSettingsColorsExpanded] = useState(false);
  const [settingsDateLabelsExpanded, setSettingsDateLabelsExpanded] = useState(false);
  const [activeDeletedTodoDetailId, setActiveDeletedTodoDetailId] = useState<string | null>(null);
  const [settingsDeletedExpanded, setSettingsDeletedExpanded] = useState(false);
  const [settingsDoneExpanded, setSettingsDoneExpanded] = useState(false);
  const [settingsListsExpanded, setSettingsListsExpanded] = useState(false);
  const [deletedTodos, setDeletedTodos] = useState<DeletedTodo[]>([]);
  const [filterColors, setFilterColors] = useState<FilterColorSettings>(
    () => cloneFilterColors(),
  );
  const deferredFilterColors = useDeferredValue(filterColors);
  const filterColorsRef = useRef(filterColors);
  const [filterConfigUiState, setFilterConfigUiState] = useState<FilterConfigUiState>(
    () => cloneFilterConfigUiState(DEFAULT_FILTER_CONFIG_UI_STATE),
  );
  const [hideDoneTodos, setHideDoneTodos] = useState(false);
  const [dateLabelDisplayMode, setDateLabelDisplayMode] = useState<DateLabelDisplayMode>('exact');
  const [showOverdueMetaTags, setShowOverdueMetaTags] = useState(true);
  const [googleDriveBackupEnabled, setGoogleDriveBackupEnabled] = useState(false);
  const [googleDriveBusy, setGoogleDriveBusy] = useState(false);
  const [googleDriveBackupStatus, setGoogleDriveBackupStatus] = useState('Not backed up');
  const [googleDriveLastBackupAt, setGoogleDriveLastBackupAt] = useState<string | null>(null);
  const [googleDriveLastRestoreAt, setGoogleDriveLastRestoreAt] = useState<string | null>(null);
  const [googleDriveBackupPicker, setGoogleDriveBackupPicker] =
    useState<GoogleDriveBackupPickerState | null>(null);
  const [googleAuth, setGoogleAuth] = useState<StoredGoogleAuth | null>(null);
  const [listOrderMode, setListOrderMode] = useState<ListOrderMode>('alphabetical');
  const deletedTodosRef = useRef<DeletedTodo[]>([]);
  const dateLabelDisplayModeRef = useRef<DateLabelDisplayMode>(dateLabelDisplayMode);
  const googleDriveBackupPickerResolveRef = useRef<(
    (selection: GoogleDriveBackupPickerSelection) => void
  ) | null>(null);
  const googleDriveBackupPickerScrollRef = useRef<React.ComponentRef<typeof GestureScrollView>>(null);
  const googleDriveBackupEnabledRef = useRef(googleDriveBackupEnabled);
  const hideDoneTodosRef = useRef(hideDoneTodos);
  const lastCreateTodoFiltersRef = useRef<TodoFilters>(lastCreateTodoFilters);
  const listOrderModeRef = useRef<ListOrderMode>(listOrderMode);
  const listMenuTreeRef = useRef<ListMenuNode[]>([]);
  const [listMenuTree, setListMenuTree] = useState<ListMenuNode[]>(
    () => cloneListMenuTree(DEFAULT_LIST_MENU_TREE),
  );
  const [menuPresets, setMenuPresets] = useState<MenuPreset[]>([]);
  const [quickPresetNavIconNames, setQuickPresetNavIconNames] = useState<string[]>([]);
  const [quickPresetNavPresetIds, setQuickPresetNavPresetIds] = useState<Array<string | null>>([]);
  const menuPresetsRef = useRef<MenuPreset[]>([]);
  const metaTagVisibilityRef = useRef<MetaTagVisibility>(cloneMetaTagVisibility());
  const quickPresetNavIconNamesRef = useRef<string[]>([]);
  const quickPresetNavPresetIdsRef = useRef<Array<string | null>>([]);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedTodoIds, setSelectedTodoIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [todoGroupMode, setTodoGroupMode] = useState<TodoGroupMode>('none');
  const selectedFiltersRef = useRef<TodoFilters>(cloneTodoFilters());
  const requiredFiltersRef = useRef<TodoFilters>(cloneTodoFilters());
  const avoidedFiltersRef = useRef<TodoFilters>(cloneTodoFilters());
  const showOverdueMetaTagsRef = useRef(showOverdueMetaTags);
  const todoGroupModeRef = useRef<TodoGroupMode>(todoGroupMode);
  const [collapsedTodoGroupIds, setCollapsedTodoGroupIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedSearchPresetIds, setCollapsedSearchPresetIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedSearchListLabels, setCollapsedSearchListLabels] = useState<Set<string>>(
    () => new Set(),
  );
  const [toggleAllTodoSectionsRequest, setToggleAllTodoSectionsRequest] = useState(0);
  const [todoSortMode, setTodoSortMode] = useState<TodoSortMode>('newest');
  const todoSortModeRef = useRef<TodoSortMode>(todoSortMode);
  const [metaTagVisibility, setMetaTagVisibility] = useState<MetaTagVisibility>(
    () => cloneMetaTagVisibility(),
  );
  const [newListName, setNewListName] = useState('');
  const [settingsListReorderCancelNonce, setSettingsListReorderCancelNonce] = useState(0);
  const [settingsListIconPickerIndex, setSettingsListIconPickerIndex] = useState<number | null>(
    null,
  );
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<SelectedFilters>(
    EMPTY_SELECTED_FILTERS,
  );
  const [requiredFilters, setRequiredFilters] = useState<SelectedFilters>(
    () => cloneTodoFilters(),
  );
  const [avoidedFilters, setAvoidedFilters] = useState<SelectedFilters>(
    () => cloneTodoFilters(),
  );
  const [todoListFrameHeight, setTodoListFrameHeight] = useState(0);
  const searchInputRef = useRef<TextInput>(null);
  const suppressHeaderSearchFocusRef = useRef(false);
  const suppressHeaderSearchFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createContentInputRef = useRef<TextInput>(null);
  const createInputRef = useRef<TextInput>(null);
  const presetSaveInputRef = useRef<TextInput>(null);
  const presetSearchKeywordInputRef = useRef<TextInput>(null);
  const listSearchKeywordTitleInputRef = useRef<TextInput>(null);
  const todoDetailContentInputRef = useRef<TextInput>(null);
  const todoDetailDraftTodoIdRef = useRef<string | null>(null);
  const listMenuRef = useRef<GestureFlatList<BottomMenuItem> | null>(null);
  const todoListRef = useRef<FlashListRef<AppTodoListRow> | null>(null);
  const searchRequestIdRef = useRef(0);
  const scrollOffsetY = useRef(0);
  const actualScrollOffsetY = useRef(0);
  const listMenuScrollOffsetY = useRef(0);
  const menuPullAnim = useRef(new Animated.Value(0)).current;
  const menuModeRef = useRef<MenuMode | null>(null);
  const activeTodoMenuIdRef = useRef<string | null>(null);
  const listMenuOpenRef = useRef(false);
  const pendingTodoMenuHighlightRef = useRef<{ id: string; offset: number } | null>(null);
  const pendingMenuEditedTodoIdsRef = useRef<Set<string>>(new Set());
  const todoMenuReturnOffsetRef = useRef<number | null>(null);
  const todoMenuHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newlyCreatedTodoHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editedTodoHighlightTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const filterConfigUndoSnapshotRef = useRef<UndoSnapshot | null>(null);
  const filterConfigUndoPendingRef = useRef(false);
  const filterConfigUndoLabelRef = useRef('Change filters');
  const undoHistorySequenceRef = useRef(0);
  const todoAlarmResumeSyncAtRef = useRef(0);
  const repeatingTodoCompletionFeedbackIdsRef = useRef<Set<string>>(new Set());
  const repeatingTodoCompletionTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const todosRef = useRef<Todo[]>(todos);
  const loadedRef = useRef(loaded);
  const pendingDeleteIdsRef = useRef<Set<string>>(pendingDeleteIds);
  const pendingTodoAlarmOpenIdRef = useRef<string | null>(null);
  const googleDriveBusyRef = useRef(googleDriveBusy);
  const autoBackupInFlightRef = useRef(false);
  const autoBackupFailedStateKeyRef = useRef<string | null>(null);
  const autoBackupStateKeyRef = useRef<string | null>(null);
  todosRef.current = todos;
  dateLabelDisplayModeRef.current = dateLabelDisplayMode;
  deletedTodosRef.current = deletedTodos;
  googleDriveBackupEnabledRef.current = googleDriveBackupEnabled;
  hideDoneTodosRef.current = hideDoneTodos;
  lastCreateTodoFiltersRef.current = lastCreateTodoFilters;
  listMenuTreeRef.current = listMenuTree;
  listOrderModeRef.current = listOrderMode;
  menuPresetsRef.current = menuPresets;
  metaTagVisibilityRef.current = metaTagVisibility;
  quickPresetNavIconNamesRef.current = quickPresetNavIconNames;
  quickPresetNavPresetIdsRef.current = quickPresetNavPresetIds;
  selectedFiltersRef.current = selectedFilters;
  requiredFiltersRef.current = requiredFilters;
  avoidedFiltersRef.current = avoidedFilters;
  showOverdueMetaTagsRef.current = showOverdueMetaTags;
  todoGroupModeRef.current = todoGroupMode;
  todoSortModeRef.current = todoSortMode;
  filterColorsRef.current = filterColors;
  loadedRef.current = loaded;
  pendingDeleteIdsRef.current = pendingDeleteIds;
  repeatingTodoCompletionFeedbackIdsRef.current = repeatingTodoCompletionFeedbackIds;
  googleDriveBusyRef.current = googleDriveBusy;
  const menuDismissPullRef = useRef(0);
  const menuDismissHapticRef = useRef(0);
  const didApplyTodoListInitialOffsetRef = useRef(false);
  const hadTodoListRowsRef = useRef(false);
  const devTestTodosSeededRef = useRef(false);
  const listTouchStartRef = useRef({ pageX: 0, pageY: 0, timestamp: 0 });
  const todoRowTouchStartRef = useRef({
    pageX: 0,
    pageY: 0,
    timestamp: 0,
    id: null as string | null,
  });
  const lastListTapRef = useRef({ pageX: 0, pageY: 0, timestamp: 0 });
  const lastRegisteredListTapRef = useRef({ pageX: 0, pageY: 0, timestamp: 0 });
  const lastFilterNavTapRef = useRef(0);
  const lastSearchNavTapRef = useRef(0);
  const handledToggleAllTodoSectionsRequestRef = useRef(0);
  const lastQuickPresetNavTapRef = useRef({ presetId: '', timestamp: 0 });
  const quickPresetNavPressInRef = useRef<string | null>(null);
  const pendingSearchPresetScrollOffsetRef = useRef<number | null>(null);
  const savedSearchScrollOffsetRef = useRef<number | null>(null);
  const searchScrollOffsetsByModeRef = useRef<Record<SearchMode, number | null>>({
    item: null,
    preset: null,
  });
  const itemSearchResultsCacheRef = useRef(new Map<string, string[]>());
  const previousSearchModeRef = useRef<SearchMode>('preset');
  const skipNextTodoListOffsetEffectRef = useRef(false);
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
  const dateStatusNow = useMemo(() => new Date(), [dateStatusKey]);
  const activeTodoCount = Math.max(0, todos.length - pendingDeleteIds.size);
  const undoHistoryCount = undoHistory.length;
  const redoHistoryCount = redoHistory.length;
  const historyButtonMode: 'redo' | 'undo' = redoHistoryCount > 0 ? 'redo' : 'undo';
  const historyButtonCount = historyButtonMode === 'redo' ? redoHistoryCount : undoHistoryCount;
  const historyButtonDisabled = historyButtonCount === 0;
  const historyButtonText = historyButtonMode === 'redo' ? 'Redo' : 'Undo';
  const historyButtonIcon = historyButtonMode === 'redo' ? 'arrow-redo' : 'arrow-undo';
  const undoToastEntry = undoToastEntryId === null
    ? null
    : undoHistory.find((entry) => entry.id === undoToastEntryId) ?? undoHistory[0] ?? null;
  const getInstantPressHandlers = useInstantPress();

  const clearNotificationTodoReveal = useCallback(() => {
    setNotificationTodoRevealId(null);
  }, []);

  const handleSearchQueryChange = useCallback((nextQuery: string) => {
    clearNotificationTodoReveal();
    setQuery(nextQuery);
  }, [clearNotificationTodoReveal]);

  const handleSearchModeChange = useCallback((nextMode: SearchMode) => {
    if (nextMode === searchMode) {
      return;
    }

    clearNotificationTodoReveal();

    if (navTab === 'search') {
      searchScrollOffsetsByModeRef.current[searchMode] = actualScrollOffsetY.current;
      skipNextTodoListOffsetEffectRef.current = true;
    }

    if (nextMode === 'item') {
      const trimmedQuery = query.trim();

      if (trimmedQuery) {
        const cachedIds = itemSearchResultsCacheRef.current.get(trimmedQuery);

        if (cachedIds) {
          setItemSearchState({ ids: cachedIds, query: trimmedQuery });
        }
      }
    }

    setSearchMode(nextMode);
    triggerSubtleHaptic();
  }, [clearNotificationTodoReveal, navTab, query, searchMode]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const refreshDateStatus = () => {
      setDateStatusKey(getDateStatusKey());
    };

    const scheduleRefresh = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      refreshTimer = setTimeout(() => {
        refreshDateStatus();
        scheduleRefresh();
      }, getMillisecondsUntilNextDateStatusRefresh());
    };

    scheduleRefresh();

    const refreshDateStatusOnActive = (nextState: AppStateStatus) => {
      if (nextState !== 'active') {
        return;
      }

      refreshDateStatus();
      scheduleRefresh();
    };

    const subscription = AppState.addEventListener('change', refreshDateStatusOnActive);

    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const loadTodos = async () => {
      const storedTodos = await localTodoStore.load();
      const cleanedTodos = removeInitialSeedTodos(storedTodos);

      if (cleanedTodos.length !== storedTodos.length) {
        await localTodoStore.replaceAll(cleanedTodos);
        return cleanedTodos;
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
    const syncAlarmsOnActive = (nextState: AppStateStatus) => {
      if (nextState !== 'active' || !loadedRef.current) {
        return;
      }

      const now = Date.now();
      if (now - todoAlarmResumeSyncAtRef.current < 1000) {
        return;
      }

      todoAlarmResumeSyncAtRef.current = now;
      reconcileTodoAlarms(todosRef.current).catch(() => undefined);
    };

    const subscription = AppState.addEventListener('change', syncAlarmsOnActive);
    return () => {
      subscription.remove();
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
        const nextRequiredFilters = pruneTodoFilters(
          settings.requiredFilters,
          settings.selectedFilters,
        );

        setSelectedFilters(settings.selectedFilters);
        setRequiredFilters(nextRequiredFilters);
        setAvoidedFilters(settings.avoidedFilters);
        setDeletedTodos(settings.deletedTodos);
        setFilterConfigUiState(cloneFilterConfigUiState(settings.filterConfigUiState));
        setFilterColors(settings.filterColors);
        setGoogleDriveBackupEnabled(settings.googleDriveBackupEnabled);
        setGoogleDriveLastBackupAt(settings.googleDriveLastBackupAt);
        setGoogleDriveLastRestoreAt(settings.googleDriveLastRestoreAt);
        setHideDoneTodos(settings.hideDoneTodos);
        setDateLabelDisplayMode(settings.dateLabelDisplayMode);
        setShowOverdueMetaTags(settings.showOverdueMetaTags);
        setListMenuTree(cloneListMenuTree(settings.listMenuTree));
        setListOrderMode(settings.listOrderMode);
        setMenuPresets(cloneMenuPresets(settings.menuPresets));
        setQuickPresetNavIconNames(cloneQuickPresetNavIconNames(settings.quickPresetNavIconNames));
        setQuickPresetNavPresetIds(cloneQuickPresetNavPresetIds(settings.quickPresetNavPresetIds));
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
    filterConfigUiState,
    filterColors,
    googleDriveBackupEnabled,
    googleDriveLastBackupAt,
    googleDriveLastRestoreAt,
    dateLabelDisplayMode,
    hideDoneTodos,
    lastCreateTodoFilters,
    listOrderMode,
    menuPresets,
    metaTagVisibility,
    quickPresetDefaultsVersion: QUICK_PRESET_DEFAULTS_VERSION,
    quickPresetNavIconNames,
    quickPresetNavPresetIds,
    avoidedFilters,
    requiredFilters: pruneTodoFilters(requiredFilters, selectedFilters),
    selectedFilters,
    showOverdueMetaTags,
    todoGroupMode,
    todoSortMode,
    ...overrides,
    listMenuTree: cloneListMenuTree(
      overrides.listMenuTree ?? listMenuTree,
    ),
  }), [
    collapsedTodoGroupIds,
    dateLabelDisplayMode,
    deletedTodos,
    filterConfigUiState,
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
    quickPresetNavIconNames,
    quickPresetNavPresetIds,
    avoidedFilters,
    requiredFilters,
    selectedFilters,
    showOverdueMetaTags,
    todoGroupMode,
    todoSortMode,
  ]);

  const persistAppSettings = useCallback((
    overrides: Partial<AppSettings> = {},
  ) => {
    if (!settingsLoaded) {
      return Promise.resolve();
    }

    return appSettingsStore.save(createSettingsSnapshot(overrides)).catch(() => undefined);
  }, [createSettingsSnapshot, settingsLoaded]);

  const persistListMenuTree = useCallback((tree: ListMenuNode[]) => {
    persistAppSettings({ listMenuTree: cloneListMenuTree(tree) });
  }, [persistAppSettings]);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    const saveTimer = setTimeout(() => {
      persistAppSettings();
    }, SETTINGS_SAVE_DEBOUNCE_MS);

    return () => clearTimeout(saveTimer);
  }, [
    persistAppSettings,
    settingsLoaded,
    createSettingsSnapshot,
  ]);

  const autoBackupStateKey = useMemo(() => {
    if (!loaded || !settingsLoaded) {
      return null;
    }

    const backupTodos = todos.filter((todo) => !pendingDeleteIds.has(todo.id));
    const backupSettings = createSettingsSnapshot({
      googleDriveLastBackupAt: null,
      googleDriveLastRestoreAt: null,
    });

    return JSON.stringify({
      settings: backupSettings,
      todos: backupTodos,
    });
  }, [
    createSettingsSnapshot,
    loaded,
    pendingDeleteIds,
    settingsLoaded,
    todos,
  ]);

  const devTestTodoCount = useMemo(
    () => todos.filter(isDevTestTodo).length,
    [todos],
  );
  const devTestMenuPresetCount = useMemo(
    () => menuPresets.filter(isDevTestMenuPreset).length,
    [menuPresets],
  );
  const devTestListMenuNodeCount = useMemo(
    () => countDevTestListMenuNodes(listMenuTree),
    [listMenuTree],
  );

  const seedDevTestSettings = useCallback(() => {
    const seededListMenuTree = mergeDevTestListMenuTree(listMenuTreeRef.current);
    const seededListLabels = collectListNodeLabels(seededListMenuTree);
    const seededMenuPresets = mergeDevTestMenuPresets(
      menuPresetsRef.current,
      seededListLabels,
    );

    listMenuTreeRef.current = seededListMenuTree;
    menuPresetsRef.current = seededMenuPresets;
    setListMenuTree(seededListMenuTree);
    setListOrderMode('manual');
    setMenuPresets(seededMenuPresets);
    void persistAppSettings({
      listMenuTree: seededListMenuTree,
      listOrderMode: 'manual',
      menuPresets: seededMenuPresets,
    });

    return seededListLabels;
  }, [persistAppSettings]);

  useEffect(() => {
    if (!isDevAppVariant || !loaded || !settingsLoaded || devTestTodosSeededRef.current) {
      return;
    }

    devTestTodosSeededRef.current = true;

    if (todosRef.current.length > 0 || todosRef.current.some(isDevTestTodo)) {
      return;
    }

    const testTodos = createDevTestTodos(seedDevTestSettings());
    setTodos((current) => {
      if (current.length > 0 || current.some(isDevTestTodo)) {
        return current;
      }

      localTodoStore.upsertMany(testTodos).catch(() => undefined);
      reconcileTodoAlarms(testTodos).catch(() => undefined);
      return testTodos;
    });
  }, [loaded, seedDevTestSettings, settingsLoaded]);

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

  const clearEditedTodoHighlights = useCallback((ids: Iterable<string>) => {
    const targetIds = [...ids];

    if (targetIds.length === 0) {
      return;
    }

    targetIds.forEach((id) => pendingMenuEditedTodoIdsRef.current.delete(id));
    targetIds.forEach((id) => {
      const timer = editedTodoHighlightTimersRef.current.get(id);

      if (timer) {
        clearTimeout(timer);
        editedTodoHighlightTimersRef.current.delete(id);
      }
    });

    setRecentlyEditedTodoIds((current) => {
      if (!targetIds.some((id) => current.has(id))) {
        return current;
      }

      const next = new Set(current);
      targetIds.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  const startEditedTodoHighlights = useCallback((ids: Iterable<string>) => {
    const targetIds = [...new Set(ids)]
      .filter((id) => !pendingDeleteIdsRef.current.has(id));

    if (targetIds.length === 0) {
      return;
    }

    setRecentlyEditedTodoIds((current) => {
      const next = new Set(current);
      targetIds.forEach((id) => next.add(id));
      return next;
    });

    targetIds.forEach((id) => {
      const existingTimer = editedTodoHighlightTimersRef.current.get(id);

      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(() => {
        editedTodoHighlightTimersRef.current.delete(id);
        setRecentlyEditedTodoIds((current) => {
          if (!current.has(id)) {
            return current;
          }

          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }, EDITED_TODO_HIGHLIGHT_DURATION_MS);

      editedTodoHighlightTimersRef.current.set(id, timer);
    });
  }, []);

  const highlightEditedTodos = useCallback((ids: Iterable<string>) => {
    const targetIds = [...new Set(ids)]
      .filter((id) => !pendingDeleteIdsRef.current.has(id));

    if (targetIds.length === 0) {
      return;
    }

    if (listMenuOpenRef.current) {
      targetIds.forEach((id) => {
        pendingMenuEditedTodoIdsRef.current.add(id);
      });
      return;
    }

    startEditedTodoHighlights(targetIds);
  }, [startEditedTodoHighlights]);

  const captureUndoSnapshot = useCallback((): UndoSnapshot => ({
    dateLabelDisplayMode: dateLabelDisplayModeRef.current,
    deletedTodos: cloneDeletedTodos(deletedTodosRef.current),
    filterColors: cloneFilterColors(filterColorsRef.current),
    googleDriveBackupEnabled: googleDriveBackupEnabledRef.current,
    hideDoneTodos: hideDoneTodosRef.current,
    lastCreateTodoFilters: cloneTodoFilters(lastCreateTodoFiltersRef.current),
    listMenuTree: cloneListMenuTree(listMenuTreeRef.current),
    listOrderMode: listOrderModeRef.current,
    menuPresets: cloneMenuPresets(menuPresetsRef.current),
    metaTagVisibility: cloneMetaTagVisibility(metaTagVisibilityRef.current),
    quickPresetNavIconNames: cloneQuickPresetNavIconNames(quickPresetNavIconNamesRef.current),
    quickPresetNavPresetIds: cloneQuickPresetNavPresetIds(quickPresetNavPresetIdsRef.current),
    avoidedFilters: cloneTodoFilters(avoidedFiltersRef.current),
    requiredFilters: pruneTodoFilters(requiredFiltersRef.current, selectedFiltersRef.current),
    selectedFilters: cloneTodoFilters(selectedFiltersRef.current),
    showOverdueMetaTags: showOverdueMetaTagsRef.current,
    todoGroupMode: todoGroupModeRef.current,
    todoSortMode: todoSortModeRef.current,
    todos: todosRef.current.map(cloneTodo),
  }), []);

  const clearUndoToast = useCallback(() => {
    setUndoToastEntryId(null);
  }, []);

  const createUndoHistoryEntry = useCallback((
    label: string,
    snapshot: UndoSnapshot,
  ): UndoHistoryEntry => {
    const entryId = undoHistorySequenceRef.current + 1;
    undoHistorySequenceRef.current = entryId;

    return {
      id: entryId,
      label,
      snapshot,
    };
  }, []);

  const recordUndoSnapshot = useCallback((
    label: string,
    snapshot: UndoSnapshot,
    options: { showToast?: boolean } = {},
  ) => {
    const entry = createUndoHistoryEntry(label, snapshot);

    setUndoHistory((current) => [entry, ...current].slice(0, UNDO_HISTORY_LIMIT));
    setRedoHistory([]);
    if (options.showToast ?? undoLabelUsesToast(label)) {
      setUndoToastEntryId(entry.id);
    } else {
      setUndoToastEntryId(null);
    }
  }, [createUndoHistoryEntry]);

  const recordUndo = useCallback((label: string, options: { showToast?: boolean } = {}) => {
    recordUndoSnapshot(label, captureUndoSnapshot(), options);
  }, [captureUndoSnapshot, recordUndoSnapshot]);

  const beginFilterConfigUndoBatch = useCallback(() => {
    if (filterConfigUndoSnapshotRef.current) {
      return;
    }

    filterConfigUndoSnapshotRef.current = captureUndoSnapshot();
    filterConfigUndoPendingRef.current = false;
    filterConfigUndoLabelRef.current = 'Change filters';
  }, [captureUndoSnapshot]);

  const recordFilterConfigUndo = useCallback((label: string) => {
    if (filterConfigUndoSnapshotRef.current) {
      filterConfigUndoPendingRef.current = true;
      filterConfigUndoLabelRef.current = label;
      return;
    }

    recordUndo(label);
  }, [recordUndo]);

  const flushFilterConfigUndoBatch = useCallback(() => {
    const snapshot = filterConfigUndoSnapshotRef.current;
    const shouldRecordUndo = filterConfigUndoPendingRef.current;
    const label = filterConfigUndoLabelRef.current;

    filterConfigUndoSnapshotRef.current = null;
    filterConfigUndoPendingRef.current = false;
    filterConfigUndoLabelRef.current = 'Change filters';

    if (snapshot && shouldRecordUndo) {
      recordUndoSnapshot(label, snapshot);
    }
  }, [recordUndoSnapshot]);

  useLayoutEffect(() => {
    if (listMenuOpen) {
      beginFilterConfigUndoBatch();
    }
  }, [beginFilterConfigUndoBatch, listMenuOpen]);

  const flushPendingMenuEditedTodoHighlights = useCallback(() => {
    const targetIds = [...pendingMenuEditedTodoIdsRef.current]
      .filter((id) => !pendingDeleteIdsRef.current.has(id));

    pendingMenuEditedTodoIdsRef.current.clear();

    if (targetIds.length > 0) {
      startEditedTodoHighlights(targetIds);
    }
  }, [startEditedTodoHighlights]);

  const clearRepeatingTodoCompletionFeedback = useCallback((id: string) => {
    const timer = repeatingTodoCompletionTimersRef.current.get(id);

    if (timer) {
      clearTimeout(timer);
      repeatingTodoCompletionTimersRef.current.delete(id);
    }

    setRepeatingTodoCompletionFeedbackIds((current) => {
      if (!current.has(id)) {
        return current;
      }

      const next = new Set(current);
      next.delete(id);
      repeatingTodoCompletionFeedbackIdsRef.current = next;
      return next;
    });
  }, []);

  const clearAllRepeatingTodoCompletionFeedback = useCallback(() => {
    repeatingTodoCompletionTimersRef.current.forEach(clearTimeout);
    repeatingTodoCompletionTimersRef.current.clear();
    repeatingTodoCompletionFeedbackIdsRef.current = new Set();
    setRepeatingTodoCompletionFeedbackIds(new Set());
  }, []);

  const restoreUndoSnapshot = useCallback((snapshot: UndoSnapshot) => {
    const restoredTodos = snapshot.todos.map(cloneTodo);
    const restoredDeletedTodos = cloneDeletedTodos(snapshot.deletedTodos);
    const restoredFilterColors = cloneFilterColors(snapshot.filterColors);
    const restoredLastCreateTodoFilters = cloneTodoFilters(snapshot.lastCreateTodoFilters);
    const restoredListMenuTree = cloneListMenuTree(snapshot.listMenuTree);
    const restoredMenuPresets = cloneMenuPresets(snapshot.menuPresets);
    const restoredMetaTagVisibility = cloneMetaTagVisibility(snapshot.metaTagVisibility);
    const restoredQuickPresetNavIconNames = cloneQuickPresetNavIconNames(
      snapshot.quickPresetNavIconNames,
    );
    const restoredQuickPresetNavPresetIds = cloneQuickPresetNavPresetIds(
      snapshot.quickPresetNavPresetIds,
    );
    const restoredSelectedFilters = cloneTodoFilters(snapshot.selectedFilters);
    const restoredAvoidedFilters = cloneTodoFilters(snapshot.avoidedFilters);
    const restoredRequiredFilters = pruneTodoFilters(
      snapshot.requiredFilters,
      restoredSelectedFilters,
    );
    const restoredTodoIds = new Set(restoredTodos.map((todo) => todo.id));
    const restoredDeletedTodoIds = new Set(restoredDeletedTodos.map((todo) => todo.id));
    const restoredPresetIds = new Set(restoredMenuPresets.map((preset) => preset.id));
    const restoredSettings = createSettingsSnapshot({
      dateLabelDisplayMode: snapshot.dateLabelDisplayMode,
      deletedTodos: restoredDeletedTodos,
      filterColors: restoredFilterColors,
      googleDriveBackupEnabled: snapshot.googleDriveBackupEnabled,
      hideDoneTodos: snapshot.hideDoneTodos,
      lastCreateTodoFilters: restoredLastCreateTodoFilters,
      listMenuTree: restoredListMenuTree,
      listOrderMode: snapshot.listOrderMode,
      menuPresets: restoredMenuPresets,
      metaTagVisibility: restoredMetaTagVisibility,
      quickPresetNavIconNames: restoredQuickPresetNavIconNames,
      quickPresetNavPresetIds: restoredQuickPresetNavPresetIds,
      avoidedFilters: restoredAvoidedFilters,
      requiredFilters: restoredRequiredFilters,
      selectedFilters: restoredSelectedFilters,
      showOverdueMetaTags: snapshot.showOverdueMetaTags,
      todoGroupMode: snapshot.todoGroupMode,
      todoSortMode: snapshot.todoSortMode,
    });

    autoBackupFailedStateKeyRef.current = null;
    autoBackupStateKeyRef.current = null;
    todosRef.current = restoredTodos;
    deletedTodosRef.current = restoredDeletedTodos;
    filterColorsRef.current = restoredFilterColors;
    googleDriveBackupEnabledRef.current = snapshot.googleDriveBackupEnabled;
    hideDoneTodosRef.current = snapshot.hideDoneTodos;
    lastCreateTodoFiltersRef.current = restoredLastCreateTodoFilters;
    listMenuTreeRef.current = restoredListMenuTree;
    listOrderModeRef.current = snapshot.listOrderMode;
    menuPresetsRef.current = restoredMenuPresets;
    metaTagVisibilityRef.current = restoredMetaTagVisibility;
    quickPresetNavIconNamesRef.current = restoredQuickPresetNavIconNames;
    quickPresetNavPresetIdsRef.current = restoredQuickPresetNavPresetIds;
    selectedFiltersRef.current = restoredSelectedFilters;
    requiredFiltersRef.current = restoredRequiredFilters;
    avoidedFiltersRef.current = restoredAvoidedFilters;
    showOverdueMetaTagsRef.current = snapshot.showOverdueMetaTags;
    todoGroupModeRef.current = snapshot.todoGroupMode;
    todoSortModeRef.current = snapshot.todoSortMode;
    pendingDeleteIdsRef.current = new Set();

    clearAllRepeatingTodoCompletionFeedback();
    setPendingDeleteIds(new Set());
    setTodos(restoredTodos);
    setDeletedTodos(restoredDeletedTodos);
    setFilterColors(restoredFilterColors);
    setGoogleDriveBackupEnabled(snapshot.googleDriveBackupEnabled);
    setHideDoneTodos(snapshot.hideDoneTodos);
    setDateLabelDisplayMode(snapshot.dateLabelDisplayMode);
    setShowOverdueMetaTags(snapshot.showOverdueMetaTags);
    setLastCreateTodoFilters(restoredLastCreateTodoFilters);
    setListMenuTree(restoredListMenuTree);
    setListOrderMode(snapshot.listOrderMode);
    setMenuPresets(restoredMenuPresets);
    setMetaTagVisibility(restoredMetaTagVisibility);
    setQuickPresetNavIconNames(restoredQuickPresetNavIconNames);
    setQuickPresetNavPresetIds(restoredQuickPresetNavPresetIds);
    setSelectedFilters(restoredSelectedFilters);
    setRequiredFilters(restoredRequiredFilters);
    setAvoidedFilters(restoredAvoidedFilters);
    setTodoGroupMode(snapshot.todoGroupMode);
    setTodoSortMode(snapshot.todoSortMode);
    setActiveTodoMenuId((current) => (current && restoredTodoIds.has(current) ? current : null));
    setActiveTodoDetailId((current) => (current && restoredTodoIds.has(current) ? current : null));
    setActiveDeletedTodoDetailId((current) => (
      current && restoredDeletedTodoIds.has(current) ? current : null
    ));
    setSelectedTodoIds((current) => {
      const next = new Set([...current].filter((id) => restoredTodoIds.has(id)));
      return next.size === current.size ? current : next;
    });
    setEditingMenuPresetId((current) => (
      current && restoredPresetIds.has(current) ? current : null
    ));
    setOpenMenuPresetId((current) => (
      current && restoredPresetIds.has(current) ? current : null
    ));
    setOpenQuickPresetNavSlotNumber(null);

    localTodoStore.replaceAll(restoredTodos).catch(() => undefined);
    appSettingsStore.save(restoredSettings).catch(() => undefined);
    reconcileTodoAlarms(restoredTodos).catch(() => undefined);
    itemSearchResultsCacheRef.current.clear();
  }, [clearAllRepeatingTodoCompletionFeedback, createSettingsSnapshot]);

  const undoLastChange = useCallback(() => {
    const [entry] = undoHistory;

    if (!entry) {
      clearUndoToast();
      return;
    }

    const redoEntry = createUndoHistoryEntry(entry.label, captureUndoSnapshot());

    restoreUndoSnapshot(entry.snapshot);
    setUndoHistory((current) => (
      current[0]?.id === entry.id
        ? current.slice(1)
        : current.filter((item) => item.id !== entry.id)
    ));
    setRedoHistory((current) => [redoEntry, ...current].slice(0, UNDO_HISTORY_LIMIT));
    clearUndoToast();
    triggerSubtleHaptic();
  }, [
    captureUndoSnapshot,
    clearUndoToast,
    createUndoHistoryEntry,
    restoreUndoSnapshot,
    undoHistory,
  ]);

  const redoLastChange = useCallback(() => {
    const [entry] = redoHistory;

    if (!entry) {
      return;
    }

    const undoEntry = createUndoHistoryEntry(entry.label, captureUndoSnapshot());

    restoreUndoSnapshot(entry.snapshot);
    setRedoHistory((current) => (
      current[0]?.id === entry.id
        ? current.slice(1)
        : current.filter((item) => item.id !== entry.id)
    ));
    setUndoHistory((current) => [undoEntry, ...current].slice(0, UNDO_HISTORY_LIMIT));
    clearUndoToast();
    triggerSubtleHaptic();
  }, [
    captureUndoSnapshot,
    clearUndoToast,
    createUndoHistoryEntry,
    redoHistory,
    restoreUndoSnapshot,
  ]);

  const scheduleRepeatingTodoRollForward = useCallback((id: string) => {
    clearRepeatingTodoCompletionFeedback(id);

    setRepeatingTodoCompletionFeedbackIds((current) => {
      const next = new Set(current);
      next.add(id);
      repeatingTodoCompletionFeedbackIdsRef.current = next;
      return next;
    });
    highlightEditedTodos([id]);
    cancelTodoAlarm(id).catch(() => undefined);

    const timer = setTimeout(() => {
      repeatingTodoCompletionTimersRef.current.delete(id);

      setRepeatingTodoCompletionFeedbackIds((current) => {
        if (!current.has(id)) {
          return current;
        }

        const next = new Set(current);
        next.delete(id);
        repeatingTodoCompletionFeedbackIdsRef.current = next;
        return next;
      });

      const currentTodo = todosRef.current.find((todo) => todo.id === id);
      if (!currentTodo || pendingDeleteIdsRef.current.has(id)) {
        return;
      }

      const nextRepeatingTodo = advanceRepeatingTodoAfterDone(currentTodo);
      if (!nextRepeatingTodo) {
        const completedTodo = { ...currentTodo, done: true };
        setTodos((current) => current.map((todo) => (
          todo.id === id ? completedTodo : todo
        )));
        localTodoStore.updateDone(id, true).catch(() => undefined);
        syncTodoAlarm(completedTodo).catch(() => undefined);
        return;
      }

      setTodos((current) => current.map((todo) => (
        todo.id === id ? nextRepeatingTodo : todo
      )));
      localTodoStore.upsert(nextRepeatingTodo).catch(() => undefined);
      syncTodoAlarm(nextRepeatingTodo).catch(() => undefined);
    }, REPEATING_TODO_COMPLETION_FEEDBACK_MS);

    repeatingTodoCompletionTimersRef.current.set(id, timer);
  }, [clearRepeatingTodoCompletionFeedback, highlightEditedTodos]);

  useEffect(
    () => () => {
      editedTodoHighlightTimersRef.current.forEach(clearTimeout);
      editedTodoHighlightTimersRef.current.clear();
      repeatingTodoCompletionTimersRef.current.forEach(clearTimeout);
      repeatingTodoCompletionTimersRef.current.clear();
      if (suppressHeaderSearchFocusTimerRef.current) {
        clearTimeout(suppressHeaderSearchFocusTimerRef.current);
        suppressHeaderSearchFocusTimerRef.current = null;
      }
    },
    [],
  );

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
    flushFilterConfigUndoBatch();
    clearTodoMenuHighlightRequest();
    setMenuMode(null);
    setEditingMenuPresetId(null);
    setActiveTodoMenuId(null);
    setActiveTodoMenuHighlightId(null);
    flushPendingMenuEditedTodoHighlights();
    restoreTodoMenuReturnOffset();
    menuPullAnim.setValue(0);
    menuDismissPullRef.current = 0;
    menuDismissHapticRef.current = 0;
  }, [
    clearTodoMenuHighlightRequest,
    flushFilterConfigUndoBatch,
    flushPendingMenuEditedTodoHighlights,
    menuPullAnim,
    restoreTodoMenuReturnOffset,
  ]);

  const closeListMenu = useCallback(() => {
    closeListMenuState();
    triggerSubtleHaptic();
  }, [closeListMenuState]);

  const exitTodoSelectMode = useCallback(() => {
    setSelectedTodoIds(new Set());
  }, []);

  const suppressNextHeaderSearchFocus = useCallback(() => {
    suppressHeaderSearchFocusRef.current = true;

    if (suppressHeaderSearchFocusTimerRef.current) {
      clearTimeout(suppressHeaderSearchFocusTimerRef.current);
    }

    suppressHeaderSearchFocusTimerRef.current = setTimeout(() => {
      suppressHeaderSearchFocusRef.current = false;
      suppressHeaderSearchFocusTimerRef.current = null;
    }, 900);
  }, []);

  const enterTodoSelectMode = useCallback((id: string) => {
    closeListMenuState();
    setSettingsModalVisible(false);
    setActiveTodoDetailId(null);
    setActiveTodoDetailDraftContent('');
    setActiveTodoDetailDraftText('');
    setActiveTodoDetailContentSelection({ end: 0, start: 0 });
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
    suppressNextHeaderSearchFocus();
    Keyboard.dismiss();
    setActiveTodoDetailId(null);
    setActiveTodoDetailDraftContent('');
    setActiveTodoDetailDraftText('');
    setActiveTodoDetailContentSelection({ end: 0, start: 0 });
    todoDetailDraftTodoIdRef.current = null;
    triggerSubtleHaptic();
  }, [suppressNextHeaderSearchFocus]);

  const closeDeletedTodoDetailModal = useCallback(() => {
    setActiveDeletedTodoDetailId(null);
    triggerSubtleHaptic();
  }, []);

  const openDeletedTodoDetailModal = useCallback((id: string) => {
    setActiveDeletedTodoDetailId(id);
    triggerSubtleHaptic();
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
    setActiveTodoDetailContentSelection({ end: 0, start: 0 });
    setActiveTodoDetailDraftContent(formatTodoDetailDraftContentForEditing(todo?.content ?? ''));
    setActiveTodoDetailDraftText(todo?.text ?? '');
    todoDetailDraftTodoIdRef.current = id;
    setActiveTodoDetailId(id);
    triggerSubtleHaptic();
  }, [
    closeListMenu,
    exitTodoSelectMode,
    listMenuOpen,
    pendingDeleteIds,
    todos,
  ]);

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
    triggerSubtleHaptic();
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
        triggerSubtleHaptic();
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
    Keyboard.dismiss();
    searchInputRef.current?.blur();
    void persistAppSettings();
    setSettingsModalVisible(false);
    setNavTab((current) => (current === 'settings' ? null : current));
    triggerSubtleHaptic();
  }, [persistAppSettings]);

  const closeFilterConfigModal = useCallback(() => {
    flushFilterConfigUndoBatch();
    setFilterConfigModalVisible(false);
    setNavTab((current) => (current === 'calendar' ? null : current));
    triggerSubtleHaptic();
  }, [flushFilterConfigUndoBatch]);

  const openFilterConfigModal = useCallback(() => {
    Keyboard.dismiss();
    closeListMenuState();
    setSettingsModalVisible(false);
    beginFilterConfigUndoBatch();
    setFilterConfigModalVisible(true);
    triggerSubtleHaptic();
  }, [beginFilterConfigUndoBatch, closeListMenuState]);

  const closePresetSaveModal = useCallback(() => {
    Keyboard.dismiss();
    setPresetSaveModalVisible(false);
    setPresetSaveName('');
  }, []);

  const closeSearchKeywordModal = useCallback(() => {
    Keyboard.dismiss();
    setSearchKeywordEditTarget(null);
    setSearchKeywordDraft('');
    setSearchKeywordTitleDraft('');
  }, []);

  const resolveGoogleDriveBackupPicker = useCallback((
    selection: GoogleDriveBackupPickerSelection,
  ) => {
    const resolve = googleDriveBackupPickerResolveRef.current;
    googleDriveBackupPickerResolveRef.current = null;
    setGoogleDriveBackupPicker(null);
    resolve?.(selection);
  }, []);

  const closeGoogleDriveBackupPicker = useCallback(() => {
    resolveGoogleDriveBackupPicker(null);
  }, [resolveGoogleDriveBackupPicker]);

  const requestGoogleDriveBackupPickerSelection = useCallback((
    accessToken: string,
    mode: GoogleDriveBackupPickerMode,
    slots: DriveBackupSlot[],
    scope: DriveBackupScope,
  ) => new Promise<GoogleDriveBackupPickerSelection>((resolve) => {
    googleDriveBackupPickerResolveRef.current?.(null);
    googleDriveBackupPickerResolveRef.current = resolve;
    setGoogleDriveBackupPicker({ accessToken, mode, scope, slots });
  }), []);

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
    setCreateDraftPinned(false);
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
    setSearchKeywordEditTarget(null);
    setSearchKeywordDraft('');
    setSearchKeywordTitleDraft('');
    setNotificationTodoRevealId(id);
    setQuery('');
    setItemSearchState(null);
    reminderTimeModalRef.current?.close();
    setRepeatReminderModalVisible(false);
    setSettingsModalVisible(false);
    setNavTab(null);
    setActiveTodoDetailContentSelection({ end: 0, start: 0 });
    setActiveTodoDetailDraftContent(formatTodoDetailDraftContentForEditing(todo.content));
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
      triggerSubtleHaptic();
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

    if (searchKeywordModalVisible) {
      closeSearchKeywordModal();
      return true;
    }

    if (googleDriveBackupPicker) {
      closeGoogleDriveBackupPicker();
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
      triggerSubtleHaptic();
      return true;
    }

    if (submenuOpen) {
      setMenuMode('main');
      triggerSubtleHaptic();
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
    closeGoogleDriveBackupPicker,
    closeSearchKeywordModal,
    closePresetSaveModal,
    closeSettingsModal,
    closeTodoDetailModal,
    createDrawerPicker,
    createDrawerVisible,
    datePickerVisible,
    exitTodoSelectMode,
    googleDriveBackupPicker,
    menuMode,
    searchKeywordModalVisible,
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
  const itemSearchHighlightQuery = searchMode === 'item' ? searchQuery : '';
  const todosById = useMemo(
    () => new Map(todos.map((todo) => [todo.id, todo])),
    [todos],
  );
  const todoListDisplay = useMemo(
    () => resolveListDisplaySettings(
      listMenuTree,
      selectedFilters.list,
      todoSortMode,
      todoGroupMode,
    ),
    [
      listMenuTree,
      selectedFilters.list,
      todoGroupMode,
      todoSortMode,
    ],
  );
  const todoListSortMode = todoListDisplay.sortMode;
  const todoListGroupMode = todoListDisplay.groupMode;
  const activeListDisplay = todoListDisplay;
  const effectiveSortMode = todoListSortMode;
  const effectiveGroupMode = todoListGroupMode;
  const hideDoneTodosForCurrentView = hideDoneTodos && todoListGroupMode !== 'status';

  useEffect(() => {
    if (!searchQuery || searchMode !== 'item') {
      return undefined;
    }

    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    let alive = true;

    localTodoStore.search(searchQuery)
      .then((matchedTodos) => {
        if (!alive || searchRequestIdRef.current !== requestId) {
          return;
        }

        const ids = matchedTodos.map((todo) => todo.id);
        itemSearchResultsCacheRef.current.set(searchQuery, ids);
        setItemSearchState({ ids, query: searchQuery });
      })
      .catch(() => {
        if (!alive || searchRequestIdRef.current !== requestId) {
          return;
        }

        itemSearchResultsCacheRef.current.set(searchQuery, []);
        setItemSearchState({ ids: [], query: searchQuery });
      });

    return () => {
      alive = false;
    };
  }, [searchMode, searchQuery]);

  const searchMatchedTodoIds = useMemo(() => {
    if (!searchQuery || searchMode !== 'item') {
      return null;
    }

    if (itemSearchState?.query === searchQuery) {
      return new Set(itemSearchState.ids);
    }

    const cachedIds = itemSearchResultsCacheRef.current.get(searchQuery);
    return new Set(cachedIds ?? []);
  }, [itemSearchState, searchMode, searchQuery]);

  const filteredTodos = useMemo(() => {
    if (notificationTodoRevealId) {
      const notificationTodo = todosById.get(notificationTodoRevealId);
      return notificationTodo && !pendingDeleteIds.has(notificationTodoRevealId)
        ? [notificationTodo]
        : [];
    }

    const matchedTodos = searchQuery && searchMode === 'item'
      ? [...(searchMatchedTodoIds ?? new Set<string>())]
        .map((id) => todosById.get(id))
        .filter((todo): todo is Todo => Boolean(todo))
      : navTab === 'search' && searchMode === 'item'
        ? []
        : todos;
    const now = dateStatusNow;

    return matchedTodos
      .filter((todo) => !hideDoneTodosForCurrentView || !todo.done)
      .filter((todo) => todoMatchesFilters(
        todo,
        selectedFilters,
        listMenuTree,
        now,
        requiredFilters,
        avoidedFilters,
      ));
  }, [
    hideDoneTodosForCurrentView,
    listMenuTree,
    notificationTodoRevealId,
    pendingDeleteIds,
    navTab,
    searchMatchedTodoIds,
    searchMode,
    searchQuery,
    avoidedFilters,
    dateStatusNow,
    requiredFilters,
    selectedFilters,
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

    const seedFilters = hasRememberedCreateDraftFilters(listMenuTree, selectedFilters)
      ? selectedFilters
      : lastCreateTodoFilters;

    exitTodoSelectMode();
    searchInputRef.current?.blur();
    setCreateDrawerPicker(null);
    resetCreateDrawerState(seedFilters);
    setCreateDraftText(
      truncateTodoText(
        initialText.trim().replace(/\s+/g, ' '),
        todoTextMaxLength,
      ),
    );
    Keyboard.dismiss();
    setCreateDrawerVisible(true);
    triggerSubtleHaptic();
  }, [
    closeListMenu,
    exitTodoSelectMode,
    lastCreateTodoFilters,
    listMenuOpen,
    listMenuTree,
    resetCreateDrawerState,
    selectedFilters,
    todoTextMaxLength,
  ]);

  const showCreateFromSettingsCue = useCallback(() => {
    setCreateFromSettingsCueVisible(true);
  }, []);

  const hideCreateFromSettingsCue = useCallback(() => {
    setCreateFromSettingsCueVisible(false);
  }, []);

  const openCreateDrawerWithFilters = useCallback((
    sectionFilters: TodoFilters,
    initialText = '',
  ) => {
    if (listMenuOpen) {
      closeListMenu();
    }

    const nextFilters = getCreateTodoFilters(listMenuTree, sectionFilters);

    exitTodoSelectMode();
    searchInputRef.current?.blur();
    setCreateDrawerPicker(null);
    setCreateDraftPriorityFromPicker(shouldHighlightCreatePriorityPicker(nextFilters));
    setCreateDraftContent('');
    setCreateDraftText(
      truncateTodoText(
        initialText.trim().replace(/\s+/g, ' '),
        todoTextMaxLength,
      ),
    );
    setCreateDraftPinned(false);
    setCreateDraftFilters(nextFilters);
    setDatePickerVisible(false);
    reminderTimeModalRef.current?.close();
    setRepeatReminderModalVisible(false);
    setRepeatDraft(decodeTodoReminder(nextFilters.reminder).repeat);
    Keyboard.dismiss();
    hideCreateFromSettingsCue();
    setCreateDrawerVisible(true);
    triggerSubtleHaptic();
  }, [
    closeListMenu,
    exitTodoSelectMode,
    hideCreateFromSettingsCue,
    listMenuOpen,
    listMenuTree,
    todoTextMaxLength,
  ]);

  const openCreateDrawerFromTodoSettings = useCallback((sourceTodo: Todo) => {
    if (listMenuOpen) {
      closeListMenu();
    }

    const nextFilters = getCreateTodoFilters(listMenuTree, sourceTodo.filters);

    exitTodoSelectMode();
    searchInputRef.current?.blur();
    setCreateDrawerPicker(null);
    setCreateDraftPriorityFromPicker(shouldHighlightCreatePriorityPicker(nextFilters));
    setCreateDraftContent('');
    setCreateDraftText('');
    setCreateDraftPinned(sourceTodo.pinned);
    setCreateDraftFilters(nextFilters);
    setDatePickerVisible(false);
    reminderTimeModalRef.current?.close();
    setRepeatReminderModalVisible(false);
    setRepeatDraft(decodeTodoReminder(nextFilters.reminder).repeat);
    Keyboard.dismiss();
    hideCreateFromSettingsCue();
    setCreateDrawerVisible(true);
    triggerSubtleHaptic();
  }, [closeListMenu, exitTodoSelectMode, hideCreateFromSettingsCue, listMenuOpen, listMenuTree]);

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
    if (
      !createDrawerVisible &&
      !activeTodoDetailId &&
      !presetSaveModalVisible &&
      !searchKeywordModalVisible
    ) {
      setKeyboardOverlayInset(0);
    }
  }, [
    activeTodoDetailId,
    createDrawerVisible,
    presetSaveModalVisible,
    searchKeywordModalVisible,
  ]);

  const createDrawerPickerMaxHeight = useMemo(() => {
    const toolbarReserve = 168;

    if (keyboardOverlayInset > 0) {
      return Math.max(120, windowHeight - keyboardOverlayInset - toolbarReserve);
    }

    if (createDrawerPicker === 'list') {
      return Math.max(
        88,
        Math.round(windowHeight * LIST_MENU_HEIGHT_RATIO) -
          CREATE_DRAWER_LIST_PICKER_CHROME_HEIGHT,
      );
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

    const todoFilters = getCreateTodoFilters(
      listMenuTree,
      createDraftFilters,
    );
    const nextLastCreateTodoFilters = getRememberedCreateDraftFilters(
      listMenuTree,
      todoFilters,
    );
    const createdAt = Date.now();
    const todo = makeTodo(text, todoFilters, content, createdAt, createDraftPinned);
    const nextSelectedFilters = getFiltersAfterCreateReveal(
      todo,
      selectedFilters,
      listMenuTree,
      new Date(createdAt),
    );
    const nextRequiredFilters = pruneTodoFilters(requiredFilters, nextSelectedFilters);

    recordUndo('Create todo');
    setLastCreateTodoFilters(nextLastCreateTodoFilters);
    if (!filtersEqual(selectedFilters, nextSelectedFilters)) {
      setSelectedFilters(nextSelectedFilters);
    }
    if (!filtersEqual(requiredFilters, nextRequiredFilters)) {
      setRequiredFilters(nextRequiredFilters);
    }
    clearNotificationTodoReveal();
    if (query.trim()) {
      setQuery('');
      setItemSearchState(null);
    }
    setTodos((current) => [todo, ...current]);
    highlightNewlyCreatedTodo(todo.id);
    localTodoStore.upsert(todo).catch(() => undefined);
    syncTodoAlarm(todo).catch(() => undefined);
    Keyboard.dismiss();
    setCreateDrawerVisible(false);
    setCreateDrawerPicker(null);
    resetCreateDrawerState(nextLastCreateTodoFilters);
    triggerSubtleHaptic();
  }, [
    createDraftContent,
    createDraftFilters,
    createDraftPinned,
    createDraftText,
    clearNotificationTodoReveal,
    highlightNewlyCreatedTodo,
    listMenuTree,
    query,
    recordUndo,
    requiredFilters,
    resetCreateDrawerState,
    selectedFilters,
    todoTextMaxLength,
  ]);

  const createDrawerCanSubmit = useMemo(
    () => createDraftText.trim().replace(/\s+/g, ' ').length > 0,
    [createDraftText],
  );

  const handleCreateDrawerTrailingPress = useCallback(() => {
    if (createDrawerPicker) {
      backToCreateDrawerInput();
      triggerSubtleHaptic();
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
    triggerSubtleHaptic();
  }, []);

  const openCreateDrawerPicker = useCallback((picker: CreateDrawerPicker) => {
    Keyboard.dismiss();
    setDatePickerVisible(false);
    reminderTimeModalRef.current?.close();
    setRepeatReminderModalVisible(false);
    setCreateDrawerPicker(picker);
    triggerSubtleHaptic();
  }, []);

  const createDrawerPickerItems = useMemo(() => {
    if (createDrawerPicker === 'list') {
      const tree =
        listOrderMode === 'alphabetical' ? sortListMenuTree(listMenuTree) : listMenuTree;
      return [CREATE_DRAWER_NO_LIST_PICKER_VALUE, ...tree.map((node) => node.label)];
    }

    if (createDrawerPicker === 'date') {
      return getDateMenuItemsForDateLabels(DATE_PICKER_MENU_ITEMS, createDraftFilters.date);
    }

    if (createDrawerPicker === 'priority') {
      return PRIORITY_MENU_ITEMS;
    }

    return [];
  }, [createDrawerPicker, createDraftFilters.date, listMenuTree, listOrderMode]);

  const createDrawerDateLabel = useMemo(
    () => formatCreateDrawerDateLabel(createDraftFilters.date, dateLabelDisplayMode),
    [createDraftFilters.date, dateLabelDisplayMode],
  );

  const createDrawerListLabel = createDraftFilters.list[0] ?? CREATE_DRAWER_NO_LIST_LABEL;
  const createDrawerListAccessibilityLabel = createDraftFilters.list[0]
    ? `List: ${createDrawerListLabel}`
    : 'List: No list';
  const createDrawerListPickerOpen = createDrawerPicker === 'list';
  const createDrawerListPickerHalfSheet =
    createDrawerListPickerOpen && keyboardOverlayInset === 0;
  const createDrawerListPickerSheetHeight = Math.round(windowHeight * LIST_MENU_HEIGHT_RATIO);
  const createDrawerListPickerTopSpace = Math.round(
    createDrawerListPickerSheetHeight * LIST_MENU_ONE_HANDED_SCROLL_RATIO,
  );
  const createDrawerDateActive = createDraftFilters.date.length > 0
    || hasTodoReminderTime(createDraftFilters.reminder)
    || hasTodoRepeat(createDraftFilters.reminder);
  const createDrawerListActive = createDraftFilters.list.length > 0;
  const createDrawerPriorityActive = createDraftFilters.priority.length > 0;

  const toggleCreateDraftPinned = useCallback(() => {
    setCreateDraftPinned((current) => !current);
    triggerSubtleHaptic();
  }, []);

  const deleteTodo = useCallback((id: string, options: { skipUndo?: boolean } = {}) => {
    const todoToDelete = todos.find((todo) => todo.id === id);

    if (!todoToDelete || pendingDeleteIds.has(id)) {
      return;
    }

    const deletedTodo: DeletedTodo = {
      ...cloneTodo(todoToDelete),
      deletedAt: Date.now(),
    };

    if (!options.skipUndo) {
      recordUndo('Delete todo');
    }
    localTodoStore.delete(id).catch(() => undefined);
    cancelTodoAlarm(id).catch(() => undefined);
    clearRepeatingTodoCompletionFeedback(id);
    clearEditedTodoHighlights([id]);
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
    triggerSubtleHaptic();
  }, [
    clearEditedTodoHighlights,
    clearRepeatingTodoCompletionFeedback,
    pendingDeleteIds,
    recordUndo,
    todos,
  ]);

  const restoreDeletedTodo = useCallback((id: string) => {
    const deletedTodo = deletedTodos.find((todo) => todo.id === id);

    if (!deletedTodo || todos.some((todo) => todo.id === id)) {
      return;
    }

    const restoredTodo: Todo = {
      id: deletedTodo.id,
      content: deletedTodo.content,
      text: deletedTodo.text,
      pinned: deletedTodo.pinned,
      done: deletedTodo.done,
      createdAt: deletedTodo.createdAt,
      filters: cloneTodoFilters(deletedTodo.filters),
    };

    recordUndo('Restore deleted todo');
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
    triggerSubtleHaptic();
  }, [createSettingsSnapshot, deletedTodos, recordUndo, todos]);

  const addDevTestTodos = useCallback(() => {
    recordUndo('Add test data');
    const testTodos = createDevTestTodos(seedDevTestSettings());

    setTodos((current) => {
      const withoutDev = current.filter((todo) => !isDevTestTodo(todo));

      current
        .filter(isDevTestTodo)
        .forEach((todo) => {
          localTodoStore.delete(todo.id).catch(() => undefined);
          cancelTodoAlarm(todo.id).catch(() => undefined);
        });

      const next = [...testTodos, ...withoutDev];
      localTodoStore.upsertMany(testTodos).catch(() => undefined);
      reconcileTodoAlarms(next).catch(() => undefined);
      triggerSubtleHaptic();
      return next;
    });
  }, [recordUndo, seedDevTestSettings]);

  const clearDevTestTodos = useCallback(() => {
    const hasDevTestData =
      todosRef.current.some(isDevTestTodo) ||
      menuPresetsRef.current.some(isDevTestMenuPreset) ||
      countDevTestListMenuNodes(listMenuTreeRef.current) > 0;

    if (!hasDevTestData) {
      return;
    }

    recordUndo('Clear test data');
    const nextListMenuTree = removeDevTestListMenuNodes(listMenuTreeRef.current);
    const nextMenuPresets = menuPresetsRef.current.filter(
      (preset) => !isDevTestMenuPreset(preset),
    );

    listMenuTreeRef.current = nextListMenuTree;
    menuPresetsRef.current = nextMenuPresets;
    setListMenuTree(nextListMenuTree);
    setMenuPresets(nextMenuPresets);
    void persistAppSettings({
      listMenuTree: nextListMenuTree,
      menuPresets: nextMenuPresets,
    });

    setTodos((current) => {
      const devTodos = current.filter(isDevTestTodo);

      if (devTodos.length === 0) {
        triggerSubtleHaptic();
        return current;
      }

      devTodos.forEach((todo) => {
        localTodoStore.delete(todo.id).catch(() => undefined);
        cancelTodoAlarm(todo.id).catch(() => undefined);
      });

      const next = current.filter((todo) => !isDevTestTodo(todo));
      reconcileTodoAlarms(next).catch(() => undefined);
      triggerSubtleHaptic();
      return next;
    });
  }, [persistAppSettings, recordUndo]);

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
            recordUndo('Delete permanently');
            setDeletedTodos(nextDeletedTodos);
            setActiveDeletedTodoDetailId((current) => (current === id ? null : current));
            appSettingsStore.save(
              createSettingsSnapshot({ deletedTodos: nextDeletedTodos }),
            ).catch(() => undefined);
            triggerSubtleHaptic();
          },
        },
      ],
    );
  }, [createSettingsSnapshot, deletedTodos, recordUndo]);

  const setTodoDone = useCallback((
    id: string,
    done: boolean,
    options: { skipUndo?: boolean } = {},
  ) => {
    if (pendingDeleteIds.has(id) || repeatingTodoCompletionFeedbackIdsRef.current.has(id)) {
      return;
    }

    const updatedTodo = todosRef.current.find((todo) => todo.id === id);
    if (!updatedTodo || updatedTodo.done === done) {
      return;
    }

    const repeatedNextTodo = done && updatedTodo
      ? advanceRepeatingTodoAfterDone(updatedTodo)
      : null;

    if (repeatedNextTodo && updatedTodo) {
      if (!options.skipUndo) {
        recordUndo('Complete todo');
      }
      setActiveTodoMenuId((current) => (current === id ? null : current));
      setActiveTodoDetailId((current) => (current === id ? null : current));
      scheduleRepeatingTodoRollForward(id);
      return;
    }

    const nextTodo = repeatedNextTodo ?? (updatedTodo ? { ...updatedTodo, done } : null);

    if (!options.skipUndo) {
      recordUndo(done ? 'Complete todo' : 'Reopen todo');
    }
    setTodos((current) =>
      current.map((todo) => (
        todo.id === id && nextTodo ? nextTodo : todo
      )),
    );
    if (done && nextTodo?.done && hideDoneTodosForCurrentView) {
      setActiveTodoMenuId((current) => (current === id ? null : current));
      setActiveTodoDetailId((current) => (current === id ? null : current));
    }
    if (nextTodo) {
      highlightEditedTodos([id]);
      if (repeatedNextTodo) {
        localTodoStore.upsert(repeatedNextTodo).catch(() => undefined);
      } else {
        localTodoStore.updateDone(id, done).catch(() => undefined);
      }
      syncTodoAlarm(nextTodo).catch(() => undefined);
    } else if (done) {
      cancelTodoAlarm(id).catch(() => undefined);
    }
  }, [
    hideDoneTodosForCurrentView,
    highlightEditedTodos,
    pendingDeleteIds,
    recordUndo,
    scheduleRepeatingTodoRollForward,
  ]);

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
            const deletableIds = ids.filter((id) => (
              todosRef.current.some((todo) => todo.id === id) &&
              !pendingDeleteIdsRef.current.has(id)
            ));
            if (deletableIds.length > 0) {
              recordUndo(deletableIds.length === 1 ? 'Delete todo' : 'Delete selected todos');
            }
            deletableIds.forEach((id) => deleteTodo(id, { skipUndo: true }));
            exitTodoSelectMode();
            triggerSubtleHaptic();
          },
        },
      ],
    );
  }, [deleteTodo, exitTodoSelectMode, recordUndo, selectedTodoIds]);

  const markSelectedTodosDone = useCallback((done: boolean) => {
    const targetIds = [...selectedTodoIds].filter((id) => {
      const todo = todosRef.current.find((item) => item.id === id);
      return todo && !pendingDeleteIdsRef.current.has(id) && todo.done !== done;
    });

    if (targetIds.length > 0) {
      recordUndo(done ? 'Complete selected todos' : 'Reopen selected todos');
    }
    targetIds.forEach((id) => setTodoDone(id, done, { skipUndo: true }));
    exitTodoSelectMode();
    triggerSubtleHaptic();
  }, [exitTodoSelectMode, recordUndo, selectedTodoIds, setTodoDone]);

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

    const updatedById = new Map<string, Todo>();
    todosRef.current.forEach((todo) => {
      if (!targetIds.has(todo.id)) {
        return;
      }

      const rawNextFilters = updater(cloneTodoFilters(todo.filters));
      const dateChanged = !filterValueListsEqual(rawNextFilters.date, todo.filters.date);
      const nextFilters = normalizeTodoFilters(
        rawNextFilters,
        dateChanged ? Date.now() : undefined,
      );

      if (!filtersEqual(todo.filters, nextFilters)) {
        updatedById.set(todo.id, { ...todo, filters: nextFilters });
      }
    });

    if (updatedById.size === 0) {
      return;
    }

    const updatedTodos = [...updatedById.values()];
    recordFilterConfigUndo(
      updatedTodos.length === 1 ? 'Change todo settings' : 'Change selected todos',
    );
    setTodos((current) => current.map((todo) => updatedById.get(todo.id) ?? todo));
    highlightEditedTodos(updatedTodos.map((todo) => todo.id));
    localTodoStore.upsertMany(updatedTodos).catch(() => undefined);
    updatedTodos.forEach((todo) => {
      syncTodoAlarm(todo).catch(() => undefined);
    });
  }, [highlightEditedTodos, pendingDeleteIds, recordFilterConfigUndo]);

  const updateTodoPinnedForIds = useCallback((ids: string[], pinned: boolean) => {
    const targetIds = new Set(ids.filter((id) => !pendingDeleteIds.has(id)));

    if (targetIds.size === 0) {
      return;
    }

    const updatedById = new Map<string, Todo>();
    todosRef.current.forEach((todo) => {
      if (targetIds.has(todo.id) && todo.pinned !== pinned) {
        updatedById.set(todo.id, { ...todo, pinned });
      }
    });

    if (updatedById.size === 0) {
      return;
    }

    const updatedTodos = [...updatedById.values()];
    recordUndo(pinned ? 'Pin todo' : 'Unpin todo');
    setTodos((current) => current.map((todo) => updatedById.get(todo.id) ?? todo));
    highlightEditedTodos(updatedTodos.map((todo) => todo.id));
    localTodoStore.upsertMany(updatedTodos).catch(() => undefined);
  }, [highlightEditedTodos, pendingDeleteIds, recordUndo]);

  const getCurrentTodoEditTargetIds = useCallback(() => {
    if (activeTodoMenuIdRef.current) {
      return pendingDeleteIds.has(activeTodoMenuIdRef.current)
        ? []
        : [activeTodoMenuIdRef.current];
    }

    return [...selectedTodoIds].filter((id) => !pendingDeleteIds.has(id));
  }, [pendingDeleteIds, selectedTodoIds]);

  const toggleCurrentTodoTargetsPinned = useCallback(() => {
    const targetIds = getCurrentTodoEditTargetIds();

    if (targetIds.length === 0) {
      return;
    }

    const targetIdSet = new Set(targetIds);
    const targetTodos = todos.filter((todo) => (
      targetIdSet.has(todo.id) && !pendingDeleteIds.has(todo.id)
    ));

    if (targetTodos.length === 0) {
      return;
    }

    updateTodoPinnedForIds(targetIds, !targetTodos.every((todo) => todo.pinned));
    closeListMenuState();
    exitTodoSelectMode();
    triggerSubtleHaptic();
  }, [
    closeListMenuState,
    exitTodoSelectMode,
    getCurrentTodoEditTargetIds,
    pendingDeleteIds,
    todos,
    updateTodoPinnedForIds,
  ]);

  const updateCurrentTodoTargetFilters = useCallback((
    updater: (filters: SelectedFilters) => SelectedFilters,
  ) => {
    const targetIds = getCurrentTodoEditTargetIds();

    if (targetIds.length > 0) {
      updateTodoFiltersForIds(targetIds, updater);
      return;
    }

    clearNotificationTodoReveal();
    const nextFilters = updater(cloneTodoFilters(selectedFiltersRef.current));
    const nextRequiredFilters = pruneTodoFilters(requiredFiltersRef.current, nextFilters);
    const nextAvoidedFilters = removeSelectedValuesFromAvoidedFilters(
      avoidedFiltersRef.current,
      nextFilters,
    );
    if (
      filtersEqual(selectedFiltersRef.current, nextFilters) &&
      filtersEqual(requiredFiltersRef.current, nextRequiredFilters) &&
      filtersEqual(avoidedFiltersRef.current, nextAvoidedFilters)
    ) {
      return;
    }

    recordFilterConfigUndo('Change filters');
    setSelectedFilters(nextFilters);
    setRequiredFilters(nextRequiredFilters);
    setAvoidedFilters(nextAvoidedFilters);
  }, [
    clearNotificationTodoReveal,
    getCurrentTodoEditTargetIds,
    recordFilterConfigUndo,
    updateTodoFiltersForIds,
  ]);

  const closeDatePicker = useCallback(() => {
    setDatePickerVisible(false);
  }, []);

  const applyPickedDate = useCallback((date: Date) => {
    const isoDate = toISODateString(date);
    const source = datePickerApplyRef.current;

    if (
      source === 'filters' &&
      dateFilterValuesIncludeExactDay(datePickerDateLabelsRef.current, date)
    ) {
      Alert.alert(
        'Date already selected',
        `${formatDateFilterLabel(isoDate)} is already selected.`,
      );
      triggerSubtleHaptic();
      return;
    }

    const applyDate = (current: SelectedFilters) => ({
      ...current,
      date: source === 'create' ? [isoDate] : [...current.date, isoDate],
    });

    if (source === 'create') {
      setCreateDraftFilters(applyDate);
    } else {
      updateCurrentTodoTargetFilters(applyDate);
    }

    closeDatePicker();
    triggerSubtleHaptic();
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
    triggerSubtleHaptic();
  }, [closeDatePicker, updateCurrentTodoTargetFilters]);

  const clearCreateDraftDate = useCallback(() => {
    setCreateDraftFilters((current) => ({
      ...current,
      date: [],
    }));
    triggerSubtleHaptic();
  }, []);

  const clearCreateDraftDateOptions = useCallback(() => {
    setCreateDraftFilters((current) => ({
      ...current,
      date: [],
      reminder: encodeTodoReminder({ time: null, repeat: 'none' }),
    }));
    setDatePickerVisible(false);
    reminderTimeModalRef.current?.close();
    setRepeatReminderModalVisible(false);
    setRepeatDraft('none');
    triggerSubtleHaptic();
  }, []);

  const clearCreateDraftList = useCallback((closePicker = false) => {
    setCreateDraftFilters((current) => ({
      ...current,
      list: [],
    }));
    if (closePicker) {
      setCreateDrawerPicker(null);
    }
    triggerSubtleHaptic();
  }, []);

  const clearCreateDraftPriority = useCallback(() => {
    setCreateDraftPriorityFromPicker(false);
    setCreateDraftFilters((current) => ({
      ...current,
      priority: [],
    }));
    triggerSubtleHaptic();
  }, []);

  const handleCreateDrawerCalendarPress = useCallback(() => {
    if (createDrawerPicker === 'date') {
      if (createDrawerDateActive) {
        clearCreateDraftDateOptions();
        return;
      }

      backToCreateDrawerInput();
      triggerSubtleHaptic();
      return;
    }

    openCreateDrawerPicker('date');
  }, [
    backToCreateDrawerInput,
    clearCreateDraftDateOptions,
    createDrawerDateActive,
    createDrawerPicker,
    openCreateDrawerPicker,
  ]);

  const handleCreateDrawerListPress = useCallback(() => {
    if (createDrawerPicker === 'list') {
      if (createDrawerListActive) {
        clearCreateDraftList();
        return;
      }

      backToCreateDrawerInput();
      triggerSubtleHaptic();
      return;
    }

    openCreateDrawerPicker('list');
  }, [
    backToCreateDrawerInput,
    clearCreateDraftList,
    createDrawerListActive,
    createDrawerPicker,
    openCreateDrawerPicker,
  ]);

  const handleCreateDrawerPriorityPress = useCallback(() => {
    if (createDrawerPicker === 'priority') {
      if (createDrawerPriorityActive) {
        clearCreateDraftPriority();
        return;
      }

      backToCreateDrawerInput();
      triggerSubtleHaptic();
      return;
    }

    openCreateDrawerPicker('priority');
  }, [
    backToCreateDrawerInput,
    clearCreateDraftPriority,
    createDrawerPicker,
    createDrawerPriorityActive,
    openCreateDrawerPicker,
  ]);

  const openDatePicker = useCallback((
    source: 'create' | 'filters',
    dateLabels: string[],
  ) => {
    datePickerApplyRef.current = source;
    datePickerDateLabelsRef.current = [...dateLabels];
    setDatePickerValue(getInitialDatePickerValue(dateLabels));
    setDatePickerVisible(true);
  }, []);

  const openCreateReminderModal = useCallback(() => {
    reminderTimeModalRef.current?.open({
      source: 'create',
      value: decodeTodoReminder(createDraftFilters.reminder).time,
    });
    triggerSubtleHaptic();
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

    triggerSubtleHaptic();
  }, [getCurrentTodoEditTargetIds, updateTodoFiltersForIds]);

  const openCreateRepeatModal = useCallback(() => {
    repeatReminderApplyRef.current = 'create';
    setRepeatDraft(decodeTodoReminder(createDraftFilters.reminder).repeat);
    setRepeatReminderModalVisible(true);
    triggerSubtleHaptic();
  }, [createDraftFilters.reminder]);

  const closeCreateRepeatModal = useCallback(() => {
    setRepeatReminderModalVisible(false);
  }, []);

  const confirmCreateRepeat = useCallback((repeat: RepeatPreset) => {
    if (repeatReminderApplyRef.current === 'create') {
      setCreateDraftFilters((draft) => {
        const current = decodeTodoReminder(draft.reminder);

        return {
          ...draft,
          reminder: encodeTodoReminder({ time: current.time, repeat }),
        };
      });
    } else {
      const targetIds = getCurrentTodoEditTargetIds();

      if (targetIds.length > 0) {
        updateTodoFiltersForIds(targetIds, (filters) => {
          const current = decodeTodoReminder(filters.reminder);

          return {
            ...filters,
            reminder: encodeTodoReminder({ time: current.time, repeat }),
          };
        });
      }
    }

    setRepeatReminderModalVisible(false);
    triggerSubtleHaptic();
  }, [getCurrentTodoEditTargetIds, updateTodoFiltersForIds]);

  const clearCreateReminderTime = useCallback(() => {
    setCreateDraftFilters((draft) => {
      const current = decodeTodoReminder(draft.reminder);

      return {
        ...draft,
        reminder: encodeTodoReminder({ time: null, repeat: current.repeat }),
      };
    });
    reminderTimeModalRef.current?.close();
    triggerSubtleHaptic();
  }, []);

  const clearCreateRepeat = useCallback(() => {
    setCreateDraftFilters((draft) => {
      const current = decodeTodoReminder(draft.reminder);

      return {
        ...draft,
        reminder: encodeTodoReminder({ time: current.time, repeat: 'none' }),
      };
    });
    triggerSubtleHaptic();
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
    triggerSubtleHaptic();
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
    triggerSubtleHaptic();
  }, [getCurrentTodoEditTargetIds, todos]);

  const clearActiveTodoReminderTime = useCallback(() => {
    const targetIds = getCurrentTodoEditTargetIds();

    if (targetIds.length === 0) {
      return;
    }

    updateTodoFiltersForIds(targetIds, (filters) => {
      const current = decodeTodoReminder(filters.reminder);

      return {
        ...filters,
        reminder: encodeTodoReminder({ time: null, repeat: current.repeat }),
      };
    });
    reminderTimeModalRef.current?.close();
    triggerSubtleHaptic();
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
    triggerSubtleHaptic();
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
      clearCreateDraftDateOptions();
      return;
    }

    setCreateDraftFilterValue('date', label);
  }, [
    clearCreateDraftDateOptions,
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

        if (navTab === 'search') {
          const todoRowTouchStart = todoRowTouchStartRef.current;
          const startedOnTodoRow =
            todoRowTouchStart.id !== null &&
            Math.abs(timestamp - todoRowTouchStart.timestamp) < 48 &&
            Math.hypot(
              pageX - todoRowTouchStart.pageX,
              pageY - todoRowTouchStart.pageY,
            ) < 6;

          if (startedOnTodoRow && todoRowTouchStart.id) {
            openTodoDetailModal(todoRowTouchStart.id);
          }

          triggerSubtleHaptic();
          return true;
        }

        setMenuMode('main');
        triggerSubtleHaptic();
        return true;
      }

      lastListTapRef.current = { pageX, pageY, timestamp };
      return false;
    },
    [listMenuOpen, navTab, openTodoDetailModal],
  );

  const handleListTap = useCallback(
    (event: GestureResponderEvent) => {
      const { pageX, pageY, timestamp } = event.nativeEvent;
      return registerListTap(pageX, pageY, timestamp);
    },
    [registerListTap],
  );

  const markTodoRowTouchStart = useCallback((id: string) => (event: GestureResponderEvent) => {
    const { pageX, pageY, timestamp } = event.nativeEvent;
    todoRowTouchStartRef.current = { pageX, pageY, timestamp, id };
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
          triggerSubtleHaptic();
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
  const todoListOrderedListMenuTree = useMemo(
    () => (
      listOrderMode === 'alphabetical'
        ? sortListMenuTree(listMenuTree)
        : listMenuTree
    ),
    [listMenuTree, listOrderMode],
  );
  const todoListOrderedListLabels = useMemo(
    () => collectListNodeLabels(todoListOrderedListMenuTree),
    [todoListOrderedListMenuTree],
  );
  const settingsListColorLabels = useMemo(
    () => collectListNodeLabels(listMenuTree),
    [listMenuTree],
  );
  const settingsColorGroups = useMemo(
    () => [
      {
        id: 'item-backgrounds',
        items: settingsListColorLabels.map((value) => ({
          displayLabel: value,
          filterKey: 'list' as const,
          sourceLabel: 'List',
          value,
        })),
        title: 'Item backgrounds',
      },
      {
        id: 'date-meta-tags',
        items: DATE_MENU_ITEMS.map((value) => ({
          displayLabel: value,
          filterKey: 'date' as const,
          sourceLabel: 'Date tag',
          value,
        })),
        title: 'Date tags',
      },
      {
        id: 'priority-color',
        items: PRIORITY_MENU_ITEMS.map((value) => ({
          displayLabel: `${value} text`,
          filterKey: 'priority' as const,
          sourceLabel: 'Priority text',
          value,
        })),
        title: 'Priority text',
      },
      {
        id: 'priority-border',
        items: PRIORITY_MENU_ITEMS.map((value) => ({
          displayLabel: `${value} border`,
          filterKey: 'priorityBorder' as const,
          sourceLabel: 'Priority border',
          value,
        })),
        title: 'Priority border',
      },
      {
        id: 'priority-bg',
        items: PRIORITY_MENU_ITEMS.map((value) => ({
          displayLabel: `${value} bg`,
          filterKey: 'priorityBackground' as const,
          sourceLabel: 'Priority bg',
          value,
        })),
        title: 'Priority bg',
      },
    ],
    [settingsListColorLabels],
  );
  const settingsColorItemCount = settingsColorGroups.reduce(
    (count, group) => count + group.items.length,
    0,
  );
  const activeMenuPreset = useMemo(() => {
    if (activeTodoMenuId) {
      return null;
    }

    return menuPresets.find((preset) => menuPresetMatchesState(
      preset,
      selectedFilters,
      requiredFilters,
      avoidedFilters,
      effectiveSortMode,
      effectiveGroupMode,
      listOrderMode,
      metaTagVisibility,
    )) ?? null;
  }, [
    activeTodoMenuId,
    effectiveGroupMode,
    effectiveSortMode,
    listOrderMode,
    metaTagVisibility,
    menuPresets,
    avoidedFilters,
    requiredFilters,
    selectedFilters,
  ]);
  const menuPresetById = useMemo(
    () => new Map(menuPresets.map((preset) => [preset.id, preset])),
    [menuPresets],
  );
  const menuPresetByListLabel = useMemo(
    () => buildMenuPresetByListLabel(menuPresets),
    [menuPresets],
  );
  const searchKeywordEditTitle = useMemo(() => {
    if (!searchKeywordEditTarget || searchKeywordEditTarget.kind === 'list') {
      return '';
    }

    return menuPresetById.get(searchKeywordEditTarget.presetId)?.label ?? 'List';
  }, [menuPresetById, searchKeywordEditTarget]);
  const searchKeywordModalSaveDisabled = useMemo(() => {
    if (!searchKeywordEditTarget || searchKeywordEditTarget.kind !== 'list') {
      return false;
    }

    const formattedTitle = formatListLabel(searchKeywordTitleDraft);
    if (!formattedTitle) {
      return true;
    }

    const currentItem = listMenuTree[searchKeywordEditTarget.listIndex];
    if (!currentItem) {
      return true;
    }

    if (formattedTitle.toLocaleLowerCase() === currentItem.label.toLocaleLowerCase()) {
      return false;
    }

    return collectListNodeLabels(listMenuTree).some(
      (label) => label.toLocaleLowerCase() === formattedTitle.toLocaleLowerCase(),
    );
  }, [listMenuTree, searchKeywordEditTarget, searchKeywordTitleDraft]);
  const quickPresetNavItems = useMemo<QuickPresetNavItem[]>(
    () => buildQuickPresetNavItems({
      listMenuTree,
      listOrderMode,
      menuPresetById,
      menuPresetByListLabel,
      menuPresets,
      quickPresetNavIconNames,
      quickPresetNavPresetIds,
    }),
    [
      listMenuTree,
      listOrderMode,
      menuPresetById,
      menuPresetByListLabel,
      menuPresets,
      quickPresetNavIconNames,
      quickPresetNavPresetIds,
    ],
  );
  const quickPresetNavVirtualPresetById = useMemo(() => {
    const presetsById = new Map<string, MenuPreset>();

    quickPresetNavItems.forEach((item) => {
      if (
        item.preset &&
        item.preset.id.startsWith(QUICK_LIST_PRESET_ID_PREFIX) &&
        !menuPresetById.has(item.preset.id)
      ) {
        presetsById.set(item.preset.id, item.preset);
      }
    });

    return presetsById;
  }, [menuPresetById, quickPresetNavItems]);
  const heldQuickPresetNavPreset = heldQuickPresetNavSlotNumber
    ? quickPresetNavItems.find((item) => item.slotNumber === heldQuickPresetNavSlotNumber)?.preset
      ?? null
    : null;
  const heldQuickPresetNavDetail = heldQuickPresetNavPreset
    ? getQuickPresetNavDetail(heldQuickPresetNavPreset, dateLabelDisplayMode)
    : null;
  const openQuickPresetNavItem = openQuickPresetNavSlotNumber
    ? quickPresetNavItems.find((item) => item.slotNumber === openQuickPresetNavSlotNumber) ?? null
    : null;
  const openQuickPresetNavIndex = openQuickPresetNavItem?.navIndex ?? null;
  const settingsNavbarPinnedListCount = useMemo(
    () => listMenuTree.filter((list) => list.showInNavbar !== false).length,
    [listMenuTree],
  );
  const openListPreset = openMenuPresetId
    ? menuPresetById.get(openMenuPresetId)
      ?? quickPresetNavVirtualPresetById.get(openMenuPresetId)
      ?? null
    : null;
  const openListPresetMatchesSelectedListScope =
    openListPreset !== null &&
    isListScopedPreset(openListPreset) &&
    openListPreset.filters.list.length === selectedFilters.list.length &&
    openListPreset.filters.list.every((label) => selectedFilters.list.includes(label));
  const activeListPreset = isListScopedPreset(activeMenuPreset)
    ? activeMenuPreset
    : openListPresetMatchesSelectedListScope
      ? openListPreset
      : null;
  const todoListUseSubsectionLayout =
    todoListDisplay.isSubsectionView && todoListGroupMode === 'none';
  const seedListGroupLabels = useMemo(() => {
    if (todoListGroupMode !== 'list') {
      return EMPTY_LIST_GROUP_LABELS;
    }

    const scopedListLabels = activeListPreset?.filters.list.length
      ? activeListPreset.filters.list
      : selectedFilters.list;

    return scopedListLabels.length > 0 ? scopedListLabels : todoListOrderedListLabels;
  }, [activeListPreset, selectedFilters.list, todoListGroupMode, todoListOrderedListLabels]);
  const sortedTodos = useMemo(
    () => [...filteredTodos].sort(createTodoSortComparator(todoListSortMode, dateStatusNow)),
    [dateStatusNow, filteredTodos, todoListSortMode],
  );
  const todoListRows = useMemo(
    () => buildTodoListRows(
      sortedTodos,
      todoListGroupMode,
      todoListSortMode,
      todoListOrderedListLabels,
      listMenuTree,
      selectedFilters.list,
      todoListUseSubsectionLayout,
      dateLabelDisplayMode,
      seedListGroupLabels,
      dateStatusNow,
    ),
    [
      dateLabelDisplayMode,
      dateStatusNow,
      listMenuTree,
      seedListGroupLabels,
      selectedFilters.list,
      sortedTodos,
      todoListGroupMode,
      todoListSortMode,
      todoListOrderedListLabels,
      todoListUseSubsectionLayout,
    ],
  );
  const visibleTodoListRows = useMemo(
    () => flattenTodoListRows(todoListRows, collapsedTodoGroupIds),
    [collapsedTodoGroupIds, todoListRows],
  );
  useEffect(() => {
    if (
      toggleAllTodoSectionsRequest === 0 ||
      handledToggleAllTodoSectionsRequestRef.current === toggleAllTodoSectionsRequest
    ) {
      return;
    }

    handledToggleAllTodoSectionsRequestRef.current = toggleAllTodoSectionsRequest;
    const sectionIds = todoListRows.flatMap((row) => (
      row.type === 'section' ? [row.id] : []
    ));

    if (sectionIds.length === 0) {
      return;
    }

    todoListRef.current?.clearLayoutCacheOnUpdate();
    setCollapsedTodoGroupIds((current) => {
      const shouldExpandAll = sectionIds.every((sectionId) => current.has(sectionId));
      const next = new Set(current);
      let changed = false;

      if (shouldExpandAll) {
        sectionIds.forEach((sectionId) => {
          if (next.delete(sectionId)) {
            changed = true;
          }
        });
      } else {
        sectionIds.forEach((sectionId) => {
          if (!next.has(sectionId)) {
            next.add(sectionId);
            changed = true;
          }
        });
      }

      return changed ? next : current;
    });
  }, [toggleAllTodoSectionsRequest, todoListRows]);
  const pendingDeleteKey = useMemo(
    () => [...pendingDeleteIds].sort().join('|'),
    [pendingDeleteIds],
  );
  const selectedTodoKey = useMemo(
    () => [...selectedTodoIds].sort().join('|'),
    [selectedTodoIds],
  );
  const recentlyEditedTodoKey = useMemo(
    () => [...recentlyEditedTodoIds].sort().join('|'),
    [recentlyEditedTodoIds],
  );
  const repeatingTodoCompletionFeedbackKey = useMemo(
    () => [...repeatingTodoCompletionFeedbackIds].sort().join('|'),
    [repeatingTodoCompletionFeedbackIds],
  );
  const collapsedSearchPresetKey = useMemo(
    () => [...collapsedSearchPresetIds].sort().join('|'),
    [collapsedSearchPresetIds],
  );
  const collapsedSearchListKey = useMemo(
    () => [...collapsedSearchListLabels].sort().join('|'),
    [collapsedSearchListLabels],
  );
  const todoListExtraData = useMemo(
    () => ({
      activeTodoMenuHighlightId,
      activeTodoMenuId,
      collapsedSearchListKey,
      collapsedSearchPresetKey,
      dateStatusKey,
      newlyCreatedTodoHighlightId,
      pendingDeleteKey,
      recentlyEditedTodoKey,
      repeatingTodoCompletionFeedbackKey,
      searchQueryKey: query.trim(),
      selectedTodoKey,
    }),
    [
      activeTodoMenuHighlightId,
      activeTodoMenuId,
      collapsedSearchListKey,
      collapsedSearchPresetKey,
      dateStatusKey,
      newlyCreatedTodoHighlightId,
      pendingDeleteKey,
      query,
      recentlyEditedTodoKey,
      repeatingTodoCompletionFeedbackKey,
      selectedTodoKey,
    ],
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
  const currentTodoEditTargets = useMemo(() => {
    if (activeTodoMenuId) {
      const activeTodo = todos.find((todo) => todo.id === activeTodoMenuId);
      return activeTodo && !pendingDeleteIds.has(activeTodo.id) ? [activeTodo] : [];
    }

    return selectedTodosForBulk;
  }, [activeTodoMenuId, pendingDeleteIds, selectedTodosForBulk, todos]);
  const hasTodoEditTargets = currentTodoEditTargets.length > 0;
  const todoEditTargetsAllPinned =
    hasTodoEditTargets && currentTodoEditTargets.every((todo) => todo.pinned);
  const todoPinActionLabel = activeTodoMenuId
    ? (todoEditTargetsAllPinned ? 'Unpin item' : 'Pin item')
    : (todoEditTargetsAllPinned ? 'Unpin selected' : 'Pin selected');
  const activeTodoDetail = useMemo(
    () => todos.find((todo) => todo.id === activeTodoDetailId) ?? null,
    [activeTodoDetailId, todos],
  );
  const activeTodoDetailCanEdit = Boolean(activeTodoDetail && !activeTodoDetail.done);
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
      setActiveTodoDetailContentSelection({ end: 0, start: 0 });
      todoDetailDraftTodoIdRef.current = null;
      return;
    }

    if (todoDetailDraftTodoIdRef.current === activeTodoDetail.id) {
      return;
    }

    setActiveTodoDetailDraftContent(
      formatTodoDetailDraftContentForEditing(activeTodoDetail.content),
    );
    setActiveTodoDetailDraftText(activeTodoDetail.text);
    setActiveTodoDetailContentSelection({ end: 0, start: 0 });
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
      activeTodoDetailCanEdit &&
      (
        activeTodoDetail.text !== activeTodoDetailDraftTextForSave ||
        activeTodoDetail.content !== activeTodoDetailDraftContentForSave
      ),
  );
  const activeTodoDetailCanSave = Boolean(
    activeTodoDetail &&
      activeTodoDetailCanEdit &&
      activeTodoDetailHasChanges &&
      activeTodoDetailDraftTextForSave.length > 0,
  );
  const saveActiveTodoDetail = useCallback(() => {
    if (!activeTodoDetail || !activeTodoDetailCanEdit || !activeTodoDetailCanSave) {
      return;
    }

    const todoId = activeTodoDetail.id;
    const updatedTodo: Todo = {
      ...activeTodoDetail,
      content: activeTodoDetailDraftContentForSave,
      text: activeTodoDetailDraftTextForSave,
    };
    recordUndo('Edit todo');
    setTodos((current) =>
      current.map((todo) => (
        todo.id === todoId
          ? { ...todo, content: updatedTodo.content, text: updatedTodo.text }
          : todo
      )),
    );
    localTodoStore.upsert(updatedTodo).catch(() => undefined);
    syncTodoAlarm(updatedTodo).catch(() => undefined);
    highlightEditedTodos([todoId]);
    suppressNextHeaderSearchFocus();
    Keyboard.dismiss();
    setActiveTodoDetailId(null);
    setActiveTodoDetailDraftContent('');
    setActiveTodoDetailDraftText('');
    setActiveTodoDetailContentSelection({ end: 0, start: 0 });
    todoDetailDraftTodoIdRef.current = null;
    triggerSubtleHaptic();
  }, [
    activeTodoDetail,
    activeTodoDetailCanEdit,
    activeTodoDetailCanSave,
    activeTodoDetailDraftContentForSave,
    activeTodoDetailDraftTextForSave,
    highlightEditedTodos,
    recordUndo,
    suppressNextHeaderSearchFocus,
  ]);
  const menuFilters = activeTodoMenuFilters ?? selectedFilters;
  const menuSelectionFilters = activeTodoMenuSelectionFilters ?? selectedFilters;
  const includeActiveTodoReminderRows = hasTodoEditTargets;
  const menuRequiredFilters = hasTodoEditTargets ? EMPTY_SELECTED_FILTERS : requiredFilters;
  const menuAvoidedFilters = hasTodoEditTargets ? EMPTY_SELECTED_FILTERS : avoidedFilters;
  const activeFilterCount =
    countFilters(menuFilters, includeActiveTodoReminderRows) + countFilters(menuAvoidedFilters);
  const selectedFilterCount = countFilters(selectedFilters) + countFilters(avoidedFilters);
  const showSearchPresetSections = navTab === 'search' && searchMode === 'preset';
  const searchPresetQuery = query.trim();
  const searchPresetItems = useMemo<SearchPresetItem[]>(() => {
    const now = dateStatusNow;

    return menuPresets
      .map((preset, index) => {
        const count = todos.reduce((total, todo) => {
          if (pendingDeleteIds.has(todo.id)) {
            return total;
          }

          if (hideDoneTodos && preset.todoGroupMode !== 'status' && todo.done) {
            return total;
          }

          return todoMatchesFilters(
            todo,
            preset.filters,
            listMenuTree,
            now,
            preset.requiredFilters,
            preset.avoidedFilters,
          )
            ? total + 1
            : total;
        }, 0);
        const score = getPresetSearchScore(preset, searchPresetQuery);

        return {
          count,
          index,
          matchesQuery: Boolean(searchPresetQuery) && Number.isFinite(score),
          preset,
          score,
        };
      })
      .sort((first, second) => {
        if (searchPresetQuery) {
          if (first.matchesQuery !== second.matchesQuery) {
            return first.matchesQuery ? -1 : 1;
          }

          if (first.matchesQuery && second.matchesQuery && first.score !== second.score) {
            return first.score - second.score;
          }
        }

        return first.index - second.index;
      });
  }, [
    dateStatusNow,
    hideDoneTodos,
    listMenuTree,
    menuPresets,
    pendingDeleteIds,
    searchPresetQuery,
    todos,
  ]);
  const searchListMenuItems = useMemo<SearchListMenuItem[]>(() => (
    listMenuTree.map((node, index) => {
      const count = todos.reduce((total, todo) => {
        if (pendingDeleteIds.has(todo.id)) {
          return total;
        }

        if (hideDoneTodos && todo.done) {
          return total;
        }

        return todoMatchesSelectedListFilters([node.label], todo.filters.list, listMenuTree)
          ? total + 1
          : total;
      }, 0);
      const score = getListMenuSearchScore(node, searchPresetQuery);

      return {
        count,
        index,
        listIndex: index,
        matchesQuery: Boolean(searchPresetQuery) && Number.isFinite(score),
        node,
        score,
      };
    }).sort((first, second) => {
      if (searchPresetQuery) {
        if (first.matchesQuery !== second.matchesQuery) {
          return first.matchesQuery ? -1 : 1;
        }

        if (first.matchesQuery && second.matchesQuery && first.score !== second.score) {
          return first.score - second.score;
        }
      }

      return first.index - second.index;
    })
  ), [
    hideDoneTodos,
    listMenuTree,
    pendingDeleteIds,
    searchPresetQuery,
    todos,
  ]);
  const searchPresetTodosByPresetId = useMemo(() => {
    const now = dateStatusNow;
    const todosByPresetId = new Map<string, Todo[]>();

    searchPresetItems.forEach((item) => {
      const presetTodos = todos.filter((todo) => {
        if (pendingDeleteIds.has(todo.id)) {
          return false;
        }

        if (hideDoneTodos && item.preset.todoGroupMode !== 'status' && todo.done) {
          return false;
        }

        return todoMatchesFilters(
          todo,
          item.preset.filters,
          listMenuTree,
          now,
          item.preset.requiredFilters,
          item.preset.avoidedFilters,
        );
      });

      todosByPresetId.set(item.preset.id, presetTodos);
    });

    return todosByPresetId;
  }, [
    dateStatusNow,
    hideDoneTodos,
    listMenuTree,
    pendingDeleteIds,
    searchPresetItems,
    todos,
  ]);
  const searchListMenuTodosByLabel = useMemo(() => {
    const todosByLabel = new Map<string, Todo[]>();

    searchListMenuItems.forEach((item) => {
      const listTodos = todos.filter((todo) => {
        if (pendingDeleteIds.has(todo.id)) {
          return false;
        }

        if (hideDoneTodos && todo.done) {
          return false;
        }

        return todoMatchesSelectedListFilters([item.node.label], todo.filters.list, listMenuTree);
      });

      todosByLabel.set(item.node.label, listTodos);
    });

    return todosByLabel;
  }, [
    hideDoneTodos,
    listMenuTree,
    pendingDeleteIds,
    searchListMenuItems,
    todos,
  ]);
  const searchListRows = useMemo(
    () => [
      ...buildSearchListMenuRows(
        searchListMenuItems,
        collapsedSearchListLabels,
        searchListMenuTodosByLabel,
      ),
      ...buildSearchListRows(
        searchPresetItems,
        collapsedSearchPresetIds,
        searchPresetTodosByPresetId,
      ),
    ],
    [
      collapsedSearchListLabels,
      collapsedSearchPresetIds,
      searchListMenuItems,
      searchListMenuTodosByLabel,
      searchPresetItems,
      searchPresetTodosByPresetId,
    ],
  );
  const itemSearchRows = useMemo(
    () => (
      navTab === 'search' && searchMode === 'item' && searchQuery
        ? buildItemSearchRows(sortedTodos)
        : null
    ),
    [navTab, searchMode, searchQuery, sortedTodos],
  );
  const appTodoListData = useMemo<AppTodoListRow[]>(() => {
    if (itemSearchRows) {
      return itemSearchRows;
    }

    if (!showSearchPresetSections) {
      return visibleTodoListRows;
    }

    return searchListRows;
  }, [
    itemSearchRows,
    searchListRows,
    showSearchPresetSections,
    visibleTodoListRows,
  ]);
  const todoListOneHandedOffset = useMemo(() => {
    const viewportHeight = todoListFrameHeight || windowHeight;
    const calculatedOffset = Math.max(
      LIST_MENU_ROW_HEIGHT,
      Math.round(
        (viewportHeight * TODO_LIST_ONE_HANDED_SCROLL_RATIO) /
          LIST_MENU_ROW_HEIGHT,
      ) * LIST_MENU_ROW_HEIGHT,
    );

    if (appTodoListData.length === 0) {
      return navTab === 'search' ? calculatedOffset : 0;
    }

    return calculatedOffset;
  }, [appTodoListData.length, navTab, todoListFrameHeight, windowHeight]);
  const todoListSearchOffset = todoListOneHandedOffset;
  const todoListRestingOffset = todoListOneHandedOffset + HEADER_SEARCH_ROW_HEIGHT;
  const latestMenuPreset = menuPresets[menuPresets.length - 1] ?? null;
  const currentPresetSummary = formatPresetSummary(
    menuFilters,
    menuRequiredFilters,
    menuAvoidedFilters,
    effectiveSortMode,
    effectiveGroupMode,
    listOrderMode,
    metaTagVisibility,
  );
  const editingMenuPreset = editingMenuPresetId
    ? menuPresetById.get(editingMenuPresetId) ?? null
    : null;
  const openMenuPreset = openMenuPresetId
    ? menuPresetById.get(openMenuPresetId)
      ?? quickPresetNavVirtualPresetById.get(openMenuPresetId)
      ?? null
    : null;
  const hidePresetTodoSectionAddButton = navTab !== 'search' && Boolean(
    openMenuPreset || activeMenuPreset,
  );
  const openMenuPresetHasChanges = Boolean(
    openMenuPreset &&
      !hasTodoEditTargets &&
      !editingMenuPreset &&
      !menuPresetMatchesState(
        openMenuPreset,
        selectedFilters,
        requiredFilters,
        avoidedFilters,
        effectiveSortMode,
        effectiveGroupMode,
        listOrderMode,
        metaTagVisibility,
      ),
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
        type: 'value' as const,
      }));
    }

    if (menuMode === 'date') {
      const dateMenuItems = includeActiveTodoReminderRows
        ? getDateMenuItemsForDateLabels(DATE_PICKER_MENU_ITEMS, menuFilters.date)
        : DATE_MENU_ITEMS;

      return [
        ...dateMenuItems.map((label) => ({
          filterKey: 'date' as const,
          id: `date-${label}`,
          label,
          type: 'value' as const,
        })),
        ...(!includeActiveTodoReminderRows
          ? REPEAT_STATUS_FILTER_ITEMS.map((item) => ({
              filterKey: 'date' as const,
              id: `date-${item.id}`,
              label: item.value,
              type: 'value' as const,
            }))
          : []),
      ];
    }

    if (menuMode === 'filters') {
      const activeRows = [
        ...FILTER_KEYS.flatMap((filterKey) => menuFilters[filterKey].map((label) => ({
          filterKey,
          id: `filter-${filterKey}-${label}`,
          label,
          type: 'filter' as const,
        }))),
        ...REPEAT_STATUS_FILTER_ITEMS.flatMap((item) => (
          menuFilters.reminder.includes(item.value)
            ? [{
                filterKey: 'date' as const,
                id: `filter-${item.id}`,
                label: item.value,
                type: 'filter' as const,
              }]
            : []
        )),
      ];
      const activeRowKeys = new Set(activeRows.map((item) => `${item.filterKey}:${item.label}`));
      const avoidedRows = [
        ...FILTER_KEYS.flatMap((filterKey) => menuAvoidedFilters[filterKey].map((label) => ({
          filterKey,
          id: `filter-avoid-${filterKey}-${label}`,
          label,
          type: 'filter' as const,
        }))),
        ...REPEAT_STATUS_FILTER_ITEMS.flatMap((item) => (
          menuAvoidedFilters.reminder.includes(item.value)
            ? [{
                filterKey: 'date' as const,
                id: `filter-avoid-${item.id}`,
                label: item.value,
                type: 'filter' as const,
              }]
            : []
        )),
      ].filter((item) => !activeRowKeys.has(`${item.filterKey}:${item.label}`));

      return [
        ...activeRows,
        ...avoidedRows,
      ];
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
            latestMenuPreset.requiredFilters,
            latestMenuPreset.avoidedFilters,
            latestMenuPreset.todoSortMode,
            latestMenuPreset.todoGroupMode,
            latestMenuPreset.listOrderMode,
            latestMenuPreset.metaTagVisibility,
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
          label: 'Latest list',
          menuMode: 'presetsQuickApply',
          type: 'menu',
          valueLabel: latestMenuPreset.label,
        });
      }

      menuPresets.forEach((preset) => {
        rows.push({
          id: `preset-${preset.id}`,
          label: preset.label,
          preset,
          summary: formatPresetSummary(
            preset.filters,
            preset.requiredFilters,
            preset.avoidedFilters,
            preset.todoSortMode,
            preset.todoGroupMode,
            preset.listOrderMode,
            preset.metaTagVisibility,
          ),
          type: 'preset' as const,
        });

        preset.sections?.forEach((section) => {
          rows.push({
            id: `preset-section-${preset.id}-${section.id}`,
            label: section.label,
            preset,
            section,
            summary: formatPresetSummary(
              section.filters,
              section.requiredFilters,
              section.avoidedFilters,
              section.todoSortMode,
              section.todoGroupMode,
              section.listOrderMode,
              section.metaTagVisibility,
            ),
            type: 'presetSection' as const,
          });
        });
      });

      if (!hasTodoEditTargets) {
        rows.push({
          id: 'preset-save-current',
          label: 'Save current as list',
          summary: currentPresetSummary,
          type: 'savePreset' as const,
        });
      }

      return rows;
    }

    const pinActionRow: MenuRow | null = hasTodoEditTargets
      ? {
        id: 'main-pin',
        label: todoPinActionLabel,
        pinned: todoEditTargetsAllPinned,
        type: 'pinAction',
      }
      : null;

    if (todoSelectMode) {
      return [
        ...(pinActionRow ? [pinActionRow] : []),
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
          count: selectedTodoCount,
          id: 'main-delete-selected',
          label: 'Delete selected',
          type: 'deleteAction',
        },
      ];
    }

    const rows: MenuRow[] = [
      ...(pinActionRow ? [pinActionRow] : []),
      {
        count: (menuFilters.priority.length + menuAvoidedFilters.priority.length) || undefined,
        id: 'main-priority',
        label: 'Priority',
        menuMode: 'priority',
        type: 'menu',
      },
      {
        count: (
          countDateMenuSelections(menuFilters, includeActiveTodoReminderRows) +
          countDateMenuSelections(menuAvoidedFilters, includeActiveTodoReminderRows)
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
    menuAvoidedFilters,
    menuFilters,
    menuMode,
    menuPresets,
    openMenuPreset,
    effectiveGroupMode,
    effectiveSortMode,
    metaTagVisibility,
    selectedTodoCount,
    todoEditTargetsAllPinned,
    todoSelectMode,
    todoPinActionLabel,
    visibleListMenuItems,
  ]);

  useEffect(() => {
    const hasTodoRows = todoListOneHandedOffset > 1;

    if (skipNextTodoListOffsetEffectRef.current) {
      skipNextTodoListOffsetEffectRef.current = false;
      hadTodoListRowsRef.current = hasTodoRows;
      return undefined;
    }

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
    scrollOffsetY.current = todoListRestingOffset;
    actualScrollOffsetY.current = todoListRestingOffset;

    const frame = requestAnimationFrame(() => {
      todoListRef.current?.scrollToOffset({
        animated: false,
        offset: todoListRestingOffset,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [todoListOneHandedOffset, todoListRestingOffset]);

  useLayoutEffect(() => {
    if (navTab !== 'search' || previousSearchModeRef.current === searchMode) {
      previousSearchModeRef.current = searchMode;
      return;
    }

    previousSearchModeRef.current = searchMode;

    const savedOffset = searchScrollOffsetsByModeRef.current[searchMode];
    const defaultOffset = searchMode === 'preset'
      ? todoListRestingOffset
      : todoListSearchOffset;
    const offset = savedOffset ?? defaultOffset;

    scrollOffsetY.current = offset;
    actualScrollOffsetY.current = offset;

    const restoreScrollOffset = () => {
      todoListRef.current?.scrollToOffset({
        animated: false,
        offset,
      });
    };

    restoreScrollOffset();
    requestAnimationFrame(() => {
      restoreScrollOffset();
      requestAnimationFrame(restoreScrollOffset);
    });
  }, [navTab, searchMode, todoListRestingOffset, todoListSearchOffset]);

  const restoreSearchScroll = useCallback(() => {
    const savedOffset = savedSearchScrollOffsetRef.current;
    const offset = savedOffset ?? todoListSearchOffset;
    scrollOffsetY.current = offset;
    actualScrollOffsetY.current = offset;

    const restoreScrollOffset = () => {
      todoListRef.current?.scrollToOffset({
        animated: savedOffset === null,
        offset,
      });
    };

    requestAnimationFrame(() => {
      restoreScrollOffset();
      if (savedOffset !== null) {
        requestAnimationFrame(restoreScrollOffset);
      }
    });
  }, [todoListSearchOffset]);

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
    triggerSubtleHaptic();
  }, [
    hasTodoEditTargets,
    menuSelectionFilters,
    updateCurrentTodoTargetFilters,
  ]);

  const toggleRepeatingItemsFilter = useCallback(() => {
    clearNotificationTodoReveal();
    const nextFilters = {
      ...selectedFiltersRef.current,
      reminder: toggleRepeatingItemsFilterValue(selectedFiltersRef.current.reminder),
    };
    const nextRequiredFilters = pruneTodoFilters(requiredFiltersRef.current, nextFilters);
    const nextAvoidedFilters = removeSelectedValuesFromAvoidedFilters(
      avoidedFiltersRef.current,
      nextFilters,
    );

    if (
      filtersEqual(selectedFiltersRef.current, nextFilters) &&
      filtersEqual(requiredFiltersRef.current, nextRequiredFilters) &&
      filtersEqual(avoidedFiltersRef.current, nextAvoidedFilters)
    ) {
      return;
    }

    recordFilterConfigUndo('Change filters');
    setSelectedFilters(nextFilters);
    setRequiredFilters(nextRequiredFilters);
    setAvoidedFilters(nextAvoidedFilters);
    triggerSubtleHaptic();
  }, [clearNotificationTodoReveal, recordFilterConfigUndo]);

  const handleDateMenuLabelPress = useCallback((label: string) => {
    if (label === REPEATING_ITEMS_FILTER_VALUE) {
      toggleRepeatingItemsFilter();
      return;
    }

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
    toggleRepeatingItemsFilter,
  ]);

  const toggleRequiredFilterValue = useCallback((filterKey: FilterKey, value: string) => {
    if (hasTodoEditTargets) {
      return;
    }

    const formattedValue = filterKey === 'date'
      ? formatDateFilterValue(value)
      : value;
    const storedValue = isRepeatStatusFilterValue(value)
      ? value
      : formattedValue || value;
    const currentlyRequired = isFilterValueRequired(
      requiredFiltersRef.current,
      filterKey,
      value,
    );
    const currentlyAvoided = isFilterValueAvoided(
      avoidedFiltersRef.current,
      filterKey,
      value,
    );
    const ensureSelected = (current: SelectedFilters): SelectedFilters => {
      if (isRepeatStatusFilterValue(value)) {
        return current.reminder.includes(value)
          ? current
          : { ...current, reminder: [...removeRepeatStatusFilters(current.reminder), value] };
      }

      if (isFilterValueRequired(current, filterKey, value)) {
        return current;
      }

      return { ...current, [filterKey]: [...current[filterKey], storedValue] };
    };
    const currentFilters = cloneTodoFilters(selectedFiltersRef.current);
    const nextFilters = currentlyAvoided
      ? currentFilters
      : currentlyRequired
        ? removeFilterValueFromRequiredFilters(currentFilters, filterKey, value)
        : ensureSelected(currentFilters);
    const nextRequiredFilters = currentlyRequired
      ? removeFilterValueFromRequiredFilters(requiredFiltersRef.current, filterKey, value)
      : currentlyAvoided
        ? requiredFiltersRef.current
        : addFilterValueToRequiredFilters(requiredFiltersRef.current, filterKey, storedValue);
    const prunedRequiredFilters = pruneTodoFilters(nextRequiredFilters, nextFilters);
    const nextAvoidedFilters = currentlyAvoided
      ? removeFilterValueFromAvoidedFilters(avoidedFiltersRef.current, filterKey, value)
      : currentlyRequired
        ? addFilterValueToAvoidedFilters(avoidedFiltersRef.current, filterKey, storedValue)
        : removeFilterValueFromAvoidedFilters(avoidedFiltersRef.current, filterKey, value);

    if (
      filtersEqual(selectedFiltersRef.current, nextFilters) &&
      filtersEqual(requiredFiltersRef.current, prunedRequiredFilters) &&
      filtersEqual(avoidedFiltersRef.current, nextAvoidedFilters)
    ) {
      return;
    }

    clearNotificationTodoReveal();
    recordFilterConfigUndo('Change filters');
    setSelectedFilters(nextFilters);
    setRequiredFilters(prunedRequiredFilters);
    setAvoidedFilters(nextAvoidedFilters);
    triggerSubtleHaptic();
  }, [clearNotificationTodoReveal, hasTodoEditTargets, recordFilterConfigUndo]);

  const toggleRequiredListMenuItem = useCallback((item: VisibleListMenuItem) => {
    if (hasTodoEditTargets) {
      return;
    }

    const currentlyRequired = isFilterValueRequired(requiredFiltersRef.current, 'list', item.label);
    const currentlyAvoided = isFilterValueAvoided(avoidedFiltersRef.current, 'list', item.label);
    const ensureSelected = (current: SelectedFilters): SelectedFilters => {
      if (isListMenuItemSelected(item, current.list, listMenuTree)) {
        return current;
      }

      if (item.isSubsection && item.parentLabel) {
        const parentNode = findListMenuNode(listMenuTree, item.parentLabel);
        const siblingLabels = parentNode?.children?.map((child) => child.label) ?? [];
        const withoutFamily = current.list.filter(
          (label) => label !== item.parentLabel && !siblingLabels.includes(label),
        );

        return { ...current, list: [...withoutFamily, item.label] };
      }

      const childLabels = findListMenuNode(listMenuTree, item.label)?.children?.map((child) => (
        child.label
      )) ?? [];
      const withoutFamily = current.list.filter(
        (label) => label !== item.label && !childLabels.includes(label),
      );

      return { ...current, list: [...withoutFamily, item.label] };
    };
    const removeSelectedListItem = (current: SelectedFilters): SelectedFilters => {
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
    const currentFilters = cloneTodoFilters(selectedFiltersRef.current);
    const nextFilters = currentlyAvoided
      ? currentFilters
      : currentlyRequired
        ? removeSelectedListItem(currentFilters)
        : ensureSelected(currentFilters);
    const nextRequiredFilters = currentlyRequired
      ? removeFilterValueFromRequiredFilters(requiredFiltersRef.current, 'list', item.label)
      : currentlyAvoided
        ? requiredFiltersRef.current
        : addFilterValueToRequiredFilters(requiredFiltersRef.current, 'list', item.label);
    const prunedRequiredFilters = pruneTodoFilters(nextRequiredFilters, nextFilters);
    const nextAvoidedFilters = currentlyAvoided
      ? removeFilterValueFromAvoidedFilters(avoidedFiltersRef.current, 'list', item.label)
      : currentlyRequired
        ? addFilterValueToAvoidedFilters(avoidedFiltersRef.current, 'list', item.label)
        : removeFilterValueFromAvoidedFilters(avoidedFiltersRef.current, 'list', item.label);

    if (
      filtersEqual(selectedFiltersRef.current, nextFilters) &&
      filtersEqual(requiredFiltersRef.current, prunedRequiredFilters) &&
      filtersEqual(avoidedFiltersRef.current, nextAvoidedFilters)
    ) {
      return;
    }

    clearNotificationTodoReveal();
    recordFilterConfigUndo('Change filters');
    setSelectedFilters(nextFilters);
    setRequiredFilters(prunedRequiredFilters);
    setAvoidedFilters(nextAvoidedFilters);
    triggerSubtleHaptic();
  }, [clearNotificationTodoReveal, hasTodoEditTargets, listMenuTree, recordFilterConfigUndo]);

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

    triggerSubtleHaptic();
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

    const targetIds = getCurrentTodoEditTargetIds();
    if (targetIds.length > 0) {
      updateTodoFiltersForIds(targetIds, removeValue);
      triggerSubtleHaptic();
      return;
    }

    clearNotificationTodoReveal();
    const nextFilters = removeValue(cloneTodoFilters(selectedFiltersRef.current));
    const nextRequiredFilters = pruneTodoFilters(requiredFiltersRef.current, nextFilters);
    const nextAvoidedFilters = removeFilterValueFromAvoidedFilters(
      avoidedFiltersRef.current,
      'list',
      item.label,
    );

    if (
      filtersEqual(selectedFiltersRef.current, nextFilters) &&
      filtersEqual(requiredFiltersRef.current, nextRequiredFilters) &&
      filtersEqual(avoidedFiltersRef.current, nextAvoidedFilters)
    ) {
      return;
    }

    recordFilterConfigUndo('Change filters');
    setSelectedFilters(nextFilters);
    setRequiredFilters(nextRequiredFilters);
    setAvoidedFilters(nextAvoidedFilters);
    triggerSubtleHaptic();
  }, [
    clearNotificationTodoReveal,
    getCurrentTodoEditTargetIds,
    listMenuTree,
    recordFilterConfigUndo,
    updateTodoFiltersForIds,
  ]);

  const removeFilter = useCallback((filterKey: FilterKey, value: string) => {
    const removeValue = (current: SelectedFilters) => {
      if (isRepeatStatusFilterValue(value)) {
        return {
          ...current,
          reminder: current.reminder.filter((item) => item !== value),
        };
      }

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

    const targetIds = getCurrentTodoEditTargetIds();
    if (targetIds.length > 0) {
      updateTodoFiltersForIds(targetIds, removeValue);
      triggerSubtleHaptic();
      return;
    }

    clearNotificationTodoReveal();
    const nextFilters = removeValue(cloneTodoFilters(selectedFiltersRef.current));
    const nextRequiredFilters = pruneTodoFilters(requiredFiltersRef.current, nextFilters);
    const nextAvoidedFilters = removeFilterValueFromAvoidedFilters(
      avoidedFiltersRef.current,
      filterKey,
      value,
    );

    if (
      filtersEqual(selectedFiltersRef.current, nextFilters) &&
      filtersEqual(requiredFiltersRef.current, nextRequiredFilters) &&
      filtersEqual(avoidedFiltersRef.current, nextAvoidedFilters)
    ) {
      return;
    }

    recordFilterConfigUndo('Change filters');
    setSelectedFilters(nextFilters);
    setRequiredFilters(nextRequiredFilters);
    setAvoidedFilters(nextAvoidedFilters);
    triggerSubtleHaptic();
  }, [
    clearNotificationTodoReveal,
    getCurrentTodoEditTargetIds,
    recordFilterConfigUndo,
    updateTodoFiltersForIds,
  ]);

  const clearAppliedMenuPreset = useCallback((options: { skipUndo?: boolean } = {}) => {
    if (hasTodoEditTargets) {
      updateCurrentTodoTargetFilters(() => cloneTodoFilters());
    } else {
      const defaultFilters = cloneTodoFilters();
      const hasDurableChange =
        !filtersEqual(selectedFiltersRef.current, defaultFilters) ||
        !filtersEqual(requiredFiltersRef.current, defaultFilters) ||
        !filtersEqual(avoidedFiltersRef.current, defaultFilters) ||
        todoSortModeRef.current !== 'newest' ||
        todoGroupModeRef.current !== 'none' ||
        listOrderModeRef.current !== 'alphabetical';

      if (hasDurableChange && !options.skipUndo) {
        recordFilterConfigUndo('Clear filters');
      }
      clearNotificationTodoReveal();
      setSelectedFilters(defaultFilters);
      setRequiredFilters(defaultFilters);
      setAvoidedFilters(defaultFilters);
      setTodoSortMode('newest');
      setTodoGroupMode('none');
      setListOrderMode('alphabetical');
      setOpenMenuPresetId(null);
      setOpenQuickPresetNavSlotNumber(null);
    }

    closeListMenuState();
    Keyboard.dismiss();
    searchInputRef.current?.blur();
    setNavTab(null);
    triggerSubtleHaptic();
  }, [
    closeListMenuState,
    clearNotificationTodoReveal,
    hasTodoEditTargets,
    recordFilterConfigUndo,
    updateCurrentTodoTargetFilters,
  ]);

  const clearFilters = useCallback(() => {
    clearAppliedMenuPreset();
  }, [clearAppliedMenuPreset]);

  const setFilterColor = useCallback((
    filterKey: FilterColorSettingKey,
    value: string,
    color: string | null,
  ) => {
    const nextColorKey = color?.toUpperCase() ?? null;
    const currentColorKey = getFilterColor(
      filterColorsRef.current,
      filterKey,
      value,
    )?.toUpperCase() ?? null;

    if (currentColorKey === nextColorKey) {
      return;
    }

    recordUndo('Change color');
    filterColorsRef.current = {
      ...filterColorsRef.current,
      [filterKey]: {
        ...filterColorsRef.current[filterKey],
        [value]: color,
      },
    };
    setFilterColors((current) => {
      const latestColorKey = getFilterColor(current, filterKey, value)?.toUpperCase() ?? null;

      if (latestColorKey === nextColorKey) {
        return current;
      }

      return {
        ...current,
        [filterKey]: {
          ...current[filterKey],
          [value]: color,
        },
      };
    });
    triggerSubtleHaptic();
  }, [recordUndo]);

  const selectTodoSortMode = useCallback((sortMode: TodoSortMode) => {
    if (effectiveSortMode === sortMode) {
      return;
    }

    clearNotificationTodoReveal();
    const display = resolveListDisplaySettings(
      listMenuTree,
      selectedFilters.list,
      todoSortMode,
      todoGroupMode,
    );

    recordFilterConfigUndo('Change sort');
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

    triggerSubtleHaptic();
  }, [
    clearNotificationTodoReveal,
    effectiveSortMode,
    listMenuTree,
    recordFilterConfigUndo,
    selectedFilters.list,
    todoGroupMode,
    todoSortMode,
  ]);

  const toggleTodoGroupCollapsed = useCallback((groupId: string) => {
    triggerSubtleHaptic();
    setCollapsedTodoGroupIds((current) => {
      const next = new Set(current);

      if (next.has(groupId)) {
        next.delete(groupId);
        return next;
      }

      next.add(groupId);
      return next;
    });
  }, []);

  useEffect(() => {
    setCollapsedSearchPresetIds((current) => {
      const next = new Set(current);
      let changed = false;

      menuPresets.forEach((preset) => {
        if (!next.has(preset.id)) {
          next.add(preset.id);
          changed = true;
        }
      });

      for (const presetId of next) {
        if (!menuPresets.some((preset) => preset.id === presetId)) {
          next.delete(presetId);
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [menuPresets]);

  const toggleSearchPresetCollapsed = useCallback((presetId: string) => {
    triggerSubtleHaptic();
    pendingSearchPresetScrollOffsetRef.current = actualScrollOffsetY.current;
    setCollapsedSearchPresetIds((current) => {
      const next = new Set(current);

      if (next.has(presetId)) {
        next.delete(presetId);
        return next;
      }

      next.add(presetId);
      return next;
    });
  }, []);

  const toggleSearchListCollapsed = useCallback((listLabel: string) => {
    triggerSubtleHaptic();
    pendingSearchPresetScrollOffsetRef.current = actualScrollOffsetY.current;
    setCollapsedSearchListLabels((current) => {
      const next = new Set(current);

      if (next.has(listLabel)) {
        next.delete(listLabel);
        return next;
      }

      next.add(listLabel);
      return next;
    });
  }, []);

  const toggleAllSearchSections = useCallback(() => {
    const presetIds = searchPresetItems.map((item) => item.preset.id);
    const listLabels = searchListMenuItems.map((item) => item.node.label);

    if (presetIds.length === 0 && listLabels.length === 0) {
      return;
    }

    pendingSearchPresetScrollOffsetRef.current = actualScrollOffsetY.current;
    triggerSubtleHaptic();

    const allPresetsCollapsed = presetIds.every((presetId) => (
      collapsedSearchPresetIds.has(presetId)
    ));
    const allListsCollapsed = listLabels.every((listLabel) => (
      collapsedSearchListLabels.has(listLabel)
    ));
    const shouldExpandAll = allPresetsCollapsed && allListsCollapsed;

    setCollapsedSearchPresetIds((current) => {
      const next = new Set(current);
      let changed = false;

      if (shouldExpandAll) {
        presetIds.forEach((presetId) => {
          if (next.delete(presetId)) {
            changed = true;
          }
        });
      } else {
        presetIds.forEach((presetId) => {
          if (!next.has(presetId)) {
            next.add(presetId);
            changed = true;
          }
        });
      }

      return changed ? next : current;
    });

    setCollapsedSearchListLabels((current) => {
      const next = new Set(current);
      let changed = false;

      if (shouldExpandAll) {
        listLabels.forEach((listLabel) => {
          if (next.delete(listLabel)) {
            changed = true;
          }
        });
      } else {
        listLabels.forEach((listLabel) => {
          if (!next.has(listLabel)) {
            next.add(listLabel);
            changed = true;
          }
        });
      }

      return changed ? next : current;
    });
  }, [
    collapsedSearchListLabels,
    collapsedSearchPresetIds,
    searchListMenuItems,
    searchPresetItems,
  ]);

  useLayoutEffect(() => {
    const preservedOffset = pendingSearchPresetScrollOffsetRef.current;

    if (preservedOffset === null || !showSearchPresetSections) {
      return;
    }

    pendingSearchPresetScrollOffsetRef.current = null;

    const restoreScrollOffset = () => {
      todoListRef.current?.scrollToOffset({
        animated: false,
        offset: preservedOffset,
      });
      scrollOffsetY.current = preservedOffset;
      actualScrollOffsetY.current = preservedOffset;
    };

    requestAnimationFrame(() => {
      restoreScrollOffset();
      requestAnimationFrame(restoreScrollOffset);
    });
  }, [collapsedSearchListKey, collapsedSearchPresetKey, showSearchPresetSections]);

  const toggleMetaTagVisibility = useCallback((key: MetaTagKey) => {
    recordFilterConfigUndo('Change meta tags');
    setMetaTagVisibility((current) => ({
      ...current,
      [key]: !current[key],
    }));
    triggerSubtleHaptic();
  }, [recordFilterConfigUndo]);

  const toggleHideDoneTodos = useCallback(() => {
    clearNotificationTodoReveal();
    recordUndo('Change done visibility');
    setHideDoneTodos((current) => !current);
    triggerSubtleHaptic();
  }, [clearNotificationTodoReveal, recordUndo]);

  const toggleDateLabelDisplayMode = useCallback(() => {
    recordFilterConfigUndo('Change date labels');
    setDateLabelDisplayMode((current) => (
      current === 'remaining' ? 'exact' : 'remaining'
    ));
    triggerSubtleHaptic();
  }, [recordFilterConfigUndo]);

  const toggleShowOverdueMetaTags = useCallback(() => {
    recordUndo('Change overdue labels');
    setShowOverdueMetaTags((current) => !current);
    triggerSubtleHaptic();
  }, [recordUndo]);

  const getDateMenuDisplayLabel = useCallback(
    (menuLabel: string, dateLabels: string[]) =>
      getDateMenuItemDisplayLabel(menuLabel, dateLabels, dateLabelDisplayMode),
    [dateLabelDisplayMode],
  );

  const selectTodoGroupMode = useCallback((groupMode: TodoGroupMode) => {
    if (effectiveGroupMode === groupMode) {
      return;
    }

    clearNotificationTodoReveal();
    const display = resolveListDisplaySettings(
      listMenuTree,
      selectedFilters.list,
      todoSortMode,
      todoGroupMode,
    );

    recordFilterConfigUndo('Change group');
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

    triggerSubtleHaptic();
  }, [
    clearNotificationTodoReveal,
    effectiveGroupMode,
    listMenuTree,
    recordFilterConfigUndo,
    selectedFilters.list,
    todoGroupMode,
    todoSortMode,
  ]);

  const clearMenuSection = useCallback((section: MenuMode) => {
    const filterKey = MENU_SECTION_FILTER_KEYS[section];

    if (filterKey) {
      const clearKey = (current: SelectedFilters) => {
        const nextFilters: SelectedFilters = {
          ...current,
          [filterKey]: [],
        };

        if (filterKey === 'date') {
          nextFilters.reminder = includeActiveTodoReminderRows
            ? []
            : removeRepeatStatusFilters(current.reminder);
        }

        return nextFilters;
      };

      if (!hasTodoEditTargets) {
        clearNotificationTodoReveal();
        const nextFilters = clearKey(cloneTodoFilters(selectedFiltersRef.current));
        const nextRequiredFilters = pruneTodoFilters(requiredFiltersRef.current, nextFilters);
        const nextAvoidedFilters = clearKey(cloneTodoFilters(avoidedFiltersRef.current));

        if (
          filtersEqual(selectedFiltersRef.current, nextFilters) &&
          filtersEqual(requiredFiltersRef.current, nextRequiredFilters) &&
          filtersEqual(avoidedFiltersRef.current, nextAvoidedFilters)
        ) {
          return;
        }

        recordFilterConfigUndo('Change filters');
        setSelectedFilters(nextFilters);
        setRequiredFilters(nextRequiredFilters);
        setAvoidedFilters(nextAvoidedFilters);
        triggerSubtleHaptic();
        return;
      }

      updateCurrentTodoTargetFilters(clearKey);
      triggerSubtleHaptic();
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
      clearNotificationTodoReveal();
      const display = resolveListDisplaySettings(
        listMenuTree,
        selectedFilters.list,
        todoSortMode,
        todoGroupMode,
      );

      recordFilterConfigUndo('Clear sort');
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

      triggerSubtleHaptic();
      return;
    }

    if (section === 'group') {
      clearNotificationTodoReveal();
      const display = resolveListDisplaySettings(
        listMenuTree,
        selectedFilters.list,
        todoSortMode,
        todoGroupMode,
      );

      recordFilterConfigUndo('Clear group');
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

      triggerSubtleHaptic();
      return;
    }

    if (section === 'metaTags') {
      if (metaTagVisibilityMatchesDefault(metaTagVisibility)) {
        return;
      }

      recordFilterConfigUndo('Clear meta tags');
      setMetaTagVisibility(cloneMetaTagVisibility(DEFAULT_META_TAG_VISIBILITY));
      triggerSubtleHaptic();
    }
  }, [
    clearAppliedMenuPreset,
    clearFilters,
    clearNotificationTodoReveal,
    hasTodoEditTargets,
    includeActiveTodoReminderRows,
    listMenuTree,
    metaTagVisibility,
    recordFilterConfigUndo,
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
    const presetId = `preset-${createdAt}-${Math.random().toString(36).slice(2)}`;
    const preset: MenuPreset = {
      id: presetId,
      label,
      filters: cloneTodoFilters(menuFilters),
      requiredFilters: pruneTodoFilters(menuRequiredFilters, menuFilters),
      avoidedFilters: cloneTodoFilters(menuAvoidedFilters),
      listOrderMode,
      metaTagVisibility: cloneMetaTagVisibility(metaTagVisibility),
      todoGroupMode: effectiveGroupMode,
      todoSortMode: effectiveSortMode,
      createdAt,
    };

    recordUndo('Save list');
    setMenuPresets((current) => [...current, preset]);
    setOpenMenuPresetId(presetId);
    setOpenQuickPresetNavSlotNumber(null);
    closePresetSaveModal();
    triggerSubtleHaptic();
  }, [
    closePresetSaveModal,
    effectiveGroupMode,
    effectiveSortMode,
    listOrderMode,
    menuFilters,
    menuRequiredFilters,
    menuAvoidedFilters,
    metaTagVisibility,
    recordUndo,
  ]);

  const scheduleSearchKeywordModalInputFocus = useCallback(() => {
    const attemptFocus = () => {
      if (searchKeywordEditTarget?.kind === 'list') {
        listSearchKeywordTitleInputRef.current?.focus();
        return;
      }

      presetSearchKeywordInputRef.current?.focus();
    };

    attemptFocus();

    const timers = (Platform.OS === 'ios' ? [80, 200, 420] : [40, 140, 280]).map(
      (delay) => setTimeout(attemptFocus, delay),
    );

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [searchKeywordEditTarget?.kind]);

  const openPresetSearchKeywordPrompt = useCallback((preset: MenuPreset) => {
    triggerSubtleHaptic();
    Keyboard.dismiss();
    searchInputRef.current?.blur();
    setSearchKeywordEditTarget({ kind: 'preset', presetId: preset.id });
    setSearchKeywordDraft(preset.searchKeywords ?? '');
  }, []);

  const openSettingsListKeywordPrompt = useCallback((listIndex: number) => {
    const listItem = listMenuTree[listIndex];
    if (!listItem) {
      return;
    }

    triggerSubtleHaptic();
    Keyboard.dismiss();
    setSearchKeywordEditTarget({ kind: 'list', listIndex });
    setSearchKeywordTitleDraft(listItem.label);
    setSearchKeywordDraft(listItem.searchKeywords ?? '');
  }, [listMenuTree]);

  const applyListLabelRename = useCallback((oldLabel: string, newLabel: string) => {
    if (oldLabel === newLabel) {
      return;
    }

    const replaceLabel = (labels: string[]) => labels.map(
      (label) => (label === oldLabel ? newLabel : label),
    );

    setSelectedFilters((filters) => ({
      ...filters,
      list: replaceLabel(filters.list),
    }));
    setRequiredFilters((filters) => ({
      ...filters,
      list: replaceLabel(filters.list),
    }));
    setAvoidedFilters((filters) => ({
      ...filters,
      list: replaceLabel(filters.list),
    }));
    setLastCreateTodoFilters((filters) => ({
      ...filters,
      list: replaceLabel(filters.list),
    }));
    setCollapsedSearchListLabels((current) => {
      if (!current.has(oldLabel)) {
        return current;
      }

      const next = new Set(current);
      next.delete(oldLabel);
      next.add(newLabel);
      return next;
    });
    setFilterColors((colors) => {
      if (!(oldLabel in colors.list)) {
        return colors;
      }

      const nextList = { ...colors.list };
      const existingColor = nextList[oldLabel];
      delete nextList[oldLabel];
      if (existingColor !== undefined) {
        nextList[newLabel] = existingColor;
      }

      return { ...colors, list: nextList };
    });
    setMenuPresets((current) => current.map((preset) => ({
      ...preset,
      filters: {
        ...preset.filters,
        list: replaceLabel(preset.filters.list),
      },
      requiredFilters: {
        ...preset.requiredFilters,
        list: replaceLabel(preset.requiredFilters.list),
      },
      avoidedFilters: {
        ...preset.avoidedFilters,
        list: replaceLabel(preset.avoidedFilters.list),
      },
      sections: preset.sections?.map((section) => ({
        ...section,
        filters: {
          ...section.filters,
          list: replaceLabel(section.filters.list),
        },
        requiredFilters: {
          ...section.requiredFilters,
          list: replaceLabel(section.requiredFilters.list),
        },
        avoidedFilters: {
          ...section.avoidedFilters,
          list: replaceLabel(section.avoidedFilters.list),
        },
      })),
    })));
    setDeletedTodos((current) => current.map((todo) => ({
      ...todo,
      filters: {
        ...todo.filters,
        list: replaceLabel(todo.filters.list),
      },
    })));
    setTodos((items) => {
      const nextItems = items.map((todo) => ({
        ...todo,
        filters: {
          ...todo.filters,
          list: replaceLabel(todo.filters.list),
        },
      }));
      localTodoStore
        .upsertMany(nextItems.filter((todo) => !pendingDeleteIds.has(todo.id)))
        .catch(() => undefined);
      return nextItems;
    });
  }, [pendingDeleteIds]);

  const commitSearchKeywords = useCallback((rawKeywords: string) => {
    if (!searchKeywordEditTarget) {
      return;
    }

    const searchKeywords = normalizePresetSearchKeywords(rawKeywords);

    if (searchKeywordEditTarget.kind === 'preset') {
      const { presetId } = searchKeywordEditTarget;
      const currentPreset = menuPresets.find((preset) => preset.id === presetId);
      if ((currentPreset?.searchKeywords ?? '') === searchKeywords) {
        closeSearchKeywordModal();
        return;
      }

      recordUndo('Edit list keywords');
      setMenuPresets((current) => current.map((preset) => (
        preset.id === presetId
          ? {
              ...preset,
              searchKeywords: searchKeywords || undefined,
            }
          : preset
      )));
    } else {
      const { listIndex } = searchKeywordEditTarget;
      const currentItem = listMenuTree[listIndex];
      if (!currentItem) {
        return;
      }

      const newLabel = formatListLabel(searchKeywordTitleDraft);
      if (!newLabel) {
        return;
      }

      const oldLabel = currentItem.label;
      const labelChanged = oldLabel !== newLabel;
      const currentKeywords = currentItem.searchKeywords ?? '';
      if (!labelChanged && currentKeywords === searchKeywords) {
        closeSearchKeywordModal();
        return;
      }

      if (labelChanged) {
        const hasDuplicate = collectListNodeLabels(listMenuTree).some(
          (label) => label.toLocaleLowerCase() === newLabel.toLocaleLowerCase(),
        );
        if (hasDuplicate) {
          return;
        }

        recordUndo('Edit list');
        applyListLabelRename(oldLabel, newLabel);
      } else {
        recordUndo('Edit list');
      }

      setListMenuTree((current) => {
        const next = current.map((item, itemIndex) => {
          if (itemIndex !== listIndex) {
            return item;
          }

          let updated = labelChanged ? { ...item, label: newLabel } : item;

          if (!searchKeywords) {
            const { searchKeywords: _removed, ...rest } = updated;
            return rest;
          }

          return { ...updated, searchKeywords };
        });
        persistListMenuTree(next);
        return next;
      });
    }

    closeSearchKeywordModal();
    triggerSubtleHaptic();
  }, [
    applyListLabelRename,
    closeSearchKeywordModal,
    listMenuTree,
    menuPresets,
    persistListMenuTree,
    recordUndo,
    searchKeywordEditTarget,
    searchKeywordTitleDraft,
  ]);

  const focusPresetSaveInput = useCallback(() => {
    searchInputRef.current?.blur();
    presetSaveInputRef.current?.focus();
  }, []);

  const openSavePresetPrompt = useCallback(() => {
    Keyboard.dismiss();
    searchInputRef.current?.blur();
    setPresetSaveName(`List ${menuPresets.length + 1}`);
    setPresetSaveModalVisible(true);
    triggerSubtleHaptic();
  }, [menuPresets.length]);

  useEffect(() => {
    if (!presetSaveModalVisible) {
      return;
    }

    const focusTimer = setTimeout(focusPresetSaveInput, 100);

    return () => clearTimeout(focusTimer);
  }, [focusPresetSaveInput, presetSaveModalVisible]);

  useEffect(() => {
    if (!searchKeywordModalVisible) {
      return undefined;
    }

    const clearFocusTimers = scheduleSearchKeywordModalInputFocus();
    const keyboardHideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    let keyboardHideFocusTimer: ReturnType<typeof setTimeout> | null = null;

    const hideSubscription = Keyboard.addListener(keyboardHideEvent, () => {
      if (keyboardHideFocusTimer) {
        clearTimeout(keyboardHideFocusTimer);
      }

      keyboardHideFocusTimer = setTimeout(
        () => {
          if (searchKeywordEditTarget?.kind === 'list') {
            listSearchKeywordTitleInputRef.current?.focus();
            return;
          }

          presetSearchKeywordInputRef.current?.focus();
        },
        Platform.OS === 'ios' ? 80 : 0,
      );
    });

    return () => {
      clearFocusTimers();
      hideSubscription.remove();
      if (keyboardHideFocusTimer) {
        clearTimeout(keyboardHideFocusTimer);
      }
    };
  }, [
    scheduleSearchKeywordModalInputFocus,
    searchKeywordEditTarget?.kind,
    searchKeywordModalVisible,
  ]);

  const applyMenuPreset = useCallback((
    preset: MenuPreset,
    options?: { closeMenu?: boolean; haptic?: boolean },
  ) => {
    const nextFilters = cloneTodoFilters(preset.filters);
    const singleListFilter = nextFilters.list.length === 1 ? nextFilters.list[0] : null;
    const appliesStoredAllListsBoard =
      preset.todoGroupMode === 'list' &&
      isAllListsBoardPresetLabel(preset.label) &&
      singleListFilter !== null &&
      isAllListsBoardPresetLabel(singleListFilter);

    if (appliesStoredAllListsBoard) {
      nextFilters.list = [];
    }

    const nextRequiredFilters = pruneTodoFilters(preset.requiredFilters, nextFilters);
    const nextAvoidedFilters = cloneTodoFilters(preset.avoidedFilters);

    if (hasTodoEditTargets) {
      updateCurrentTodoTargetFilters(() => cloneTodoFilters(nextFilters));
    } else {
      clearNotificationTodoReveal();
      setSelectedFilters((current) => (
        filtersEqual(current, nextFilters) ? current : nextFilters
      ));
      setRequiredFilters((current) => (
        filtersEqual(current, nextRequiredFilters) ? current : nextRequiredFilters
      ));
      setAvoidedFilters((current) => (
        filtersEqual(current, nextAvoidedFilters) ? current : nextAvoidedFilters
      ));
      setListOrderMode(preset.listOrderMode);
      setTodoGroupMode(preset.todoGroupMode);
      setTodoSortMode(preset.todoSortMode);
      setListMenuTree((current) => syncListDisplaySettingsForSingleListPreset(
        current,
        nextFilters.list,
        preset.todoSortMode,
        preset.todoGroupMode,
      ));
      if (preset.metaTagVisibility) {
        setMetaTagVisibility(cloneMetaTagVisibility(preset.metaTagVisibility));
      }
      setOpenMenuPresetId(preset.id);
      setOpenQuickPresetNavSlotNumber(null);
    }

    if (options?.closeMenu !== false) {
      closeListMenuState();
    }

    if (options?.haptic ?? true) {
      triggerSubtleHaptic();
    }
  }, [
    closeListMenuState,
    clearNotificationTodoReveal,
    hasTodoEditTargets,
    updateCurrentTodoTargetFilters,
  ]);

  const applyPresetSection = useCallback((
    preset: MenuPreset,
    section: MenuPresetSection,
  ) => {
    const nextFilters = cloneTodoFilters(section.filters);
    const nextRequiredFilters = pruneTodoFilters(section.requiredFilters, nextFilters);
    const nextAvoidedFilters = cloneTodoFilters(section.avoidedFilters);

    if (hasTodoEditTargets) {
      updateCurrentTodoTargetFilters(() => cloneTodoFilters(nextFilters));
    } else {
      clearNotificationTodoReveal();
      setSelectedFilters((current) => (
        filtersEqual(current, nextFilters) ? current : nextFilters
      ));
      setRequiredFilters((current) => (
        filtersEqual(current, nextRequiredFilters) ? current : nextRequiredFilters
      ));
      setAvoidedFilters((current) => (
        filtersEqual(current, nextAvoidedFilters) ? current : nextAvoidedFilters
      ));
      setListOrderMode(section.listOrderMode);
      setTodoGroupMode(section.todoGroupMode);
      setTodoSortMode(section.todoSortMode);
      setListMenuTree((current) => syncListDisplaySettingsForSingleListPreset(
        current,
        nextFilters.list,
        section.todoSortMode,
        section.todoGroupMode,
      ));
      if (section.metaTagVisibility) {
        setMetaTagVisibility(cloneMetaTagVisibility(section.metaTagVisibility));
      }
      setOpenMenuPresetId(preset.id);
      setOpenQuickPresetNavSlotNumber(null);
    }

    closeListMenuState();
    triggerSubtleHaptic();
  }, [
    clearNotificationTodoReveal,
    closeListMenuState,
    hasTodoEditTargets,
    updateCurrentTodoTargetFilters,
  ]);

  const addPresetSection = useCallback((presetId: string) => {
    if (hasTodoEditTargets) {
      return;
    }

    const currentPreset = menuPresets.find((preset) => preset.id === presetId);
    if (!currentPreset) {
      return;
    }

    const duplicateSection = currentPreset.sections?.some((section) => (
      presetSectionMatchesState(
        section,
        menuFilters,
        menuRequiredFilters,
        menuAvoidedFilters,
        effectiveSortMode,
        effectiveGroupMode,
        listOrderMode,
        metaTagVisibility,
      )
    ));

    if (duplicateSection) {
      triggerSubtleHaptic();
      return;
    }

    const createdAt = Date.now();
    const label = getUniquePresetSectionLabel(
      currentPreset.sections,
      formatPresetSectionLabel(menuFilters, dateLabelDisplayMode),
    );
    const section: MenuPresetSection = {
      id: `section-${createdAt}-${Math.random().toString(36).slice(2)}`,
      label,
      filters: cloneTodoFilters(menuFilters),
      requiredFilters: pruneTodoFilters(menuRequiredFilters, menuFilters),
      avoidedFilters: cloneTodoFilters(menuAvoidedFilters),
      listOrderMode,
      metaTagVisibility: cloneMetaTagVisibility(metaTagVisibility),
      todoGroupMode: effectiveGroupMode,
      todoSortMode: effectiveSortMode,
      createdAt,
    };

    recordUndo('Add list section');
    setMenuPresets((current) => current.map((preset) => (
      preset.id === presetId
        ? {
            ...preset,
            sections: [...(preset.sections ?? []), section],
          }
        : preset
    )));
    triggerSubtleHaptic();
  }, [
    dateLabelDisplayMode,
    effectiveGroupMode,
    effectiveSortMode,
    hasTodoEditTargets,
    listOrderMode,
    metaTagVisibility,
    menuAvoidedFilters,
    menuFilters,
    menuPresets,
    menuRequiredFilters,
    recordUndo,
  ]);

  const removePresetSection = useCallback((presetId: string, sectionId: string) => {
    const preset = menuPresets.find((item) => item.id === presetId);
    if (!preset?.sections?.some((section) => section.id === sectionId)) {
      return;
    }

    recordUndo('Delete list section');
    setMenuPresets((current) => current.map((item) => {
      if (item.id !== presetId) {
        return item;
      }

      const sections = item.sections?.filter((section) => section.id !== sectionId) ?? [];
      return {
        ...item,
        ...(sections.length > 0 ? { sections } : { sections: undefined }),
      };
    }));
    triggerSubtleHaptic();
  }, [menuPresets, recordUndo]);

  const openMenuPresetEditor = useCallback((preset: MenuPreset) => {
    applyMenuPreset(preset, {
      closeMenu: false,
      haptic: false,
    });
    setEditingMenuPresetId(preset.id);
    setMenuMode('main');
    triggerSubtleHaptic();
  }, [applyMenuPreset]);

  const updateEditingMenuPreset = useCallback(() => {
    if (!editingMenuPresetId) {
      return;
    }

    const currentPreset = menuPresets.find((preset) => preset.id === editingMenuPresetId);
    if (!currentPreset) {
      return;
    }

    const hasChanges =
      !filtersEqual(currentPreset.filters, menuFilters) ||
      !filtersEqual(
        currentPreset.requiredFilters,
        pruneTodoFilters(menuRequiredFilters, menuFilters),
      ) ||
      !filtersEqual(currentPreset.avoidedFilters, menuAvoidedFilters) ||
      currentPreset.listOrderMode !== listOrderMode ||
      currentPreset.todoGroupMode !== effectiveGroupMode ||
      currentPreset.todoSortMode !== effectiveSortMode ||
      !(
        currentPreset.metaTagVisibility &&
        metaTagVisibilityEqual(currentPreset.metaTagVisibility, metaTagVisibility)
      );

    if (!hasChanges) {
      setEditingMenuPresetId(null);
      setMenuMode('presets');
      return;
    }

    recordUndo('Update list');
    setMenuPresets((current) => current.map((preset) => (
      preset.id === editingMenuPresetId
        ? {
            ...preset,
            filters: cloneTodoFilters(menuFilters),
            requiredFilters: pruneTodoFilters(menuRequiredFilters, menuFilters),
            avoidedFilters: cloneTodoFilters(menuAvoidedFilters),
            listOrderMode,
            metaTagVisibility: cloneMetaTagVisibility(metaTagVisibility),
            todoGroupMode: effectiveGroupMode,
            todoSortMode: effectiveSortMode,
          }
        : preset
    )));
    setEditingMenuPresetId(null);
    setMenuMode('presets');
    triggerSubtleHaptic();
  }, [
    editingMenuPresetId,
    effectiveGroupMode,
    effectiveSortMode,
    listOrderMode,
    menuFilters,
    menuRequiredFilters,
    menuAvoidedFilters,
    menuPresets,
    metaTagVisibility,
    recordUndo,
  ]);

  const saveOpenMenuPreset = useCallback((presetId: string) => {
    const currentPreset = menuPresets.find((preset) => preset.id === presetId)
      ?? quickPresetNavVirtualPresetById.get(presetId);
    if (!currentPreset) {
      return;
    }
    const existingPreset = menuPresets.some((preset) => preset.id === presetId);

    const hasChanges =
      !filtersEqual(currentPreset.filters, selectedFilters) ||
      !filtersEqual(
        currentPreset.requiredFilters,
        pruneTodoFilters(requiredFilters, selectedFilters),
      ) ||
      !filtersEqual(currentPreset.avoidedFilters, avoidedFilters) ||
      currentPreset.listOrderMode !== listOrderMode ||
      currentPreset.todoGroupMode !== effectiveGroupMode ||
      currentPreset.todoSortMode !== effectiveSortMode ||
      !(
        currentPreset.metaTagVisibility &&
        metaTagVisibilityEqual(currentPreset.metaTagVisibility, metaTagVisibility)
      );

    if (!hasChanges) {
      setOpenMenuPresetId(presetId);
      setEditingMenuPresetId(null);
      setMenuMode('main');
      return;
    }

    recordUndo('Update list');
    if (existingPreset) {
      setMenuPresets((current) => current.map((preset) => (
        preset.id === presetId
          ? {
              ...preset,
              filters: cloneTodoFilters(selectedFilters),
              requiredFilters: pruneTodoFilters(requiredFilters, selectedFilters),
              avoidedFilters: cloneTodoFilters(avoidedFilters),
              listOrderMode,
              metaTagVisibility: cloneMetaTagVisibility(metaTagVisibility),
              todoGroupMode: effectiveGroupMode,
              todoSortMode: effectiveSortMode,
            }
          : preset
      )));
      setOpenMenuPresetId(presetId);
    } else {
      const createdAt = Date.now();
      const savedPresetId = `preset-${createdAt}-${Math.random().toString(36).slice(2)}`;
      const savedPreset: MenuPreset = {
        ...currentPreset,
        id: savedPresetId,
        filters: cloneTodoFilters(selectedFilters),
        requiredFilters: pruneTodoFilters(requiredFilters, selectedFilters),
        avoidedFilters: cloneTodoFilters(avoidedFilters),
        listOrderMode,
        metaTagVisibility: cloneMetaTagVisibility(metaTagVisibility),
        todoGroupMode: effectiveGroupMode,
        todoSortMode: effectiveSortMode,
        createdAt,
      };

      setMenuPresets((current) => [...current, savedPreset]);
      if (openQuickPresetNavIndex !== null) {
        setQuickPresetNavPresetIds((current) => {
          const nextLength = Math.max(
            current.length,
            quickPresetNavIconNames.length,
            listMenuTree.length,
            openQuickPresetNavIndex + 1,
          );
          const next = Array.from({ length: nextLength }, (_, index) => current[index] ?? null);
          next[openQuickPresetNavIndex] = savedPresetId;
          return next;
        });
      }
      setOpenMenuPresetId(savedPresetId);
    }
    setEditingMenuPresetId(null);
    setMenuMode('main');
    triggerSubtleHaptic();
  }, [
    effectiveGroupMode,
    effectiveSortMode,
    listOrderMode,
    listMenuTree.length,
    menuPresets,
    openQuickPresetNavIndex,
    quickPresetNavIconNames.length,
    quickPresetNavVirtualPresetById,
    recordUndo,
    avoidedFilters,
    metaTagVisibility,
    requiredFilters,
    selectedFilters,
  ]);

  const listMenuPresetSaveLabel = editingMenuPreset
    ? `Save list ${editingMenuPreset.label}`
    : openMenuPreset
      ? `Save list ${openMenuPreset.label}`
      : 'Save list';
  const canSaveListMenuPreset = Boolean(
    editingMenuPreset || (openMenuPresetHasChanges && openMenuPreset),
  );
  const saveListMenuPreset = useCallback(() => {
    if (editingMenuPreset) {
      updateEditingMenuPreset();
      return;
    }

    if (openMenuPresetHasChanges && openMenuPreset) {
      saveOpenMenuPreset(openMenuPreset.id);
    }
  }, [
    editingMenuPreset,
    openMenuPreset,
    openMenuPresetHasChanges,
    saveOpenMenuPreset,
    updateEditingMenuPreset,
  ]);

  const applyQuickPresetNavPreset = useCallback((
    preset: MenuPreset | null,
    slotNumber: number,
    timestamp: number,
  ) => {
    if (!preset) {
      return;
    }

    const lastTap = lastQuickPresetNavTapRef.current;
    const elapsed = timestamp - lastTap.timestamp;
    const isDoubleTap =
      lastTap.presetId === preset.id &&
      elapsed >= 0 &&
      elapsed < QUICK_PRESET_NAV_DOUBLE_TAP_MS;

    lastQuickPresetNavTapRef.current = isDoubleTap
      ? { presetId: '', timestamp: 0 }
      : { presetId: preset.id, timestamp };
    triggerSubtleHaptic();
    flushFilterConfigUndoBatch();
    setFilterConfigModalVisible(false);
    setSettingsModalVisible(false);
    setNavTab(null);
    applyMenuPreset(preset, {
      closeMenu: listMenuOpenRef.current,
      haptic: false,
    });
    setOpenQuickPresetNavSlotNumber(slotNumber);

    if (isDoubleTap) {
      setToggleAllTodoSectionsRequest((current) => current + 1);
    }

    requestAnimationFrame(() => {
      searchInputRef.current?.blur();
      Keyboard.dismiss();
    });
  }, [
    applyMenuPreset,
    flushFilterConfigUndoBatch,
  ]);

  const handleQuickPresetNavPress = useCallback((
    preset: MenuPreset | null,
    slotNumber: number,
    event: GestureResponderEvent,
    phase: 'press' | 'pressIn',
  ) => {
    if (!preset) {
      return;
    }

    if (phase === 'pressIn') {
      quickPresetNavPressInRef.current = preset.id;
    } else if (quickPresetNavPressInRef.current === preset.id) {
      quickPresetNavPressInRef.current = null;
      return;
    }

    applyQuickPresetNavPreset(preset, slotNumber, event.nativeEvent.timestamp || Date.now());
  }, [
    applyQuickPresetNavPreset,
  ]);

  const removeMenuPreset = useCallback((id: string) => {
    const removed = menuPresets.find((preset) => preset.id === id);
    const shouldResetView = Boolean(
      removed &&
      !activeTodoMenuId &&
      menuPresetMatchesState(
        removed,
        selectedFilters,
        requiredFilters,
        avoidedFilters,
        effectiveSortMode,
        effectiveGroupMode,
        listOrderMode,
        metaTagVisibility,
      ),
    );

    recordUndo('Delete list');
    setMenuPresets((current) => current.filter((preset) => preset.id !== id));
    setQuickPresetNavPresetIds((current) => (
      current.length === 0
        ? current
        : current.map((presetId) => (presetId === id ? null : presetId))
    ));
    if (openMenuPresetId === id) {
      setOpenQuickPresetNavSlotNumber(null);
    }
    setOpenMenuPresetId((current) => (current === id ? null : current));

    if (shouldResetView) {
      clearAppliedMenuPreset({ skipUndo: true });
      return;
    }

    triggerSubtleHaptic();
  }, [
    activeTodoMenuId,
    clearAppliedMenuPreset,
    effectiveGroupMode,
    effectiveSortMode,
    listOrderMode,
    menuPresets,
    metaTagVisibility,
    openMenuPresetId,
    recordUndo,
    avoidedFilters,
    requiredFilters,
    selectedFilters,
  ]);

  const addSettingsList = useCallback(() => {
    const label = formatListLabel(newListName);

    if (!label) {
      return;
    }

    const duplicate = collectListNodeLabels(listMenuTree).some(
      (itemLabel) => itemLabel.toLocaleLowerCase() === label.toLocaleLowerCase(),
    );
    if (duplicate) {
      return;
    }

    recordUndo('Add list');
    setListMenuTree((current) => {
      const next = [{ label }, ...current];
      persistListMenuTree(next);
      return next;
    });
    setNewListName('');
    triggerSubtleHaptic();
  }, [listMenuTree, newListName, persistListMenuTree, recordUndo]);

  const setSettingsListIcon = useCallback((index: number, iconName: string | null) => {
    const currentItem = listMenuTreeRef.current[index];
    if (!currentItem || (currentItem.iconName ?? null) === iconName) {
      return;
    }

    recordUndo('Change list icon');
    setListMenuTree((current) => {
      const next = current.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        if (!iconName) {
          const { iconName: _removed, ...rest } = item;
          return rest;
        }

        return { ...item, iconName };
      });
      persistListMenuTree(next);
      return next;
    });
    triggerSubtleHaptic();
  }, [persistListMenuTree, recordUndo]);

  const toggleSettingsListNavbarPinned = useCallback((index: number) => {
    if (!listMenuTreeRef.current[index]) {
      return;
    }

    recordUndo('Change list navbar', { showToast: false });
    setListMenuTree((current) => {
      const next = current.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        return item.showInNavbar === false
          ? { ...item, showInNavbar: true }
          : { ...item, showInNavbar: false };
      });
      persistListMenuTree(next);
      return next;
    });
    triggerSubtleHaptic();
  }, [persistListMenuTree, recordUndo]);

  const swapSettingsListItems = useCallback((indexA: number, indexB: number) => {
    if (indexA === indexB) {
      return;
    }

    if (!listMenuTreeRef.current[indexA] || !listMenuTreeRef.current[indexB]) {
      return;
    }

    recordUndo('Reorder lists');
    setListOrderMode('manual');
    setListMenuTree((current) => {
      const itemA = current[indexA];
      const itemB = current[indexB];
      if (!itemA || !itemB) {
        return current;
      }

      const next = [...current];
      next[indexA] = itemB;
      next[indexB] = itemA;
      listMenuTreeRef.current = next;
      persistListMenuTree(next);
      return next;
    });
    void persistAppSettings({ listOrderMode: 'manual' });
  }, [persistAppSettings, persistListMenuTree, recordUndo]);

  const handleSettingsListSwap = useCallback((
    fromIndex: number,
    toIndex: number,
  ) => {
    swapSettingsListItems(fromIndex, toIndex);
  }, [swapSettingsListItems]);

  const removeSettingsList = useCallback((index: number) => {
    if (!listMenuTreeRef.current[index]) {
      return;
    }

    recordUndo('Delete list');
    setSettingsListReorderCancelNonce((current) => current + 1);
    setSettingsListIconPickerIndex((current) => (
      current === null || current === index ? null : current > index ? current - 1 : current
    ));
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
      setRequiredFilters((filters) => ({
        ...filters,
        list: filters.list.filter((label) => !removedLabels.has(label)),
      }));
      setAvoidedFilters((filters) => ({
        ...filters,
        list: filters.list.filter((label) => !removedLabels.has(label)),
      }));
      setLastCreateTodoFilters((filters) => ({
        ...filters,
        list: filters.list.filter((label) => !removedLabels.has(label)),
      }));
      setMenuPresets((currentPresets) => currentPresets.map((preset) => ({
        ...preset,
        filters: {
          ...preset.filters,
          list: preset.filters.list.filter((label) => !removedLabels.has(label)),
        },
        requiredFilters: {
          ...preset.requiredFilters,
          list: preset.requiredFilters.list.filter((label) => !removedLabels.has(label)),
        },
        avoidedFilters: {
          ...preset.avoidedFilters,
          list: preset.avoidedFilters.list.filter((label) => !removedLabels.has(label)),
        },
        sections: preset.sections?.map((section) => ({
          ...section,
          filters: {
            ...section.filters,
            list: section.filters.list.filter((label) => !removedLabels.has(label)),
          },
          requiredFilters: {
            ...section.requiredFilters,
            list: section.requiredFilters.list.filter((label) => !removedLabels.has(label)),
          },
          avoidedFilters: {
            ...section.avoidedFilters,
            list: section.avoidedFilters.list.filter((label) => !removedLabels.has(label)),
          },
        })),
      })));
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

      const next = current.filter((_, itemIndex) => itemIndex !== index);
      persistListMenuTree(next);
      return next;
    });
    triggerSubtleHaptic();
  }, [pendingDeleteIds, persistListMenuTree, recordUndo]);

  const openSettingsModal = useCallback(() => {
    Keyboard.dismiss();
    searchInputRef.current?.blur();
    closeListMenuState();
    flushFilterConfigUndoBatch();
    setFilterConfigModalVisible(false);
    exitTodoSelectMode();
    setSettingsBackupExpanded(false);
    setSettingsColorsExpanded(false);
    setSettingsDateLabelsExpanded(false);
    setSettingsDeletedExpanded(false);
    setSettingsDoneExpanded(false);
    setSettingsListsExpanded(false);
    setSettingsListReorderCancelNonce((current) => current + 1);
    setSettingsListIconPickerIndex(null);
    setSettingsModalVisible(true);
    triggerSubtleHaptic();
  }, [closeListMenuState, exitTodoSelectMode, flushFilterConfigUndoBatch]);

  const appHeaderTitle = useMemo(() => {
    if (todoSelectMode) {
      return selectedTodoCount === 1
        ? '1 selected'
        : `${selectedTodoCount} selected`;
    }

    const activePresetTitle =
      !hasTodoEditTargets
        ? openMenuPreset?.label ?? activeMenuPreset?.label ?? null
        : null;

    if (activePresetTitle) {
      return activePresetTitle;
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
  }, [
    activeListDisplay.listLabel,
    hasTodoEditTargets,
    menuMode,
    activeMenuPreset,
    openMenuPreset,
    selectedFilters,
    selectedTodoCount,
    todoSelectMode,
  ]);

  const focusHeaderSearchInput = useCallback(() => {
    searchInputRef.current?.blur();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    });
  }, []);

  const openHeaderSearch = useCallback((options?: { focusInput?: boolean }) => {
    clearNotificationTodoReveal();
    setNavTab('search');
    closeListMenuState();
    restoreSearchScroll();
    if (options?.focusInput !== false) {
      focusHeaderSearchInput();
    }
    triggerSubtleHaptic();
  }, [clearNotificationTodoReveal, closeListMenuState, focusHeaderSearchInput, restoreSearchScroll]);

  const showTodoItems = useCallback((options: { haptic?: boolean } = {}) => {
    Keyboard.dismiss();
    searchInputRef.current?.blur();
    closeListMenuState();
    exitTodoSelectMode();
    setSettingsModalVisible(false);
    flushFilterConfigUndoBatch();
    setFilterConfigModalVisible(false);
    setNavTab(null);
    clearNotificationTodoReveal();
    setQuery('');

    if (options.haptic ?? true) {
      triggerSubtleHaptic();
    }
  }, [
    clearNotificationTodoReveal,
    closeListMenuState,
    exitTodoSelectMode,
    flushFilterConfigUndoBatch,
  ]);

  const handleNavTabPress = useCallback((tab: NavTab) => {
    if (tab !== 'calendar') {
      lastFilterNavTapRef.current = 0;
    }
    if (tab !== 'search') {
      lastSearchNavTapRef.current = 0;
    }
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
      focusHeaderSearchInput();
      triggerSubtleHaptic();
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
          flushFilterConfigUndoBatch();
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
        openHeaderSearch();
        return;
      default:
        break;
    }

    triggerSubtleHaptic();
  }, [
    closeFilterConfigModal,
    closeListMenu,
    closeSettingsModal,
    exitTodoSelectMode,
    filterConfigModalVisible,
    flushFilterConfigUndoBatch,
    focusHeaderSearchInput,
    listMenuOpen,
    menuMode,
    navTab,
    openFilterConfigModal,
    openHeaderSearch,
    openSettingsModal,
    settingsModalVisible,
    todoSelectMode,
  ]);

  useEffect(() => {
    if (navTab !== 'search') {
      return undefined;
    }

    return () => {
      savedSearchScrollOffsetRef.current = actualScrollOffsetY.current;
    };
  }, [navTab]);

  const handleFilterNavPress = useCallback((event: GestureResponderEvent) => {
    const timestamp = event.nativeEvent.timestamp || Date.now();
    const sinceLastTap = timestamp - lastFilterNavTapRef.current;

    if (!todoSelectMode && sinceLastTap > 0 && sinceLastTap <= DOUBLE_TAP_DELAY) {
      lastFilterNavTapRef.current = 0;
      setActiveTodoMenuId(null);
      setNavTab('calendar');
      openFilterConfigModal();
      return;
    }

    lastFilterNavTapRef.current = timestamp;
    if (!todoSelectMode && selectedFilterCount > 0) {
      showTodoItems();
      return;
    }

    handleNavTabPress('calendar');
  }, [
    handleNavTabPress,
    openFilterConfigModal,
    selectedFilterCount,
    showTodoItems,
    todoSelectMode,
  ]);

  const handleSearchNavPress = useCallback((event: GestureResponderEvent) => {
    const timestamp = event.nativeEvent.timestamp || Date.now();
    const sinceLastTap = timestamp - lastSearchNavTapRef.current;

    if (!todoSelectMode && sinceLastTap > 0 && sinceLastTap <= DOUBLE_TAP_DELAY) {
      lastSearchNavTapRef.current = 0;
      handleSearchQueryChange('');
      triggerSubtleHaptic();
      return;
    }

    lastSearchNavTapRef.current = timestamp;
    handleNavTabPress('search');
  }, [handleNavTabPress, handleSearchQueryChange, todoSelectMode]);

  const handleSearchNavLongPress = useCallback(() => {
    lastSearchNavTapRef.current = 0;

    if (navTab !== 'search') {
      openHeaderSearch({ focusInput: false });
    }

    const hasSearchSections =
      searchPresetItems.length > 0 || searchListMenuItems.length > 0;

    if (hasSearchSections) {
      toggleAllSearchSections();
      return;
    }

    triggerSubtleHaptic();
  }, [
    navTab,
    openHeaderSearch,
    searchListMenuItems,
    searchPresetItems,
    toggleAllSearchSections,
  ]);

  useEffect(() => {
    if (!listMenuOpen && navTab === 'menu') {
      setNavTab(null);
    }
  }, [listMenuOpen, navTab]);

  const toggleGoogleDriveBackup = useCallback(() => {
    recordUndo('Change auto backup');
    setGoogleDriveBackupEnabled((current) => !current);
    triggerSubtleHaptic();
  }, [recordUndo]);

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
      triggerSubtleHaptic();
    } finally {
      setGoogleDriveBusy(false);
    }
  }, []);

  const refreshAndroidGoogleAccessToken = useCallback(async (storedAuth: StoredGoogleAuth) => {
    if (Platform.OS !== 'android') {
      return null;
    }

    let nativeGoogleSignIn: NativeGoogleSignIn;

    try {
      assertNativeGoogleSignInAvailable();
      nativeGoogleSignIn = await import('@react-native-google-signin/google-signin');
    } catch {
      return null;
    }

    const { GoogleSignin } = nativeGoogleSignIn;

    try {
      GoogleSignin.configure(getAndroidGoogleSignInConfig());

      setGoogleDriveBackupStatus('Refreshing Google Drive access...');

      const hasPlayServices = await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      if (!hasPlayServices || !GoogleSignin.hasPreviousSignIn()) {
        return null;
      }

      await GoogleSignin.clearCachedAccessToken(storedAuth.accessToken).catch(() => undefined);

      const silentResult = await GoogleSignin.signInSilently();
      if (silentResult.type !== 'success') {
        return null;
      }

      const tokens = await GoogleSignin.getTokens();
      if (!tokens.accessToken) {
        return null;
      }

      const nextAuth = googleNativeTokenToStoredAuth(tokens.accessToken, tokens.idToken);
      setGoogleAuth(nextAuth);
      await googleAuthStore.save(nextAuth);

      return nextAuth.accessToken;
    } catch {
      return null;
    }
  }, []);

  const getFreshGoogleAccessToken = useCallback(async (authOverride?: StoredGoogleAuth) => {
    const clientId = getGoogleClientIdForPlatform();
    if (!clientId) {
      throw new Error(
        `Google OAuth client ID is not configured for this ${DRIVE_BACKUP_VARIANT_LOWER_LABEL} build.`,
      );
    }

    const storedAuth = authOverride ?? googleAuth ?? await googleAuthStore.load();
    if (!storedAuth) {
      throw new Error(GOOGLE_SIGN_IN_REQUIRED_MESSAGE);
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
      const refreshedAndroidToken = await refreshAndroidGoogleAccessToken(storedAuth);
      if (refreshedAndroidToken) {
        return refreshedAndroidToken;
      }

      await googleAuthStore.clear();
      setGoogleAuth(null);
      throw new Error(GOOGLE_SESSION_EXPIRED_MESSAGE);
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
  }, [googleAuth, refreshAndroidGoogleAccessToken]);

  const handleGoogleDriveError = useCallback((
    error: unknown,
    fallbackMessage: string,
    notify = true,
  ) => {
    setGoogleDriveBackupStatus(error instanceof Error ? error.message : fallbackMessage);
    if (notify) {
      triggerSubtleHaptic();
    }
  }, []);

  const deleteGoogleDriveBackupSlot = useCallback((slot: DriveBackupSlot) => {
    const picker = googleDriveBackupPicker;
    const file = slot.file;

    if (!picker || !file) {
      return;
    }

    const slotTitle = formatDriveBackupSlotTitle(slot);
    const backupLabel = formatDriveBackupScopeLabel(picker.scope);

    Alert.alert(
      `Delete ${slotTitle}?`,
      `This removes only this ${backupLabel} from Google Drive.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setGoogleDriveBackupStatus(`Deleting ${slotTitle.toLocaleLowerCase()}...`);
            deleteDriveBackupFile(picker.accessToken, file, picker.scope)
              .then(() => listDriveBackupSlots(picker.accessToken, picker.scope))
              .then((slots) => {
                setGoogleDriveBackupPicker((current) => {
                  if (
                    !current ||
                    current.accessToken !== picker.accessToken ||
                    current.scope !== picker.scope
                  ) {
                    return current;
                  }

                  const nextSlots = current.mode === 'manage'
                    ? getFilledDriveBackupSlots(slots)
                    : slots;

                  return {
                    ...current,
                    slots: nextSlots,
                  };
                });
                setGoogleDriveBackupStatus(`${slotTitle} deleted`);
                triggerSubtleHaptic();
              })
              .catch((error) => {
                handleGoogleDriveError(error, 'Google Drive backup delete failed');
              });
          },
        },
      ],
    );
  }, [googleDriveBackupPicker, handleGoogleDriveError]);

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
      GoogleSignin.configure(getAndroidGoogleSignInConfig());
      setGoogleDriveBackupStatus('Checking Google Play services...');
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true }).catch((error) => {
        throw normalizeNativeGoogleSignInError(error, 'Checking Google Play services');
      });

      let shouldOpenAccountPicker = true;
      if (GoogleSignin.hasPreviousSignIn()) {
        setGoogleDriveBackupStatus('Using saved Google account...');
        const silentResult = await GoogleSignin.signInSilently().catch(() => null);
        shouldOpenAccountPicker = silentResult?.type !== 'success';
      }

      if (shouldOpenAccountPicker) {
        setGoogleDriveBackupStatus('Opening Google account picker...');
        const signInResult = await GoogleSignin.signIn().catch((error) => {
          throw normalizeNativeGoogleSignInError(error, 'Opening Google account picker');
        });
        if (signInResult.type === 'cancelled') {
          throw new Error('Google sign in cancelled');
        }
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

  const uploadBackupWithToken = useCallback(async (
    accessToken: string,
    options: {
      notify?: boolean;
      scope?: DriveBackupScope;
    } = {},
  ) => {
    const backupScope = options.scope ?? 'main';
    setGoogleDriveBackupStatus(
      `Creating ${formatDriveBackupScopeLabel(backupScope)} snapshot...`,
    );

    const backupTodos = todos.filter((todo) => !pendingDeleteIds.has(todo.id));
    const payload = createBackupPayload(backupTodos, {
      collapsedTodoGroupIds: [...collapsedTodoGroupIds],
      dateLabelDisplayMode,
      deletedTodos,
      filterConfigUiState,
      filterColors,
      googleDriveBackupEnabled,
      googleDriveLastBackupAt,
      googleDriveLastRestoreAt,
      hideDoneTodos,
      lastCreateTodoFilters,
      listMenuTree,
      listOrderMode,
      menuPresets,
      quickPresetDefaultsVersion: QUICK_PRESET_DEFAULTS_VERSION,
      quickPresetNavIconNames,
      quickPresetNavPresetIds,
      avoidedFilters,
      requiredFilters,
      selectedFilters,
      showOverdueMetaTags,
      todoGroupMode,
      todoSortMode,
      metaTagVisibility,
    });
    const uploadResult = await uploadDriveBackup(accessToken, payload, undefined, backupScope);
    if (backupScope === 'main') {
      setGoogleDriveLastBackupAt(payload.exportedAt);
    }
    setGoogleDriveBackupStatus(
      `${DRIVE_BACKUP_VARIANT_LABEL} backup ${uploadResult.file.name} created · ${
        backupTodos.length
      } items · ${formatBackupTime(payload.exportedAt)}`,
    );
    if (options.notify !== false) {
      triggerSubtleHaptic();
    }
  }, [
    collapsedTodoGroupIds,
    dateLabelDisplayMode,
    deletedTodos,
    filterConfigUiState,
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
    quickPresetNavIconNames,
    quickPresetNavPresetIds,
    avoidedFilters,
    requiredFilters,
    selectedFilters,
    showOverdueMetaTags,
    todoGroupMode,
    todoSortMode,
    todos,
  ]);

  const restoreBackupWithToken = useCallback(async (
    accessToken: string,
    scope: DriveBackupScope = 'main',
  ) => {
    setGoogleDriveBackupStatus(`Loading ${formatDriveBackupScopePluralLabel(scope)}...`);

    const backupSlots = await listDriveBackupSlots(accessToken, scope);

    setGoogleDriveBackupStatus(`Choose a ${formatDriveBackupScopeLabel(scope)} slot to restore`);
    const selection = await requestGoogleDriveBackupPickerSelection(
      accessToken,
      'restore',
      backupSlots,
      scope,
    );

    if (!selection || selection.type !== 'slot' || !selection.slot.file) {
      setGoogleDriveBackupStatus(`${DRIVE_BACKUP_VARIANT_LABEL} restore cancelled`);
      return;
    }

    setGoogleDriveBackupStatus(`Restoring from ${formatDriveBackupScopeLabel(scope)}...`);

    const backup = await downloadDriveBackup(accessToken, selection.slot.file, scope);

    if (!backup) {
      setGoogleDriveBackupStatus(`No ${formatDriveBackupScopeLabel(scope)} found`);
      return;
    }

    const restoredAt = new Date().toISOString();
    recordUndo('Restore backup');
    autoBackupStateKeyRef.current = null;
    autoBackupFailedStateKeyRef.current = null;
    setPendingDeleteIds(new Set());
    await localTodoStore.replaceAll(backup.payload.todos);
    setTodos(backup.payload.todos);
    reconcileTodoAlarms(backup.payload.todos).catch(() => undefined);
    clearNotificationTodoReveal();
    setDeletedTodos(backup.payload.settings.deletedTodos);
    const restoredSelectedFilters = normalizeTodoFilters(backup.payload.settings.selectedFilters);
    setSelectedFilters(restoredSelectedFilters);
    setRequiredFilters(pruneTodoFilters(
      backup.payload.settings.requiredFilters,
      restoredSelectedFilters,
    ));
    setAvoidedFilters(normalizeTodoFilters(backup.payload.settings.avoidedFilters));
    setFilterConfigUiState(cloneFilterConfigUiState(backup.payload.settings.filterConfigUiState));
    setFilterColors(backup.payload.settings.filterColors);
    setGoogleDriveBackupEnabled(backup.payload.settings.googleDriveBackupEnabled);
    setGoogleDriveLastBackupAt(backup.payload.settings.googleDriveLastBackupAt);
    setGoogleDriveLastRestoreAt(restoredAt);
    setHideDoneTodos(backup.payload.settings.hideDoneTodos);
    setShowOverdueMetaTags(backup.payload.settings.showOverdueMetaTags);
    setDateLabelDisplayMode(
      backup.payload.settings.dateLabelDisplayMode === 'remaining' ? 'remaining' : 'exact',
    );
    const restoredListMenuTree = cloneListMenuTree(
      backup.payload.settings.listMenuTree.length > 0
        ? backup.payload.settings.listMenuTree
        : DEFAULT_LIST_MENU_TREE,
    );
    const restoredLastCreateTodoFilters = getRememberedCreateDraftFilters(
      restoredListMenuTree,
      backup.payload.settings.lastCreateTodoFilters,
    );
    setListMenuTree(restoredListMenuTree);
    setListOrderMode(backup.payload.settings.listOrderMode);
    setMenuPresets(cloneMenuPresets(backup.payload.settings.menuPresets));
    setQuickPresetNavIconNames(
      cloneQuickPresetNavIconNames(backup.payload.settings.quickPresetNavIconNames),
    );
    setQuickPresetNavPresetIds(
      cloneQuickPresetNavPresetIds(backup.payload.settings.quickPresetNavPresetIds),
    );
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
      `Restored ${DRIVE_BACKUP_VARIANT_LOWER_LABEL} backup ${
        backup.payload.todos.length
      } items · ${formatBackupTime(restoredAt)}`,
    );
    triggerSubtleHaptic();
  }, [clearNotificationTodoReveal, recordUndo, requestGoogleDriveBackupPickerSelection]);

  const runGoogleDriveAction = useCallback(async (
    action: GoogleDriveAction,
    authOverride?: StoredGoogleAuth,
    scope: DriveBackupScope = 'main',
  ) => {
    const accessToken = await getFreshGoogleAccessToken(authOverride);

    if (action === 'backup') {
      await uploadBackupWithToken(accessToken, { scope });
      return;
    }

    if (action === 'manage') {
      setGoogleDriveBackupStatus(`Loading ${formatDriveBackupScopePluralLabel(scope)}...`);
      const backupSlots = getFilledDriveBackupSlots(
        await listDriveBackupSlots(accessToken, scope),
      );
      setGoogleDriveBackupStatus(
        backupSlots.length > 0
          ? `Showing ${formatDriveBackupScopePluralLabel(scope)}`
          : `No ${formatDriveBackupScopePluralLabel(scope)} found`,
      );
      await requestGoogleDriveBackupPickerSelection(
        accessToken,
        'manage',
        backupSlots,
        scope,
      );
      return;
    }

    await restoreBackupWithToken(accessToken, scope);
  }, [
    getFreshGoogleAccessToken,
    requestGoogleDriveBackupPickerSelection,
    restoreBackupWithToken,
    uploadBackupWithToken,
  ]);

  const authenticateAndRunGoogleDriveAction = useCallback(async (
    action: GoogleDriveAction,
    scope: DriveBackupScope = 'main',
  ) => {
    if (!googleOAuthConfigured) {
      setGoogleDriveBackupStatus(
        `Google sign-in is not configured for this ${DRIVE_BACKUP_VARIANT_LOWER_LABEL} build.`,
      );
      triggerSubtleHaptic();
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
        await runGoogleDriveAction(action, nextAuth, scope);
        return;
      }

      const result = await promptGoogleAuth();

      if (result.type === 'success' && result.authentication?.accessToken) {
        const nextAuth = googleAuthToStoredAuth(result.authentication);
        setGoogleAuth(nextAuth);
        await googleAuthStore.save(nextAuth);
        await runGoogleDriveAction(action, nextAuth, scope);
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

  const performGoogleDriveAction = useCallback(async (
    action: GoogleDriveAction,
    scope: DriveBackupScope = 'main',
  ) => {
    if (googleDriveBusy) {
      return;
    }

    if (!googleAuth?.accessToken) {
      await authenticateAndRunGoogleDriveAction(action, scope);
      return;
    }

    setGoogleDriveBusy(true);

    try {
      await runGoogleDriveAction(action, undefined, scope);
    } catch (error) {
      if (isGoogleAuthRecoveryError(error)) {
        await googleAuthStore.clear();
        setGoogleAuth(null);
        setGoogleDriveBusy(false);
        await authenticateAndRunGoogleDriveAction(action, scope);
        return;
      }

      handleGoogleDriveError(
        error,
        action === 'backup'
          ? 'Google Drive backup failed'
          : action === 'restore'
            ? 'Google Drive restore failed'
            : 'Google Drive backups failed',
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

  const showGoogleDriveBackups = useCallback(async () => {
    await performGoogleDriveAction('manage');
  }, [performGoogleDriveAction]);

  useEffect(() => {
    if (!loaded || !settingsLoaded || autoBackupStateKey === null) {
      return undefined;
    }

    if (autoBackupStateKeyRef.current === null) {
      autoBackupStateKeyRef.current = autoBackupStateKey;
      return undefined;
    }

    if (autoBackupStateKeyRef.current === autoBackupStateKey) {
      return undefined;
    }

    if (!googleDriveBackupEnabled) {
      autoBackupStateKeyRef.current = autoBackupStateKey;
      autoBackupFailedStateKeyRef.current = null;
      return undefined;
    }

    if (
      !googleAuth?.accessToken ||
      !googleDriveActionReady ||
      googleDriveBusy ||
      autoBackupInFlightRef.current ||
      autoBackupFailedStateKeyRef.current === autoBackupStateKey
    ) {
      return undefined;
    }

    const stateKey = autoBackupStateKey;
    const backupTimer = setTimeout(() => {
      if (googleDriveBusyRef.current || autoBackupInFlightRef.current) {
        return;
      }

      autoBackupInFlightRef.current = true;
      setGoogleDriveBusy(true);
      getFreshGoogleAccessToken()
        .then((accessToken) => uploadBackupWithToken(accessToken, { notify: false }))
        .then(() => {
          autoBackupStateKeyRef.current = stateKey;
          autoBackupFailedStateKeyRef.current = null;
        })
        .catch((error: unknown) => {
          autoBackupFailedStateKeyRef.current = stateKey;
          if (isGoogleAuthRecoveryError(error)) {
            googleAuthStore.clear().catch(() => undefined);
            setGoogleAuth(null);
            setGoogleDriveBackupStatus('Google session expired. Sign in to back up again.');
            return;
          }

          handleGoogleDriveError(error, 'Google Drive auto backup failed', false);
        })
        .finally(() => {
          autoBackupInFlightRef.current = false;
          setGoogleDriveBusy(false);
        });
    }, AUTO_BACKUP_DEBOUNCE_MS);

    return () => clearTimeout(backupTimer);
  }, [
    autoBackupStateKey,
    getFreshGoogleAccessToken,
    googleAuth?.accessToken,
    googleDriveActionReady,
    googleDriveBackupEnabled,
    googleDriveBusy,
    handleGoogleDriveError,
    loaded,
    settingsLoaded,
    uploadBackupWithToken,
  ]);

  const scrollTodoAboveMenu = useCallback((id: string) => {
    const list = todoListRef.current;

    if (!list) {
      return null;
    }

    const index = visibleTodoListRows.findIndex((row) => {
      if (row.type === 'todo') {
        return row.todo.id === id;
      }

      if (row.type === 'groupedTodoBatch') {
        return row.todos.some((todo) => todo.id === id);
      }

      return false;
    });

    if (index < 0) {
      return null;
    }

    const getTargetOffset = () => {
      const targetRow = visibleTodoListRows[index];

      if (targetRow.type === 'groupedTodoBatch') {
        const itemOffset = estimateTodoListOffsetForId(
          todoListRows,
          id,
          collapsedTodoGroupIds,
        );

        return itemOffset === null
          ? null
          : itemOffset + todoListRestingOffset - TODO_MENU_TARGET_TOP_OFFSET;
      }

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

      return itemOffset + todoListRestingOffset - TODO_MENU_TARGET_TOP_OFFSET;
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
    todoListRestingOffset,
    visibleTodoListRows,
  ]);

  useEffect(() => {
    if (!newlyCreatedTodoHighlightId) {
      return;
    }

    const highlightedId = newlyCreatedTodoHighlightId;
    const isVisible = visibleTodoListRows.some((row) => (
      (row.type === 'todo' && row.todo.id === highlightedId) ||
      (
        row.type === 'groupedTodoBatch' &&
        row.todos.some((todo) => todo.id === highlightedId)
      )
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

    return requestTodoMenuTargetScroll(activeTodoMenuId, { revealHighlight: true });
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

    triggerSubtleHaptic();
  }, [pendingDeleteIds]);

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
  const currentCreateSectionFilters = useMemo(
    () => mergeCreateSectionFilters(requiredFilters, selectedFilters),
    [requiredFilters, selectedFilters],
  );

  const renderTodoSectionAddButton = useCallback((
    accessibilityLabel: string,
    sectionFilters: TodoFilters,
  ) => {
    if (todoSelectMode) {
      return null;
    }

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Opens the new todo drawer for this section"
        accessibilityLabel={accessibilityLabel}
        hitSlop={6}
        onPress={() => openCreateDrawerWithFilters(sectionFilters, searchQuery)}
        style={({ pressed }) => [
          styles.todoSectionAddButton,
          pressed && styles.todoSectionAddButtonPressed,
        ]}
      >
        <Ionicons color={NAV_ACCENT} name="add-circle-outline" size={20} />
      </Pressable>
    );
  }, [openCreateDrawerWithFilters, searchQuery, todoSelectMode]);

  const renderTodoItem = useCallback(
    ({ item }: { item: AppTodoListRow }) => {
      if (item.type === 'searchListHeader') {
        const isExpanded = !item.isCollapsed;
        const hasExpandedTodos = isExpanded && item.count > 0;
        const listIconName = item.node.iconName;
        const headerLayoutKey = `${item.id}:${item.isCollapsed ? 'collapsed' : 'expanded'}`;

        return (
          <View key={headerLayoutKey} collapsable={false}>
            {renderVisibleTodoRowGap(item.gapBefore)}
            <View
              collapsable={false}
              style={[
                styles.todoSectionCardShadow,
                hasExpandedTodos && styles.todoSectionCardShadowExpanded,
              ]}
            >
              <View
                style={[
                  styles.todoSectionCard,
                  hasExpandedTodos && styles.todoSectionCardExpanded,
                  styles.todoSectionHeader,
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint="Tap to expand or collapse. Press and hold to edit hidden search keywords."
                  accessibilityLabel={`List ${item.node.label}, ${item.count} items`}
                  accessibilityState={{ expanded: isExpanded }}
                  collapsable={false}
                  onLongPress={() => openSettingsListKeywordPrompt(item.listIndex)}
                  onPress={() => toggleSearchListCollapsed(item.node.label)}
                  style={({ pressed }) => [
                    styles.todoSectionHeaderPressable,
                    pressed && styles.todoGroupHeaderPressed,
                  ]}
                >
                  <View collapsable={false} style={styles.todoSectionHeaderMain}>
                    {listIconName ? (
                      <MaterialCommunityIcons
                        color={THEME_ACCENT}
                        name={toMaterialCommunityIconName(listIconName)}
                        size={17}
                        style={styles.searchListSectionTitleIcon}
                      />
                    ) : null}
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.todoSectionTitle,
                        item.matchesQuery && styles.searchPresetSectionTitleMatched,
                      ]}
                    >
                      {item.node.label}
                    </Text>
                  </View>
                </Pressable>
                <View style={styles.todoSectionHeaderMeta}>
                  {renderTodoSectionAddButton(
                    `Add todo to ${item.node.label}`,
                    { ...cloneTodoFilters(), list: [item.node.label] },
                  )}
                  <Text style={styles.todoGroupCount}>{item.count}</Text>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    color={THEME_TEXT_SECONDARY}
                    size={18}
                  />
                </View>
              </View>
              {isExpanded && item.count === 0 ? (
                <View
                  style={[
                    styles.todoSectionGroupedShell,
                    styles.todoSectionGroupedShellLast,
                    styles.searchPresetSectionEmpty,
                  ]}
                >
                  <Text style={styles.searchPresetSectionEmptyText}>
                    No matching items
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        );
      }

      if (item.type === 'searchListTodo') {
        const todo = item.todo;
        const isPendingDelete = pendingDeleteIds.has(todo.id);
        const isTodoMenuTarget =
          !isPendingDelete &&
          activeTodoMenuId === todo.id;
        const isTodoMenuTargetHighlighted =
          isTodoMenuTarget &&
          activeTodoMenuHighlightId === todo.id;
        const isSelected = selectedTodoIds.has(todo.id);
        const isNewlyCreatedTodo =
          newlyCreatedTodoHighlightId === todo.id;
        const isRecentlyEditedTodo = recentlyEditedTodoIds.has(todo.id);
        const isRepeatingCompletionFeedbackTodo =
          repeatingTodoCompletionFeedbackIds.has(todo.id);
        const shouldHighlightGroupedRow =
          (
            (isRecentlyEditedTodo ||
              isNewlyCreatedTodo ||
              isRepeatingCompletionFeedbackTodo) &&
            !isTodoMenuTarget
          ) ||
          (todoSelectMode && isSelected);

        return (
          <View style={styles.todoListItem}>
            {renderVisibleTodoRowGap(item.gapBefore)}
            <View
              style={[
                styles.todoSectionGroupedShell,
                shouldHighlightGroupedRow && styles.todoSectionGroupedShellHighlighted,
                item.isLastInList && styles.todoSectionGroupedShellLast,
              ]}
            >
              {!item.isFirstInList ? (
                <View
                  style={[
                    styles.todoRowDivider,
                    shouldHighlightGroupedRow && styles.todoRowDividerHighlighted,
                  ]}
                />
              ) : null}
              <TodoRow
                dateStatusKey={dateStatusKey}
                dateLabelDisplayMode={dateLabelDisplayMode}
                filterColors={deferredFilterColors}
                isSelected={isSelected}
                item={todo}
                isMenuTarget={isTodoMenuTarget}
                isMenuTargetHighlighted={isTodoMenuTargetHighlighted}
                isNewlyCreated={isNewlyCreatedTodo}
                isRecentlyEdited={isRecentlyEditedTodo}
                isCompletionFeedback={isRepeatingCompletionFeedbackTodo}
                isPendingDelete={isPendingDelete}
                layout="grouped"
                metaTagVisibility={metaTagVisibility}
                onDelete={deleteTodo}
                onCreateFromSettings={openCreateDrawerFromTodoSettings}
                onCreateFromSettingsHoldEnd={hideCreateFromSettingsCue}
                onCreateFromSettingsHoldStart={showCreateFromSettingsCue}
                onEnterSelectMode={enterTodoSelectMode}
                onOpenDetail={openTodoDetailModal}
                onOpenMenu={openMenuForTodoAction}
                onSetDone={setTodoDone}
                onTouchStart={markTodoRowTouchStart(todo.id)}
                onToggleSelect={toggleTodoSelection}
                searchHighlightQuery={itemSearchHighlightQuery}
                selectMode={todoSelectMode}
                showOverdueMetaTags={showOverdueMetaTags}
                viewportWidth={windowWidth}
              />
            </View>
          </View>
        );
      }

      if (item.type === 'searchItemTodo') {
        const todo = item.todo;
        const isPendingDelete = pendingDeleteIds.has(todo.id);
        const isTodoMenuTarget =
          !isPendingDelete &&
          activeTodoMenuId === todo.id;
        const isTodoMenuTargetHighlighted =
          isTodoMenuTarget &&
          activeTodoMenuHighlightId === todo.id;
        const isSelected = selectedTodoIds.has(todo.id);
        const isNewlyCreatedTodo =
          newlyCreatedTodoHighlightId === todo.id;
        const isRecentlyEditedTodo = recentlyEditedTodoIds.has(todo.id);
        const isRepeatingCompletionFeedbackTodo =
          repeatingTodoCompletionFeedbackIds.has(todo.id);
        const shouldHighlightGroupedRow =
          (
            (isRecentlyEditedTodo ||
              isNewlyCreatedTodo ||
              isRepeatingCompletionFeedbackTodo) &&
            !isTodoMenuTarget
          ) ||
          (todoSelectMode && isSelected);

        return (
          <View style={styles.todoListItem}>
            {renderVisibleTodoRowGap(item.gapBefore)}
            <View
              style={[
                styles.todoSectionGroupedShell,
                shouldHighlightGroupedRow && styles.todoSectionGroupedShellHighlighted,
                item.isLast && styles.todoSectionGroupedShellLast,
              ]}
            >
              {!item.isFirst ? (
                <View
                  style={[
                    styles.todoRowDivider,
                    shouldHighlightGroupedRow && styles.todoRowDividerHighlighted,
                  ]}
                />
              ) : null}
              <TodoRow
                dateStatusKey={dateStatusKey}
                dateLabelDisplayMode={dateLabelDisplayMode}
                filterColors={deferredFilterColors}
                isSelected={isSelected}
                item={todo}
                isMenuTarget={isTodoMenuTarget}
                isMenuTargetHighlighted={isTodoMenuTargetHighlighted}
                isNewlyCreated={isNewlyCreatedTodo}
                isRecentlyEdited={isRecentlyEditedTodo}
                isCompletionFeedback={isRepeatingCompletionFeedbackTodo}
                isPendingDelete={isPendingDelete}
                layout="grouped"
                metaTagVisibility={metaTagVisibility}
                onDelete={deleteTodo}
                onCreateFromSettings={openCreateDrawerFromTodoSettings}
                onCreateFromSettingsHoldEnd={hideCreateFromSettingsCue}
                onCreateFromSettingsHoldStart={showCreateFromSettingsCue}
                onEnterSelectMode={enterTodoSelectMode}
                onOpenDetail={openTodoDetailModal}
                onOpenMenu={openMenuForTodoAction}
                onSetDone={setTodoDone}
                onTouchStart={markTodoRowTouchStart(todo.id)}
                onToggleSelect={toggleTodoSelection}
                searchHighlightContent={false}
                searchHighlightQuery={itemSearchHighlightQuery}
                selectMode={todoSelectMode}
                showOverdueMetaTags={showOverdueMetaTags}
                viewportWidth={windowWidth}
              />
            </View>
          </View>
        );
      }

      if (item.type === 'searchPresetHeader') {
        const isExpanded = !item.isCollapsed;
        const hasExpandedTodos = isExpanded && item.count > 0;
        const headerLayoutKey = `${item.id}:${item.isCollapsed ? 'collapsed' : 'expanded'}`;

        return (
          <View key={headerLayoutKey} collapsable={false}>
            {renderVisibleTodoRowGap(item.gapBefore)}
            <View
              collapsable={false}
              style={[
                styles.todoSectionCardShadow,
                hasExpandedTodos && styles.todoSectionCardShadowExpanded,
              ]}
            >
              <View
                style={[
                  styles.todoSectionCard,
                  hasExpandedTodos && styles.todoSectionCardExpanded,
                  styles.todoSectionHeader,
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint="Tap to expand or collapse. Press and hold to edit hidden search keywords."
                  accessibilityLabel={`List ${item.preset.label}, ${item.count} items`}
                  accessibilityState={{ expanded: isExpanded }}
                  collapsable={false}
                  onLongPress={() => openPresetSearchKeywordPrompt(item.preset)}
                  onPress={() => toggleSearchPresetCollapsed(item.preset.id)}
                  style={({ pressed }) => [
                    styles.todoSectionHeaderPressable,
                    pressed && styles.todoGroupHeaderPressed,
                  ]}
                >
                  <View collapsable={false} style={styles.todoSectionHeaderMain}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.todoSectionTitle,
                        item.matchesQuery && styles.searchPresetSectionTitleMatched,
                      ]}
                    >
                      {item.preset.label}
                    </Text>
                  </View>
                </Pressable>
                <View style={styles.todoSectionHeaderMeta}>
                  {renderTodoSectionAddButton(
                    `Add todo to ${item.preset.label}`,
                    mergeCreateSectionFilters(item.preset.requiredFilters, item.preset.filters),
                  )}
                  <Text style={styles.todoGroupCount}>{item.count}</Text>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    color={THEME_TEXT_SECONDARY}
                    size={18}
                  />
                </View>
              </View>
              {isExpanded && item.count === 0 ? (
                <View
                  style={[
                    styles.todoSectionGroupedShell,
                    styles.todoSectionGroupedShellLast,
                    styles.searchPresetSectionEmpty,
                  ]}
                >
                  <Text style={styles.searchPresetSectionEmptyText}>
                    No matching items
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        );
      }

      if (item.type === 'searchPresetTodo') {
        const todo = item.todo;
        const isPendingDelete = pendingDeleteIds.has(todo.id);
        const isTodoMenuTarget =
          !isPendingDelete &&
          activeTodoMenuId === todo.id;
        const isTodoMenuTargetHighlighted =
          isTodoMenuTarget &&
          activeTodoMenuHighlightId === todo.id;
        const isSelected = selectedTodoIds.has(todo.id);
        const isNewlyCreatedTodo =
          newlyCreatedTodoHighlightId === todo.id;
        const isRecentlyEditedTodo = recentlyEditedTodoIds.has(todo.id);
        const isRepeatingCompletionFeedbackTodo =
          repeatingTodoCompletionFeedbackIds.has(todo.id);
        const shouldHighlightGroupedRow =
          (
            (isRecentlyEditedTodo ||
              isNewlyCreatedTodo ||
              isRepeatingCompletionFeedbackTodo) &&
            !isTodoMenuTarget
          ) ||
          (todoSelectMode && isSelected);

        return (
          <View style={styles.todoListItem}>
            {renderVisibleTodoRowGap(item.gapBefore)}
            <View
              style={[
                styles.todoSectionGroupedShell,
                shouldHighlightGroupedRow && styles.todoSectionGroupedShellHighlighted,
                item.isLastInPreset && styles.todoSectionGroupedShellLast,
              ]}
            >
              {!item.isFirstInPreset ? (
                <View
                  style={[
                    styles.todoRowDivider,
                    shouldHighlightGroupedRow && styles.todoRowDividerHighlighted,
                  ]}
                />
              ) : null}
              <TodoRow
                dateStatusKey={dateStatusKey}
                dateLabelDisplayMode={dateLabelDisplayMode}
                filterColors={deferredFilterColors}
                isSelected={isSelected}
                item={todo}
                isMenuTarget={isTodoMenuTarget}
                isMenuTargetHighlighted={isTodoMenuTargetHighlighted}
                isNewlyCreated={isNewlyCreatedTodo}
                isRecentlyEdited={isRecentlyEditedTodo}
                isCompletionFeedback={isRepeatingCompletionFeedbackTodo}
                isPendingDelete={isPendingDelete}
                layout="grouped"
                metaTagVisibility={metaTagVisibility}
                onDelete={deleteTodo}
                onCreateFromSettings={openCreateDrawerFromTodoSettings}
                onCreateFromSettingsHoldEnd={hideCreateFromSettingsCue}
                onCreateFromSettingsHoldStart={showCreateFromSettingsCue}
                onEnterSelectMode={enterTodoSelectMode}
                onOpenDetail={openTodoDetailModal}
                onOpenMenu={openMenuForTodoAction}
                onSetDone={setTodoDone}
                onTouchStart={markTodoRowTouchStart(todo.id)}
                onToggleSelect={toggleTodoSelection}
                searchHighlightQuery={itemSearchHighlightQuery}
                selectMode={todoSelectMode}
                showOverdueMetaTags={showOverdueMetaTags}
                viewportWidth={windowWidth}
              />
            </View>
          </View>
        );
      }

      if (item.type === 'sectionHeader') {
        const isExpanded = !item.isCollapsed;
        const hasExpandedTodos = isExpanded && item.count > 0;
        const canCreateFromSection = canCreateFromSectionHeader(item.id, item.label);
        const shouldHideSectionAddButton =
          !canCreateFromSection ||
          (hidePresetTodoSectionAddButton && !item.id.startsWith('group-list-'));

        return (
          <View>
            {renderVisibleTodoRowGap(item.gapBefore)}
            <View
              collapsable={false}
              style={[
                styles.todoSectionCardShadow,
                hasExpandedTodos && styles.todoSectionCardShadowExpanded,
              ]}
            >
              <View
                style={[
                  styles.todoSectionCard,
                  hasExpandedTodos && styles.todoSectionCardExpanded,
                  styles.todoSectionHeader,
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isExpanded }}
                  accessibilityLabel={`${item.label}, ${item.count} items`}
                  collapsable={false}
                  onPress={() => toggleTodoGroupCollapsed(item.id)}
                  style={({ pressed }) => [
                    styles.todoSectionHeaderPressable,
                    pressed && styles.todoGroupHeaderPressed,
                  ]}
                >
                  <View style={styles.todoSectionHeaderMain}>
                    <Text numberOfLines={1} style={styles.todoSectionTitle}>
                      {item.label}
                    </Text>
                  </View>
                </Pressable>
                <View style={styles.todoSectionHeaderMeta}>
                  {shouldHideSectionAddButton
                    ? null
                    : renderTodoSectionAddButton(
                      `Add todo to ${item.label}`,
                      getCreateFiltersForSectionHeader(
                        item.id,
                        item.label,
                        currentCreateSectionFilters,
                      ),
                    )}
                  <Text style={styles.todoGroupCount}>{item.count}</Text>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    color={THEME_TEXT_SECONDARY}
                    size={18}
                  />
                </View>
              </View>
              {isExpanded && item.count === 0 ? (
                <View
                  style={[
                    styles.todoSectionGroupedShell,
                    styles.todoSectionGroupedShellLast,
                    styles.searchPresetSectionEmpty,
                  ]}
                >
                  <Text style={styles.searchPresetSectionEmptyText}>
                    No items
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        );
      }

      if (item.type === 'groupedTodoBatch') {
        return (
          <View style={styles.todoListItem}>
            {renderVisibleTodoRowGap(item.gapBefore)}
            {item.todos.map((todo, batchIndex) => {
              const sectionIndex = item.sectionStartIndex + batchIndex;
              const isFirstInSection = sectionIndex === 0;
              const isLastInSection = sectionIndex === item.sectionTodoCount - 1;
              const isPendingDelete = pendingDeleteIds.has(todo.id);
              const isTodoMenuTarget =
                !isPendingDelete &&
                activeTodoMenuId === todo.id;
              const isTodoMenuTargetHighlighted =
                isTodoMenuTarget &&
                activeTodoMenuHighlightId === todo.id;
              const isSelected = selectedTodoIds.has(todo.id);
              const isNewlyCreatedTodo =
                newlyCreatedTodoHighlightId === todo.id;
              const isRecentlyEditedTodo = recentlyEditedTodoIds.has(todo.id);
              const isRepeatingCompletionFeedbackTodo =
                repeatingTodoCompletionFeedbackIds.has(todo.id);
              const shouldHighlightGroupedRow =
                (
                  (isRecentlyEditedTodo ||
                    isNewlyCreatedTodo ||
                    isRepeatingCompletionFeedbackTodo) &&
                  !isTodoMenuTarget
                ) ||
                (todoSelectMode && isSelected);

              return (
                <View
                  key={todo.id}
                  style={[
                    styles.todoSectionGroupedShell,
                    shouldHighlightGroupedRow && styles.todoSectionGroupedShellHighlighted,
                    isLastInSection && styles.todoSectionGroupedShellLast,
                  ]}
                >
                  {!isFirstInSection ? (
                    <View
                      style={[
                        styles.todoRowDivider,
                        shouldHighlightGroupedRow && styles.todoRowDividerHighlighted,
                      ]}
                    />
                  ) : null}
                  <TodoRow
                    dateStatusKey={dateStatusKey}
                    dateLabelDisplayMode={dateLabelDisplayMode}
                    filterColors={deferredFilterColors}
                    hiddenMetaTagKinds={groupedHiddenMetaTagKinds}
                    isSelected={isSelected}
                    item={todo}
                    isMenuTarget={isTodoMenuTarget}
                    isMenuTargetHighlighted={isTodoMenuTargetHighlighted}
                    isNewlyCreated={isNewlyCreatedTodo}
                    isRecentlyEdited={isRecentlyEditedTodo}
                    isCompletionFeedback={isRepeatingCompletionFeedbackTodo}
                    isPendingDelete={isPendingDelete}
                    layout="grouped"
                    metaTagVisibility={metaTagVisibility}
                    onDelete={deleteTodo}
                    onCreateFromSettings={openCreateDrawerFromTodoSettings}
                    onCreateFromSettingsHoldEnd={hideCreateFromSettingsCue}
                    onCreateFromSettingsHoldStart={showCreateFromSettingsCue}
                    onEnterSelectMode={enterTodoSelectMode}
                    onOpenDetail={openTodoDetailModal}
                    onOpenMenu={openMenuForTodoAction}
                    onSetDone={setTodoDone}
                    onTouchStart={markTodoRowTouchStart(todo.id)}
                    onToggleSelect={toggleTodoSelection}
                    searchHighlightQuery={itemSearchHighlightQuery}
                    selectMode={todoSelectMode}
                    sectionLabel={item.sectionLabel}
                    showOverdueMetaTags={showOverdueMetaTags}
                    viewportWidth={windowWidth}
                  />
                </View>
              );
            })}
          </View>
        );
      }

      if (item.type !== 'todo') {
        return null;
      }

      const isPendingDelete = pendingDeleteIds.has(item.todo.id);
      const isTodoMenuTarget =
        !isPendingDelete &&
        activeTodoMenuId === item.todo.id;
      const isTodoMenuTargetHighlighted =
        isTodoMenuTarget &&
        activeTodoMenuHighlightId === item.todo.id;
      const isSelected = selectedTodoIds.has(item.todo.id);
      const isNewlyCreatedTodo =
        newlyCreatedTodoHighlightId === item.todo.id;
      const isRecentlyEditedTodo = recentlyEditedTodoIds.has(item.todo.id);
      const isRepeatingCompletionFeedbackTodo =
        repeatingTodoCompletionFeedbackIds.has(item.todo.id);

      return (
        <View style={styles.todoListItem}>
          {renderVisibleTodoRowGap(item.gapBefore)}
          <TodoRow
            dateStatusKey={dateStatusKey}
            dateLabelDisplayMode={dateLabelDisplayMode}
            filterColors={deferredFilterColors}
            isSelected={isSelected}
            item={item.todo}
            isMenuTarget={isTodoMenuTarget}
            isMenuTargetHighlighted={isTodoMenuTargetHighlighted}
            isNewlyCreated={isNewlyCreatedTodo}
            isRecentlyEdited={isRecentlyEditedTodo}
            isCompletionFeedback={isRepeatingCompletionFeedbackTodo}
            isPendingDelete={isPendingDelete}
            metaTagVisibility={metaTagVisibility}
            onDelete={deleteTodo}
            onCreateFromSettings={openCreateDrawerFromTodoSettings}
            onCreateFromSettingsHoldEnd={hideCreateFromSettingsCue}
            onCreateFromSettingsHoldStart={showCreateFromSettingsCue}
            onEnterSelectMode={enterTodoSelectMode}
            onOpenDetail={openTodoDetailModal}
            onOpenMenu={openMenuForTodoAction}
            onSetDone={setTodoDone}
            onTouchStart={markTodoRowTouchStart(item.todo.id)}
            onToggleSelect={toggleTodoSelection}
            searchHighlightQuery={itemSearchHighlightQuery}
            selectMode={todoSelectMode}
            showOverdueMetaTags={showOverdueMetaTags}
            viewportWidth={windowWidth}
          />
        </View>
      );
    },
    [
      activeTodoMenuId,
      activeTodoMenuHighlightId,
      currentCreateSectionFilters,
      dateStatusKey,
      dateLabelDisplayMode,
      deleteTodo,
      deferredFilterColors,
      enterTodoSelectMode,
      groupedHiddenMetaTagKinds,
      hideCreateFromSettingsCue,
      hidePresetTodoSectionAddButton,
      metaTagVisibility,
      markTodoRowTouchStart,
      newlyCreatedTodoHighlightId,
      openPresetSearchKeywordPrompt,
      openSettingsListKeywordPrompt,
      toggleSearchListCollapsed,
      toggleSearchPresetCollapsed,
      openCreateDrawerFromTodoSettings,
      openCreateDrawerWithFilters,
      openTodoDetailModal,
      renderTodoSectionAddButton,
      openMenuForTodoAction,
      pendingDeleteIds,
      recentlyEditedTodoIds,
      repeatingTodoCompletionFeedbackIds,
      renderVisibleTodoRowGap,
      selectedFilters,
      selectedTodoIds,
      setTodoDone,
      itemSearchHighlightQuery,
      showOverdueMetaTags,
      showCreateFromSettingsCue,
      toggleTodoGroupCollapsed,
      toggleTodoSelection,
      todoSelectMode,
      windowWidth,
    ],
  );

  const googleDriveNavDisabled = googleDriveBusy || !googleDriveActionReady;
  const googleDriveNavIconColor = googleDriveBusy
    ? NAV_ACCENT
    : googleDriveNavDisabled
      ? THEME_TEXT_TERTIARY
      : NAV_ICON_INACTIVE;

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
                triggerSubtleHaptic();
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
            <>
              {createFromSettingsCueVisible ? (
                <View pointerEvents="none" style={styles.appHeaderCreateFromSettingsCue}>
                  <Ionicons color={THEME_CARD} name="add" size={19} />
                </View>
              ) : null}
              <View style={styles.appHeaderActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${historyButtonText} ${historyButtonCount} change${historyButtonCount === 1 ? '' : 's'}`}
                  accessibilityState={{ disabled: historyButtonDisabled }}
                  disabled={historyButtonDisabled}
                  onPress={historyButtonMode === 'redo' ? redoLastChange : undoLastChange}
                  style={({ pressed }) => [
                    styles.appHeaderActionButton,
                    historyButtonCount > 0 && styles.appHeaderUndoButtonAvailable,
                    historyButtonDisabled && styles.appHeaderUndoButtonDisabled,
                    pressed && styles.appHeaderSideButtonPressed,
                  ]}
                >
                  <Ionicons
                    color={historyButtonCount > 0 ? NAV_ACCENT : THEME_TEXT_TERTIARY}
                    name={historyButtonIcon}
                    size={22}
                  />
                  {historyButtonCount > 0 ? (
                    <Text style={styles.appHeaderUndoCountBadge}>{historyButtonCount}</Text>
                  ) : null}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint="Opens settings"
                  accessibilityLabel="Settings"
                  accessibilityState={{ selected: navTab === 'settings' }}
                  onPress={() => handleNavTabPress('settings')}
                  style={({ pressed }) => [
                    styles.appHeaderActionButton,
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
              </View>
            </>
          )}
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
                  !showSearchPresetSections &&
                    filteredTodos.length === 0 &&
                    styles.emptyListContent,
                ]}
                data={appTodoListData}
                drawDistance={TODO_GROUPED_ROW_ESTIMATE}
                extraData={todoListExtraData}
                getItemType={getAppTodoListItemType}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                keyExtractor={getAppTodoListItemKey}
                maintainVisibleContentPosition={TODO_LIST_MAINTAIN_VISIBLE_CONTENT_POSITION}
                ListEmptyComponent={
                  showSearchPresetSections &&
                    searchPresetItems.length === 0 &&
                    searchListMenuItems.length === 0 ? (
                    <View style={styles.searchFiltersEmpty}>
                      <Text style={styles.searchFiltersEmptyTitle}>No saved lists</Text>
                      <Text style={styles.searchFiltersEmptyText}>
                        Save lists from the filter menu to search them here.
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyIcon}>
                        {query.trim() ? '⌕' : '✎'}
                      </Text>
                      <Text style={styles.emptyTitle}>
                        {query.trim()
                          ? 'No matching items'
                          : navTab === 'search' && searchMode === 'item'
                            ? 'Search items'
                            : hideDoneTodos
                              ? 'No active items'
                              : 'No items yet'}
                      </Text>
                      <Text style={styles.emptyText}>
                        {query.trim()
                          ? 'Try a different search term.'
                          : navTab === 'search' && searchMode === 'item'
                            ? 'Type to search items.'
                            : hideDoneTodos
                              ? 'Done items are hidden.'
                              : todoListGroupMode !== 'none' || showSearchPresetSections
                                ? 'Tap + on a section to add a todo.'
                                : 'Tap + in the bar below to add a todo.'}
                      </Text>
                    </View>
                  )
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
                  <View>
                    {todoListOneHandedOffset > 0 ? (
                      <View
                        pointerEvents="none"
                        style={{ height: todoListOneHandedOffset }}
                      />
                    ) : null}
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
                          onChangeText={handleSearchQueryChange}
                          onFocus={() => {
                            if (suppressHeaderSearchFocusRef.current) {
                              suppressHeaderSearchFocusRef.current = false;

                              if (suppressHeaderSearchFocusTimerRef.current) {
                                clearTimeout(suppressHeaderSearchFocusTimerRef.current);
                                suppressHeaderSearchFocusTimerRef.current = null;
                              }

                              requestAnimationFrame(() => {
                                searchInputRef.current?.blur();
                                Keyboard.dismiss();
                              });
                              return;
                            }

                            const enteringSearch = navTab !== 'search';
                            clearNotificationTodoReveal();
                            setNavTab('search');
                            if (enteringSearch) {
                              restoreSearchScroll();
                            }
                          }}
                          placeholder={
                            navTab === 'search' && searchMode === 'item'
                              ? 'Search items…'
                              : 'Search keywords…'
                          }
                          placeholderTextColor={THEME_TEXT_SECONDARY}
                          returnKeyType="search"
                          selectionColor={NAV_ACCENT}
                          style={styles.searchInput}
                          textAlignVertical="center"
                          value={query}
                        />
                        {navTab === 'search' ? (
                          <View style={styles.searchModeToggle}>
                            <Pressable
                              accessibilityLabel="List search"
                              accessibilityRole="button"
                              accessibilityState={{ selected: searchMode === 'preset' }}
                              onPress={() => handleSearchModeChange('preset')}
                              style={({ pressed }) => [
                                styles.searchModeToggleButton,
                                searchMode === 'preset' && styles.searchModeToggleButtonActive,
                                pressed && styles.searchModeToggleButtonPressed,
                              ]}
                            >
                              <Ionicons
                                color={
                                  searchMode === 'preset'
                                    ? NAV_ACCENT
                                    : THEME_TEXT_SECONDARY
                                }
                                name="layers-outline"
                                size={15}
                              />
                            </Pressable>
                            <Pressable
                              accessibilityLabel="Item search"
                              accessibilityRole="button"
                              accessibilityState={{ selected: searchMode === 'item' }}
                              onPress={() => handleSearchModeChange('item')}
                              style={({ pressed }) => [
                                styles.searchModeToggleButton,
                                searchMode === 'item' && styles.searchModeToggleButtonActive,
                                pressed && styles.searchModeToggleButtonPressed,
                              ]}
                            >
                              <Ionicons
                                color={
                                  searchMode === 'item'
                                    ? NAV_ACCENT
                                    : THEME_TEXT_SECONDARY
                                }
                                name="document-text-outline"
                                size={15}
                              />
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                }
                ListHeaderComponentStyle={styles.todoListHeaderChrome}
                onScroll={handleListScroll}
                renderItem={renderTodoItem}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
              />
            </View>
          </View>

        </View>

        {undoToastEntry ? (
          <View style={styles.todoUndoToastLayer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss undo"
              onPress={clearUndoToast}
              style={StyleSheet.absoluteFill}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Undo ${undoToastEntry.label}`}
              onPress={undoLastChange}
              style={({ pressed }) => [
                styles.todoUndoButton,
                pressed && styles.todoUndoButtonPressed,
              ]}
            >
              <Ionicons color="#FFFFFF" name="arrow-undo" size={18} />
              <Text style={styles.todoUndoButtonText}>Undo</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[
          styles.bottomNav,
          (settingsModalVisible || filterConfigModalVisible) && styles.bottomNavFlat,
        ]}>
          <QuickPresetNav
            accentColor={NAV_ACCENT}
            activePresetId={activeMenuPreset?.id ?? null}
            bottomOffset={BOTTOM_NAV_RESERVED_HEIGHT}
            detail={heldQuickPresetNavDetail}
            emptyColor={THEME_TEXT_TERTIARY}
            inactiveColor={NAV_ICON_INACTIVE}
            isSearchTab={navTab === 'search'}
            items={quickPresetNavItems}
            onLongPressSlot={setHeldQuickPresetNavSlotNumber}
            onPressItem={(item, event, phase) => (
              handleQuickPresetNavPress(item.preset, item.slotNumber, event, phase)
            )}
            onReleaseSlot={(slotNumber) => {
              setHeldQuickPresetNavSlotNumber((current) => (
                current === slotNumber ? null : current
              ));
            }}
            openPresetId={openMenuPreset?.id ?? null}
            openSlotNumber={openQuickPresetNavSlotNumber}
            pressDelayMs={QUICK_PRESET_NAV_PRESS_DELAY_MS}
            selectedBackgroundColor={THEME_ACCENT_SOFT}
          />
          <View style={styles.bottomNavPrimary}>
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Backs up todos and settings to Google Drive"
              accessibilityLabel="Back up to Google Drive"
              accessibilityState={{ disabled: googleDriveNavDisabled }}
              disabled={googleDriveNavDisabled}
              onPress={backupToGoogleDrive}
              style={({ pressed }) => [
                styles.bottomNavItem,
                googleDriveNavDisabled && styles.bottomNavItemDisabled,
                pressed && styles.bottomNavItemPressed,
              ]}
            >
              <Ionicons
                color={googleDriveNavIconColor}
                name="cloud-upload-outline"
                size={23}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Shows filtered results; quick double tap opens filters"
              accessibilityLabel="Filters"
              accessibilityState={{ selected: filterConfigModalVisible }}
              onPress={handleFilterNavPress}
              style={({ pressed }) => [
                styles.bottomNavItem,
                pressed && styles.bottomNavItemPressed,
              ]}
            >
              <Ionicons
                color={filterConfigModalVisible ? NAV_ACCENT : NAV_ICON_INACTIVE}
                name="funnel-outline"
                size={23}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open filter menu"
              accessibilityState={{ selected: navTab === 'menu' || menuMode === 'main' }}
              {...getInstantPressHandlers(
                'bottom-nav:menu',
                () => handleNavTabPress('menu'),
              )}
              style={({ pressed }) => [
                styles.bottomNavItem,
                pressed && styles.bottomNavItemPressed,
              ]}
            >
              <Ionicons
                color={navTab === 'menu' || menuMode === 'main' ? NAV_ACCENT : NAV_ICON_INACTIVE}
                name="options-outline"
                size={23}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Opens search; second tap focuses search field; quick double tap clears search text; press and hold expands or collapses all search sections"
              accessibilityLabel="Search"
              accessibilityState={{ selected: navTab === 'search' }}
              onLongPress={handleSearchNavLongPress}
              onPress={handleSearchNavPress}
              style={({ pressed }) => [
                styles.bottomNavItem,
                pressed && styles.bottomNavItemPressed,
              ]}
            >
              <Ionicons
                color={navTab === 'search' ? NAV_ACCENT : NAV_ICON_INACTIVE}
                name="search-outline"
                size={23}
              />
            </Pressable>
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
              <Ionicons
                color={NAV_ACCENT}
                name="add-circle-outline"
                size={27}
                style={styles.bottomNavAddIcon}
              />
            </Pressable>
          </View>
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
                        {canSaveListMenuPreset ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={listMenuPresetSaveLabel}
                            hitSlop={LIST_MENU_ICON_HIT_SLOP}
                            onPress={saveListMenuPreset}
                            style={({ pressed }) => [
                              styles.listMenuHeaderSaveButton,
                              pressed && styles.listMenuArrowButtonPressed,
                            ]}
                          >
                            <Ionicons color={THEME_ACCENT} name="save-outline" size={20} />
                          </Pressable>
                        ) : null}
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
                            if (item.type === 'deleteAction') {
                              return (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel="Delete selected items"
                                  onPress={deleteSelectedTodos}
                                  style={({ pressed }) => [
                                    styles.listMenuRow,
                                    styles.listMenuDangerRow,
                                    pressed && styles.listMenuRowPressed,
                                  ]}
                                >
                                  <View style={styles.listMenuRowTextWrap}>
                                    <Text style={styles.listMenuDangerText}>{item.label}</Text>
                                  </View>
                                  <View style={styles.listMenuSubmenuZone}>
                                    <Text style={styles.listMenuDangerCount}>{item.count}</Text>
                                    <Ionicons color="#D14A42" name="trash-outline" size={20} />
                                  </View>
                                </Pressable>
                              );
                            }

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
                              const displayLabel = isRepeatStatusFilterValue(item.label)
                                ? getRepeatStatusFilterDisplayLabel(item.label)
                                : item.filterKey === 'date'
                                  ? (
                                    dateLabelDisplayMode === 'remaining'
                                      ? formatDateDisplayLabel(item.label, 'remaining')
                                      : formatDateFilterLabel(item.label)
                                  )
                                  : item.label;
                              const isRequired = !hasTodoEditTargets && isFilterValueRequired(
                                menuRequiredFilters,
                                item.filterKey,
                                item.label,
                              );
                              const isAvoided = !hasTodoEditTargets && isFilterValueAvoided(
                                menuAvoidedFilters,
                                item.filterKey,
                                item.label,
                              );

                              return (
                                <View style={styles.listMenuRow}>
                                  <Pressable
                                    accessibilityRole="button"
                                    onPress={() => removeFilter(item.filterKey, item.label)}
                                    onLongPress={
                                      !hasTodoEditTargets
                                        ? () => toggleRequiredFilterValue(item.filterKey, item.label)
                                        : undefined
                                    }
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
                                      {isRequired ? (
                                        <Ionicons
                                          color={colorTheme?.text ?? THEME_ACCENT}
                                          name="pin"
                                          size={14}
                                          style={styles.listMenuRequiredPin}
                                        />
                                      ) : null}
                                      {isAvoided ? (
                                        <Ionicons
                                          color={THEME_DANGER}
                                          name="ban"
                                          size={14}
                                          style={styles.listMenuRequiredPin}
                                        />
                                      ) : null}
                                    </View>
                                  </Pressable>
                                  <View style={styles.listMenuSubmenuZone}>
                                    <Text style={[
                                      styles.filterTypeText,
                                      isAvoided
                                        ? styles.filterTypeTextAvoided
                                        : colorTheme
                                        ? { color: colorTheme.text }
                                        : styles.filterTypeTextNoColor,
                                    ]}>
                                      {isAvoided ? 'avoid' : item.filterKey}
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
                                    onPress={() => openSavePresetPrompt()}
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
                                  actionLabel={hasTodoEditTargets ? 'Apply' : 'Edit'}
                                  label={item.label}
                                  onDelete={() => removeMenuPreset(item.preset.id)}
                                  onPress={() => (
                                    hasTodoEditTargets
                                      ? applyMenuPreset(item.preset)
                                      : openMenuPresetEditor(item.preset)
                                  )}
                                  onSecondaryPress={
                                    hasTodoEditTargets
                                      ? undefined
                                      : () => addPresetSection(item.preset.id)
                                  }
                                  secondaryAccessibilityLabel={
                                    `Add current view as section to ${item.preset.label}`
                                  }
                                  summary={item.summary}
                                />
                              );
                            }

                            if (item.type === 'presetSection') {
                              return (
                                <MemoizedMenuPresetSwipeRow
                                  actionLabel="Apply"
                                  isSection
                                  label={item.label}
                                  onDelete={() => removePresetSection(
                                    item.preset.id,
                                    item.section.id,
                                  )}
                                  onPress={() => applyPresetSection(item.preset, item.section)}
                                  summary={item.summary}
                                />
                              );
                            }

                            if (item.type === 'pinAction') {
                              return (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={item.label}
                                  accessibilityState={{ selected: item.pinned }}
                                  onPress={toggleCurrentTodoTargetsPinned}
                                  style={({ pressed }) => [
                                    styles.listMenuRow,
                                    item.pinned && styles.listMenuRowSelected,
                                    pressed && styles.listMenuRowPressed,
                                  ]}
                                >
                                  <View style={styles.listMenuRowTextWrap}>
                                    <Text style={styles.listMenuRowTitle}>{item.label}</Text>
                                  </View>
                                  <Ionicons
                                    color={item.pinned ? THEME_ACCENT : THEME_TEXT_SECONDARY}
                                    name={item.pinned ? 'pin' : 'pin-outline'}
                                    size={20}
                                  />
                                </Pressable>
                              );
                            }

  	                          if (item.type === 'menu') {
  	                            const canClearSection = menuSectionCanClear(
  	                              item.menuMode,
  	                              menuFilters,
                                  menuAvoidedFilters,
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
                            const isRepeatStatusValue =
                              isDateValue && isRepeatStatusFilterValue(item.label);
                            const isReminderValue =
                              isDateValue && (
                                isReminderPickerMenuLabel(item.label) || isRepeatStatusValue
                              );
                            const isSelected = isRepeatStatusValue
                              ? menuSelectionFilters.reminder.includes(item.label)
                              : isDateValue
                                ? isDatePickerMenuItemSelected(
                                  item.label,
                                  menuSelectionFilters.date,
                                  menuSelectionFilters.reminder,
                                  isDateMenuItemSelected,
                                )
                                : menuSelectionFilters[item.filterKey].includes(item.label);
                            const displayLabel = isRepeatStatusValue
                              ? getRepeatStatusFilterDisplayLabel(item.label)
                              : isDateValue
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
                                : isRepeatStatusValue
                                  ? `Clear ${displayLabel}`
                                : `Clear ${displayLabel}`;
                            const canRequireValue =
                              !hasTodoEditTargets &&
                              item.label !== CUSTOM_DATE_LABEL &&
                              (!isReminderValue || isRepeatStatusValue);
                            const isRequired = canRequireValue && isFilterValueRequired(
                              menuRequiredFilters,
                              item.filterKey,
                              item.label,
                            );
                            const isAvoided = canRequireValue && isFilterValueAvoided(
                              menuAvoidedFilters,
                              item.filterKey,
                              item.label,
                            );

                            return (
                              <View style={styles.listMenuSelectableRow}>
                                <Pressable
                                  accessibilityRole="button"
                                  onPress={() => (
                                    item.filterKey === 'date'
                                      ? handleDateMenuLabelPress(item.label)
                                      : toggleFilterValue(item.filterKey, item.label)
                                  )}
                                  onLongPress={
                                    canRequireValue
                                      ? () => toggleRequiredFilterValue(item.filterKey, item.label)
                                      : undefined
                                  }
                                  style={({ pressed }) => [
                                    styles.listMenuRow,
                                    (isSelected || isAvoided || pressed) && styles.listMenuRowSelected,
                                    isAvoided && styles.listMenuRowAvoided,
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
                                    {isRequired ? (
                                      <Ionicons
                                        color={colorTheme?.text ?? THEME_ACCENT}
                                        name="pin"
                                        size={14}
                                        style={styles.listMenuRequiredPin}
                                      />
                                    ) : null}
                                    {isAvoided ? (
                                      <Ionicons
                                        color={THEME_DANGER}
                                        name="ban"
                                        size={14}
                                        style={styles.listMenuRequiredPin}
                                      />
                                    ) : null}
                                  </View>
                                </Pressable>
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={clearAccessibilityLabel}
                                  disabled={!isSelected && !isAvoided}
                                  hitSlop={LIST_MENU_ICON_HIT_SLOP}
                                  onPress={() => {
                                    if (isAvoided) {
                                      removeFilter(item.filterKey, item.label);
                                      return;
                                    }

                                    if (item.label === REMINDER_PICKER_LABEL) {
                                      clearActiveTodoReminderTime();
                                      return;
                                    }

                                    if (item.label === REPEAT_PICKER_LABEL) {
                                      clearActiveTodoRepeat();
                                      return;
                                    }

                                    if (isRepeatStatusValue) {
                                      removeFilter(item.filterKey, item.label);
                                      return;
                                    }

                                    if (clearValue) {
                                      removeFilter(item.filterKey, clearValue);
                                    }
                                  }}
                                  pointerEvents={isSelected || isAvoided ? 'auto' : 'none'}
                                  style={({ pressed }) => [
                                    styles.listMenuClearButton,
                                    styles.listMenuClearButtonOverlay,
                                    { opacity: isSelected || isAvoided ? 1 : 0 },
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
                          const listIconName = item.isSubsection
                            ? undefined
                            : findListMenuNode(listMenuTree, item.label)?.iconName;
                          const isRequired = !hasTodoEditTargets && isFilterValueRequired(
                            menuRequiredFilters,
                            'list',
                            item.label,
                          );
                          const isAvoided = !hasTodoEditTargets && isFilterValueAvoided(
                            menuAvoidedFilters,
                            'list',
                            item.label,
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
                                onLongPress={
                                  !hasTodoEditTargets
                                    ? () => toggleRequiredListMenuItem(item)
                                    : undefined
                                }
                                style={({ pressed }) => [
                                  styles.listMenuRow,
                                  item.depth > 0 && styles.listMenuRowIndented,
                                  (isSelected || isAvoided || pressed) && styles.listMenuRowSelected,
                                  isAvoided && styles.listMenuRowAvoided,
                                  listColorTheme && (isSelected || pressed) && {
                                    backgroundColor: listColorTheme.tint,
                                    borderBottomColor: listColorTheme.border,
                                  },
                                ]}
                              >
                                <View style={[styles.listMenuRowTextWrap, styles.listMenuRowSelectableContent]}>
                                  {item.isSubsection ? (
                                    <Text style={styles.listMenuSubsectionMarker}>└</Text>
                                  ) : listIconName ? (
                                    <View style={styles.listMenuIconSlot}>
                                      <MaterialCommunityIcons
                                        color={listColorTheme?.accent ?? '#8F877F'}
                                        name={toMaterialCommunityIconName(listIconName)}
                                        size={16}
                                      />
                                    </View>
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
                                  {isRequired ? (
                                    <Ionicons
                                      color={listColorTheme?.text ?? THEME_ACCENT}
                                      name="pin"
                                      size={14}
                                      style={styles.listMenuRequiredPin}
                                    />
                                  ) : null}
                                  {isAvoided ? (
                                    <Ionicons
                                      color={THEME_DANGER}
                                      name="ban"
                                      size={14}
                                      style={styles.listMenuRequiredPin}
                                    />
                                  ) : null}
                                </View>
                              </Pressable>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Clear ${item.label}`}
                                disabled={!isSelected && !isAvoided}
                                hitSlop={LIST_MENU_ICON_HIT_SLOP}
                                onPress={() => removeListMenuItem(item)}
                                pointerEvents={isSelected || isAvoided ? 'auto' : 'none'}
                                style={({ pressed }) => [
                                  styles.listMenuClearButton,
                                  styles.listMenuClearButtonOverlay,
                                  { opacity: isSelected || isAvoided ? 1 : 0 },
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
                  editable={activeTodoDetailCanEdit}
                  multiline
                  onChangeText={setActiveTodoDetailDraftText}
                  onSubmitEditing={() => todoDetailContentInputRef.current?.focus()}
                  placeholder="Task title"
                  placeholderTextColor="#B5ADA5"
                  returnKeyType="next"
                  selectionColor={TODO_DETAIL_SELECTION_COLOR}
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
                {activeTodoDetailDraftContentForSave.length === 0 ? (
                  <View pointerEvents="none" style={styles.todoDetailContentPlaceholderLayer}>
                    <Text style={styles.todoDetailContentPlaceholder}>Content</Text>
                  </View>
                ) : null}
                <TextInput
                  ref={todoDetailContentInputRef}
                  autoCapitalize="sentences"
                  autoCorrect
                  multiline
                  onChangeText={setActiveTodoDetailDraftContent}
                  onSelectionChange={(event) => {
                    setActiveTodoDetailContentSelection(event.nativeEvent.selection);
                  }}
                  editable={activeTodoDetailCanEdit}
                  placeholder="Content"
                  placeholderTextColor="#B5ADA5"
                  numberOfLines={TODO_DETAIL_CONTENT_VISIBLE_LINES}
                  selection={activeTodoDetailContentSelection}
                  selectionColor={TODO_DETAIL_SELECTION_COLOR}
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
          <View style={styles.deletedTodoDetailModalRoot}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close deleted item details"
              onPress={closeDeletedTodoDetailModal}
              style={styles.todoDetailBackdrop}
            />
            {activeDeletedTodoDetail ? (
              <View
                accessibilityViewIsModal
                style={[
                  styles.todoDetailCard,
                  styles.deletedTodoDetailCard,
                  { maxHeight: deletedTodoDetailCardMaxHeight },
                ]}
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
                  style={styles.deletedTodoDetailContentScroller}
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
                      const isNoListPickerItem = createDrawerPicker === 'list'
                        && label === CREATE_DRAWER_NO_LIST_PICKER_VALUE;
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
                            : isNoListPickerItem
                              ? createDraftFilters.list.length === 0
                              : createDraftFilters[createDrawerPicker][0] === label;
                      const displayLabel = isNoListPickerItem
                        ? CREATE_DRAWER_NO_LIST_LABEL
                        : createDrawerPicker === 'date'
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
                          onPress={() => {
                            if (createDrawerPicker === 'date') {
                              handleCreateDrawerDatePress(label);
                              return;
                            }

                            if (isNoListPickerItem) {
                              clearCreateDraftList(true);
                              return;
                            }

                            setCreateDraftFilterValue(createDrawerPicker, label);
                          }}
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
                    onPress={handleCreateDrawerCalendarPress}
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
                      createDraftPinned ? 'Unpin new todo' : 'Pin new todo'
                    }
                    accessibilityState={{ selected: createDraftPinned }}
                    onPress={toggleCreateDraftPinned}
                    style={({ pressed }) => [
                      styles.createDrawerToolbarButton,
                      pressed && styles.createDrawerToolbarButtonPressed,
                      createDraftPinned && styles.createDrawerToolbarButtonActive,
                    ]}
                  >
                    <Ionicons
                      color={createDraftPinned ? THEME_ACCENT : '#8C847C'}
                      name={createDraftPinned ? 'pin' : 'pin-outline'}
                      size={22}
                    />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Set priority"
                    onPress={handleCreateDrawerPriorityPress}
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
                    accessibilityLabel={createDrawerListAccessibilityLabel}
                    onPress={handleCreateDrawerListPress}
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
          avoidedFilters={avoidedFilters}
          dateLabelDisplayMode={dateLabelDisplayMode}
          filterColors={filterColors}
          filters={selectedFilters}
          uiState={filterConfigUiState}
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
          onToggleRepeatingItemsFilter={toggleRepeatingItemsFilter}
          onToggleListItem={toggleListMenuItem}
          onToggleDateLabelDisplayMode={toggleDateLabelDisplayMode}
          onToggleMetaTag={toggleMetaTagVisibility}
          onUiStateChange={setFilterConfigUiState}
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
              <View style={styles.settingsHeaderActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${historyButtonText} ${historyButtonCount} change${historyButtonCount === 1 ? '' : 's'}`}
                  accessibilityState={{ disabled: historyButtonDisabled }}
                  disabled={historyButtonDisabled}
                  onPress={historyButtonMode === 'redo' ? redoLastChange : undoLastChange}
                  style={({ pressed }) => [
                    styles.settingsUndoButton,
                    historyButtonDisabled && styles.settingsUndoButtonDisabled,
                    pressed && styles.settingsUndoButtonPressed,
                  ]}
                >
                  <Ionicons
                    color={historyButtonDisabled ? '#B8B0A8' : NAV_ACCENT}
                    name={historyButtonIcon}
                    size={16}
                  />
                  <Text
                    style={[
                      styles.settingsUndoButtonText,
                      historyButtonDisabled && styles.settingsUndoButtonTextDisabled,
                    ]}
                  >
                    {historyButtonCount > 0
                      ? `${historyButtonText} ${historyButtonCount}`
                      : 'Undo'}
                  </Text>
                </Pressable>
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
            </View>

            <GestureScrollView
              contentContainerStyle={styles.settingsBodyContent}
              keyboardShouldPersistTaps="handled"
              scrollEnabled
              showsVerticalScrollIndicator={false}
              style={styles.settingsBody}
            >
              <View style={styles.settingsSection}>
                <View style={styles.settingsSectionHeader}>
                  <View style={styles.settingsRowTextWrap}>
                    <Text style={styles.settingsSectionTitle}>Date labels</Text>
                    <Text style={styles.settingsSectionSubtitle}>
                      {dateLabelDisplayMode === 'remaining' ? 'Days remaining' : 'Exact day'}
                      {' · '}
                      {showOverdueMetaTags ? 'Overdue count' : 'No overdue count'}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`${settingsDateLabelsExpanded ? 'Collapse' : 'Expand'} Date labels section`}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: settingsDateLabelsExpanded }}
                    hitSlop={SETTINGS_SECTION_TOGGLE_HIT_SLOP}
                    onPress={() => setSettingsDateLabelsExpanded((current) => !current)}
                    style={({ pressed }) => [
                      styles.settingsSectionChevronButton,
                      pressed && styles.settingsSectionChevronButtonPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.settingsSectionChevron,
                        settingsDateLabelsExpanded && styles.settingsSectionChevronExpanded,
                      ]}
                    >
                      ›
                    </Text>
                  </Pressable>
                </View>

                {settingsDateLabelsExpanded ? (
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
                          Today, Tomorrow, 3 days… instead of exact calendar dates.
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
                    <Pressable
                      accessibilityRole="switch"
                      accessibilityState={{ checked: showOverdueMetaTags }}
                      onPress={toggleShowOverdueMetaTags}
                      style={({ pressed }) => [
                        styles.settingsOptionRow,
                        pressed && styles.settingsOptionRowPressed,
                      ]}
                    >
                      <Text style={styles.settingsOptionText}>Show overdue count</Text>
                      <Text style={styles.settingsOptionValue}>
                        {showOverdueMetaTags ? 'On' : 'Off'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>

              <View style={styles.settingsSection}>
                <View style={styles.settingsSectionHeader}>
                  <View style={styles.settingsRowTextWrap}>
                    <Text style={styles.settingsSectionTitle}>Backup</Text>
                    <Text style={styles.settingsSectionSubtitle}>
                      Google Drive · up to {DRIVE_BACKUP_SLOT_LIMIT} {DRIVE_BACKUP_VARIANT_LOWER_LABEL} backups
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
                          {activeTodoCount} items · {countFilters(selectedFilters)} filters · restore any backup
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
                        Google sign-in is not configured for this {DRIVE_BACKUP_VARIANT_LOWER_LABEL} build. {DRIVE_BACKUP_CONFIG_HINT}
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
                      <Text style={styles.settingsOptionText}>
                        Auto backup new snapshots
                      </Text>
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
                        {googleDriveBusy ? 'Working...' : `Backup ${DRIVE_BACKUP_VARIANT_LOWER_LABEL} data`}
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
                      <Text style={styles.settingsRestoreButtonText}>
                        Restore {DRIVE_BACKUP_VARIANT_LOWER_LABEL} data
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      disabled={googleDriveBusy || !googleDriveActionReady}
                      onPress={showGoogleDriveBackups}
                      style={({ pressed }) => [
                        styles.settingsRestoreButton,
                        (googleDriveBusy || !googleDriveActionReady) && styles.settingsButtonDisabled,
                        pressed && styles.settingsSecondaryButtonPressed,
                      ]}
                    >
                      <Text style={styles.settingsRestoreButtonText}>
                        Show {DRIVE_BACKUP_VARIANT_LOWER_LABEL} backups
                      </Text>
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
                      {listMenuTree.length} lists · {settingsNavbarPinnedListCount} in navbar
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

                    <Text style={styles.settingsListReorderHint}>
                      {listMenuTree.length > 1
                        ? 'Tap the handle on one list, then another to swap. Swipe left to delete. Pin to show in navbar.'
                        : 'Swipe left to delete. Pin to show in navbar.'}
                    </Text>

                    <MemoizedSettingsListEditor
                      iconPickerIndex={settingsListIconPickerIndex}
                      items={listMenuTree}
                      onDelete={removeSettingsList}
                      onIconPickerChange={setSettingsListIconPickerIndex}
                      reorderCancelNonce={settingsListReorderCancelNonce}
                      onMainPress={openSettingsListKeywordPrompt}
                      onPinPress={toggleSettingsListNavbarPinned}
                      onSwap={handleSettingsListSwap}
                      onSetIcon={setSettingsListIcon}
                    />

                    <View style={styles.settingsListMenuOrderSection}>
                      <Text style={styles.settingsListMenuOrderTitle}>List menu order</Text>
                      <Text style={styles.settingsListMenuOrderSubtitle}>
                        Applies to the lists menu only
                      </Text>
                      <View style={styles.settingsSegmentedControl}>
                        {(['alphabetical', 'manual'] as ListOrderMode[]).map((mode) => {
                          const selected = listOrderMode === mode;
                          return (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                              key={mode}
                              onPress={() => {
                                if (listOrderMode === mode) {
                                  return;
                                }

                                recordUndo('Change list order');
                                setListOrderMode(mode);
                                if (mode === 'alphabetical') {
                                  setSettingsListReorderCancelNonce((current) => current + 1);
                                }
                                void persistAppSettings({ listOrderMode: mode });
                              }}
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
                    </View>
                  </View>
                ) : null}
              </View>

              <View style={styles.settingsSection}>
                <View style={styles.settingsSectionHeader}>
                  <View style={styles.settingsRowTextWrap}>
                    <Text style={styles.settingsSectionTitle}>Colors</Text>
                    <Text style={styles.settingsSectionSubtitle}>
                      {settingsColorItemCount} items · Backgrounds, priority parts
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
                        key={group.id}
                        style={[
                          styles.settingsColorGroup,
                          groupIndex === 0 && styles.settingsColorGroupFirst,
                        ]}
                      >
                        <Text style={styles.settingsColorGroupTitle}>{group.title}</Text>
                        {group.items.map((item) => {
                          const selectedAccent = getFilterColor(
                            filterColors,
                            item.filterKey,
                            item.value,
                          );

                          return (
                            <MemoizedSettingsColorRow
                              displayLabel={item.displayLabel}
                              filterKey={item.filterKey}
                              key={`${item.filterKey}-${item.value}`}
                              onSelectColor={setFilterColor}
                              selectedAccent={selectedAccent}
                              sourceLabel={item.sourceLabel}
                              value={item.value}
                            />
                          );
                        })}
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              {isDevAppVariant ? (
                <View style={styles.settingsSection}>
                  <View style={styles.settingsSectionHeader}>
                    <View style={styles.settingsRowTextWrap}>
                      <Text style={styles.settingsSectionTitle}>Dev test data</Text>
                      <Text style={styles.settingsSectionSubtitle}>
                        {devTestTodoCount}/{DEV_TEST_TODO_COUNT} todos · {devTestMenuPresetCount}/{DEV_TEST_MENU_PRESET_COUNT} saved lists · {devTestListMenuNodeCount} seed lists
                      </Text>
                    </View>
                  </View>

                  <View style={styles.settingsCard}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={addDevTestTodos}
                      style={({ pressed }) => [
                        styles.settingsPrimaryButton,
                        pressed && styles.settingsPrimaryButtonPressed,
                      ]}
                    >
                      <Text style={styles.settingsPrimaryButtonText}>
                        Add test data
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      disabled={
                        devTestTodoCount === 0 &&
                        devTestMenuPresetCount === 0 &&
                        devTestListMenuNodeCount === 0
                      }
                      onPress={clearDevTestTodos}
                      style={({ pressed }) => [
                        styles.settingsRestoreButton,
                        devTestTodoCount === 0 &&
                          devTestMenuPresetCount === 0 &&
                          devTestListMenuNodeCount === 0 &&
                          styles.settingsButtonDisabled,
                        pressed && styles.settingsSecondaryButtonPressed,
                      ]}
                    >
                      <Text style={styles.settingsRestoreButtonText}>Clear test data</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </GestureScrollView>
            </View>
          </View>
        ) : null}
        <Modal
          animationType="fade"
          onRequestClose={closeGoogleDriveBackupPicker}
          presentationStyle="overFullScreen"
          transparent
          visible={googleDriveBackupPicker !== null}
        >
          <GestureHandlerRootView style={styles.googleDrivePickerModalRoot}>
            <View style={styles.presetSaveModalBackdrop}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss Google Drive backup picker"
                onPress={closeGoogleDriveBackupPicker}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.presetSaveModalCenter}>
              <View
                style={[
                  styles.presetSaveModalCard,
                  styles.googleDrivePickerCard,
                  { height: googleDrivePickerModalLayout.cardHeight },
                ]}
              >
                {googleDriveBackupPicker ? (
                  <>
                    <Text style={styles.presetSaveModalTitle}>
                      {googleDriveBackupPicker.mode === 'backup'
                        ? `Backup ${DRIVE_BACKUP_VARIANT_LOWER_LABEL} data`
                        : googleDriveBackupPicker.mode === 'restore'
                          ? `Restore ${DRIVE_BACKUP_VARIANT_LOWER_LABEL} data`
                          : `${DRIVE_BACKUP_VARIANT_LABEL} backups`}
                    </Text>
                    <Text style={styles.presetSaveModalMessage}>
                      {googleDriveBackupPicker.mode === 'backup'
                        ? `Each backup creates a new snapshot. The oldest is removed after ${DRIVE_BACKUP_SLOT_LIMIT}.`
                        : googleDriveBackupPicker.mode === 'restore'
                          ? `Choose a saved ${DRIVE_BACKUP_VARIANT_LOWER_LABEL} backup to restore.`
                          : `Swipe left on a backup to delete it from Google Drive.`}
                    </Text>

                    <GestureScrollView
                      ref={googleDriveBackupPickerScrollRef}
                      contentContainerStyle={styles.googleDrivePickerListContent}
                      directionalLockEnabled
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={googleDriveBackupPicker.slots.length > 6}
                      style={styles.googleDrivePickerList}
                    >
                      {googleDriveBackupPicker.slots.length === 0 ? (
                        <Text style={styles.googleDrivePickerEmptyText}>
                          No saved {DRIVE_BACKUP_VARIANT_LOWER_LABEL} backups
                        </Text>
                      ) : googleDriveBackupPicker.slots.map((slot) => {
                        const isManageMode = googleDriveBackupPicker.mode === 'manage';
                        const disabled =
                          googleDriveBackupPicker.mode === 'restore' && !slot.file;
                        const actionLabel = googleDriveBackupPicker.mode === 'backup'
                          ? 'Save'
                          : googleDriveBackupPicker.mode === 'restore'
                            ? slot.file ? 'Restore' : 'Empty'
                            : 'Saved';

                        return (
                          <MemoizedGoogleDriveBackupSlotRow
                            actionLabel={actionLabel}
                            disabled={disabled}
                            key={slot.slot}
                            listOnly={isManageMode}
                            onPress={() => resolveGoogleDriveBackupPicker({ slot, type: 'slot' })}
                            onDelete={() => deleteGoogleDriveBackupSlot(slot)}
                            scrollGestureRef={googleDriveBackupPickerScrollRef}
                            slot={slot}
                          />
                        );
                      })}
                    </GestureScrollView>

                    <View style={styles.presetSaveModalActions}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={closeGoogleDriveBackupPicker}
                        style={({ pressed }) => [
                          styles.presetSaveModalButton,
                          styles.presetSaveModalButtonSecondary,
                          pressed && styles.presetSaveModalButtonPressed,
                        ]}
                      >
                        <Text style={styles.presetSaveModalButtonSecondaryText}>
                          {googleDriveBackupPicker.mode === 'manage' ? 'Done' : 'Cancel'}
                        </Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}
              </View>
            </View>
          </View>
          </GestureHandlerRootView>
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
              accessibilityLabel="Dismiss save list dialog"
              onPress={closePresetSaveModal}
              style={StyleSheet.absoluteFill}
            />
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.presetSaveModalCenter}
            >
              <View style={styles.presetSaveModalCard}>
                <Text style={styles.presetSaveModalTitle}>Save list</Text>
                <Text style={styles.presetSaveModalMessage}>
                  Enter a name for this list.
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
                  placeholder="List name"
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
        <Modal
          animationType="fade"
          onRequestClose={closeSearchKeywordModal}
          onShow={() => {
            scheduleSearchKeywordModalInputFocus();
          }}
          presentationStyle="overFullScreen"
          transparent
          visible={searchKeywordModalVisible}
        >
          <View
            style={[
              styles.presetSaveModalBackdrop,
              keyboardOverlayInset > 0 && styles.presetSaveModalBackdropAboveKeyboard,
              keyboardOverlayInset > 0 && { paddingBottom: keyboardOverlayInset + 12 },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss search keyword dialog"
              onPress={closeSearchKeywordModal}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.presetSaveModalCenter}>
              <View style={styles.presetSaveModalCard}>
                <Text numberOfLines={2} style={styles.presetSaveModalTitle}>
                  {searchKeywordEditTarget?.kind === 'list'
                    ? 'Edit list'
                    : searchKeywordEditTitle}
                </Text>
                {searchKeywordEditTarget?.kind === 'list' ? (
                  <TextInput
                    ref={listSearchKeywordTitleInputRef}
                    autoCapitalize="words"
                    autoCorrect={false}
                    autoFocus
                    onChangeText={setSearchKeywordTitleDraft}
                    onPressIn={() => {
                      listSearchKeywordTitleInputRef.current?.focus();
                    }}
                    onSubmitEditing={() => {
                      presetSearchKeywordInputRef.current?.focus();
                    }}
                    placeholder="List name"
                    placeholderTextColor="#A69D94"
                    returnKeyType="next"
                    selectTextOnFocus
                    showSoftInputOnFocus
                    style={styles.presetSaveModalInput}
                    submitBehavior="submit"
                    value={searchKeywordTitleDraft}
                  />
                ) : null}
                <Text
                  style={[
                    styles.presetSaveModalMessage,
                    searchKeywordEditTarget?.kind === 'list' && styles.presetSaveModalFieldMessage,
                  ]}
                >
                  {searchKeywordEditTarget?.kind === 'list'
                    ? 'Hidden words for matching this list from Search.'
                    : 'Hidden words for matching this list from Search.'}
                </Text>
                <TextInput
                  ref={presetSearchKeywordInputRef}
                  autoCapitalize="sentences"
                  autoCorrect
                  autoFocus={searchKeywordEditTarget?.kind !== 'list'}
                  blurOnSubmit
                  multiline
                  numberOfLines={2}
                  onChangeText={setSearchKeywordDraft}
                  onPressIn={() => {
                    presetSearchKeywordInputRef.current?.focus();
                  }}
                  onSubmitEditing={(event) => {
                    commitSearchKeywords(
                      event.nativeEvent.text || searchKeywordDraft,
                    );
                  }}
                  placeholder="priority daily meditation"
                  placeholderTextColor="#A69D94"
                  returnKeyType="done"
                  showSoftInputOnFocus
                  style={[
                    styles.presetSaveModalInput,
                    styles.presetSearchKeywordModalInput,
                    searchKeywordEditTarget?.kind === 'list' && styles.presetSaveModalInputFollowUp,
                  ]}
                  submitBehavior="submit"
                  textAlignVertical="top"
                  value={searchKeywordDraft}
                />
                <View style={styles.presetSaveModalActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={closeSearchKeywordModal}
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
                    disabled={searchKeywordModalSaveDisabled}
                    onPress={() => commitSearchKeywords(searchKeywordDraft)}
                    style={({ pressed }) => [
                      styles.presetSaveModalButton,
                      styles.presetSaveModalButtonPrimary,
                      searchKeywordModalSaveDisabled && styles.settingsButtonDisabled,
                      pressed && styles.presetSaveModalButtonPressed,
                    ]}
                  >
                    <Text style={styles.presetSaveModalButtonPrimaryText}>Save</Text>
                  </Pressable>
                </View>
              </View>
            </View>
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
    position: 'relative',
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
  deletedTodoDetailModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 12,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: TOP_SAFE_GAP + 24,
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
    justifyContent: 'flex-end',
    paddingBottom: 12,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: TOP_SAFE_GAP + 24,
  },
  todoDetailLayerKeyboard: {
    justifyContent: 'flex-end',
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
  deletedTodoDetailCard: {
    alignSelf: 'center',
    maxWidth: 430,
    width: '100%',
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
    position: 'relative',
  },
  todoDetailContentPlaceholderLayer: {
    left: 18,
    position: 'absolute',
    top: 16,
    zIndex: 1,
  },
  todoDetailContentPlaceholder: {
    color: '#B5ADA5',
    fontSize: 17,
    fontWeight: FONT_REGULAR,
    letterSpacing: 0,
    lineHeight: 25,
  },
  todoDetailContentInput: {
    color: '#3A332E',
    fontSize: 17,
    fontWeight: FONT_REGULAR,
    letterSpacing: 0,
    lineHeight: 25,
    minHeight: TODO_DETAIL_CONTENT_INPUT_MIN_HEIGHT,
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
  deletedTodoDetailContentScroller: {
    flexShrink: 1,
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
  presetSaveModalBackdropAboveKeyboard: {
    justifyContent: 'flex-end',
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
  presetSaveModalFieldMessage: {
    marginTop: 14,
  },
  presetSaveModalInputFollowUp: {
    marginTop: 12,
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
  presetSearchKeywordModalInput: {
    maxHeight: 68,
    minHeight: 68,
    paddingBottom: 10,
    paddingTop: 10,
  },
  googleDrivePickerModalRoot: {
    flex: 1,
  },
  googleDrivePickerCard: {
    flexDirection: 'column',
    width: '100%',
  },
  googleDrivePickerList: {
    flex: 1,
    marginHorizontal: -4,
    marginTop: 12,
    minHeight: 0,
  },
  googleDrivePickerListContent: {
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  googleDrivePickerSwipeShell: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  googleDrivePickerSwipeContainer: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  googleDrivePickerSwipeChildren: {
    backgroundColor: THEME_BG,
  },
  googleDrivePickerSwipeActions: {
    alignItems: 'center',
    backgroundColor: '#CF413A',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    minHeight: 62,
    width: BACKUP_SLOT_SWIPE_DELETE_WIDTH,
  },
  googleDrivePickerSwipeDelete: {
    alignItems: 'center',
    backgroundColor: '#CF413A',
    justifyContent: 'center',
    minHeight: 62,
    width: BACKUP_SLOT_SWIPE_DELETE_WIDTH,
  },
  googleDrivePickerChoice: {
    alignItems: 'center',
    backgroundColor: THEME_BG,
    borderColor: '#E8E2DA',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 62,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  googleDrivePickerChoicePrimary: {
    backgroundColor: THEME_ACCENT_SOFT,
    borderColor: THEME_ACCENT,
    marginTop: 14,
  },
  googleDrivePickerChoiceFilled: {
    borderColor: THEME_ACCENT,
  },
  googleDrivePickerChoiceDisabled: {
    opacity: 0.5,
  },
  googleDrivePickerChoicePressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  googleDrivePickerChoiceTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  googleDrivePickerChoiceTitle: {
    color: THEME_TEXT,
    fontSize: 15,
    fontWeight: FONT_MEDIUM,
    lineHeight: 20,
  },
  googleDrivePickerChoiceSubtitle: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: FONT_REGULAR,
    lineHeight: 16,
    marginTop: 2,
  },
  googleDrivePickerChoiceAction: {
    color: THEME_ACCENT,
    fontSize: 13,
    fontWeight: FONT_MEDIUM,
    lineHeight: 18,
  },
  googleDrivePickerChoiceActionDisabled: {
    color: THEME_TEXT_TERTIARY,
  },
  googleDrivePickerEmptyText: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 13,
    fontWeight: FONT_REGULAR,
    lineHeight: 18,
    marginTop: 14,
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
  settingsHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
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
  settingsUndoButton: {
    alignItems: 'center',
    backgroundColor: THEME_ACCENT_SOFT,
    borderColor: '#D6E0FF',
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    height: 42,
    justifyContent: 'center',
    minWidth: 88,
    paddingHorizontal: 12,
  },
  settingsUndoButtonDisabled: {
    backgroundColor: '#F4F0EA',
    borderColor: '#E8E2DA',
  },
  settingsUndoButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.97 }],
  },
  settingsUndoButtonText: {
    color: NAV_ACCENT,
    fontSize: 13,
    fontWeight: FONT_SEMIBOLD,
    letterSpacing: 0,
    lineHeight: 18,
  },
  settingsUndoButtonTextDisabled: {
    color: '#B8B0A8',
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
    minHeight: 40,
    borderRadius: CONTROL_BORDER_RADIUS,
    backgroundColor: '#F3EEE7',
    flexDirection: 'row',
    marginTop: 10,
    padding: 3,
  },
  settingsSegmentButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: 8,
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
  },
  settingsAddListInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: CONTROL_BORDER_RADIUS,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E4DED6',
    color: THEME_TEXT,
    fontSize: 15,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  settingsAddListButton: {
    minWidth: 64,
    minHeight: 44,
    borderRadius: CONTROL_BORDER_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME_ACCENT,
    paddingHorizontal: 12,
  },
  settingsAddListButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: FONT_MEDIUM,
    lineHeight: 18,
  },
  settingsListReorderHint: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 13,
    fontWeight: FONT_REGULAR,
    letterSpacing: 0.1,
    lineHeight: 18,
    marginTop: 12,
  },
  settingsListMenuOrderSection: {
    borderTopColor: '#F2EBE3',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginHorizontal: -14,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  settingsListMenuOrderTitle: {
    color: THEME_TEXT,
    fontSize: 14,
    fontWeight: FONT_MEDIUM,
    letterSpacing: 0.1,
    lineHeight: 18,
  },
  settingsListMenuOrderSubtitle: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: FONT_REGULAR,
    letterSpacing: 0.1,
    lineHeight: 16,
    marginTop: 2,
  },
  settingsListEditor: {
    borderTopColor: '#F2EBE3',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginHorizontal: -14,
    marginTop: 14,
    overflow: 'visible',
    position: 'relative',
  },
  settingsListGroup: {
    borderBottomColor: '#F2EBE3',
    borderBottomWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
  settingsListGroupReorderSelected: {
    backgroundColor: THEME_ACCENT_SOFT,
  },
  settingsListRowSlot: {
    minHeight: SETTINGS_LIST_ROW_HEIGHT,
    position: 'relative',
  },
  settingsListRowWrap: {
    alignItems: 'stretch',
    flexDirection: 'row',
  },
  settingsListDragHandle: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingLeft: 10,
    width: 36,
  },
  settingsListDragHandleSelected: {
    backgroundColor: 'rgba(76, 120, 255, 0.12)',
  },
  settingsListSwipeWrap: {
    flex: 1,
    minWidth: 0,
  },
  settingsListRow: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 8,
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  settingsListRowContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 34,
    minWidth: 0,
  },
  settingsListIconButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: THEME_CARD,
    borderColor: THEME_TEXT,
    borderRadius: CONTROL_BORDER_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  settingsListTitle: {
    color: THEME_TEXT,
    fontSize: 15,
    fontWeight: FONT_MEDIUM,
    includeFontPadding: false,
    lineHeight: 20,
    letterSpacing: 0.1,
    textAlignVertical: 'center',
  },
  settingsListSwipeShell: {
    height: SETTINGS_LIST_ROW_HEIGHT,
    overflow: 'hidden',
  },
  settingsListSwipeContainer: {
    height: SETTINGS_LIST_ROW_HEIGHT,
    overflow: 'hidden',
  },
  settingsListSwipeChildren: {
    backgroundColor: THEME_CARD,
  },
  settingsListSwipeActions: {
    alignItems: 'center',
    backgroundColor: '#CF413A',
    flexDirection: 'row',
    height: SETTINGS_LIST_ROW_HEIGHT,
    justifyContent: 'flex-end',
    width: SETTINGS_LIST_SWIPE_DELETE_WIDTH,
  },
  settingsListSwipeDelete: {
    alignItems: 'center',
    backgroundColor: '#CF413A',
    height: SETTINGS_LIST_ROW_HEIGHT,
    justifyContent: 'center',
    width: SETTINGS_LIST_SWIPE_DELETE_WIDTH,
  },
  settingsListPinButton: {
    alignItems: 'center',
    flexShrink: 0,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  settingsListPinButtonActive: {
    backgroundColor: THEME_ACCENT_SOFT,
    borderRadius: CONTROL_BORDER_RADIUS,
  },
  settingsListIconButtonActive: {
    backgroundColor: THEME_ACCENT_SOFT,
    borderColor: THEME_ACCENT,
  },
  settingsListIconChoicesScroll: {
    borderTopColor: THEME_ACCENT_SOFT,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: -2,
    maxHeight: 300,
  },
  settingsListIconChoices: {
    paddingBottom: 12,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  settingsListIconChoicesHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  settingsListIconCloseButton: {
    alignItems: 'center',
    backgroundColor: THEME_CARD,
    borderColor: THEME_TEXT,
    borderRadius: CONTROL_BORDER_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 36,
  },
  settingsListIconGroup: {
    marginTop: 12,
  },
  settingsListIconGroupTitle: {
    color: THEME_TEXT,
    fontSize: 11,
    fontWeight: FONT_MEDIUM,
    letterSpacing: 0.2,
    lineHeight: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  settingsListIconGroupGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  settingsListIconChoiceButton: {
    alignItems: 'center',
    backgroundColor: THEME_CARD,
    borderColor: THEME_TEXT,
    borderRadius: CONTROL_BORDER_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 36,
  },
  settingsListIconChoiceButtonSelected: {
    backgroundColor: THEME_ACCENT_SOFT,
    borderColor: THEME_ACCENT,
  },
  settingsListIconChoiceEmpty: {
    backgroundColor: THEME_CARD,
    borderColor: THEME_TEXT,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    height: 12,
    width: 12,
  },
  settingsListMainPress: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 0,
  },
  settingsListRowPressed: {
    opacity: 0.72,
  },
  settingsNavbarPresetAutoRow: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: THEME_ACCENT_SOFT,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    minHeight: 38,
    paddingHorizontal: 12,
  },
  settingsNavbarPresetAutoText: {
    color: THEME_ACCENT,
    fontSize: 13,
    fontWeight: FONT_MEDIUM,
    lineHeight: 17,
  },
  settingsNavbarPresetToolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: 10,
  },
  settingsNavbarPresetAddButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#F7F3EE',
    borderColor: '#E8E2DA',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 11,
  },
  settingsNavbarPresetAddButtonText: {
    color: THEME_ACCENT,
    fontSize: 13,
    fontWeight: FONT_MEDIUM,
    lineHeight: 17,
  },
  settingsNavbarPresetSlot: {
    borderTopColor: '#F2EBE3',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 14,
    paddingTop: 14,
  },
  settingsNavbarPresetSlotFirst: {
    borderTopWidth: 0,
    marginTop: 0,
    paddingTop: 0,
  },
  settingsNavbarPresetSlotHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 42,
  },
  settingsNavbarPresetDragZone: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: 24,
  },
  settingsNavbarPresetDragHandle: {
    color: THEME_TEXT_TERTIARY,
    fontSize: 16,
    fontWeight: FONT_MEDIUM,
    lineHeight: 18,
  },
  settingsNavbarPresetSlotIcon: {
    alignItems: 'center',
    backgroundColor: '#F3EEE7',
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  settingsNavbarPresetSlotIconPinned: {
    backgroundColor: THEME_ACCENT_SOFT,
  },
  settingsNavbarPresetSlotTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  settingsNavbarPresetSlotTitle: {
    color: THEME_TEXT,
    fontSize: 14,
    fontWeight: FONT_MEDIUM,
    lineHeight: 18,
  },
  settingsNavbarPresetSlotValue: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: FONT_REGULAR,
    lineHeight: 16,
    marginTop: 2,
  },
  settingsNavbarPresetChoicesScroll: {
    marginTop: 10,
  },
  settingsNavbarPresetChoices: {
    alignItems: 'center',
    gap: 8,
    paddingRight: 2,
  },
  settingsNavbarPresetIconChoices: {
    alignItems: 'center',
    gap: 7,
    paddingRight: 2,
  },
  settingsNavbarPresetIconChoiceButton: {
    alignItems: 'center',
    backgroundColor: '#F7F3EE',
    borderColor: '#E8E2DA',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 38,
  },
  settingsNavbarPresetIconChoiceButtonSelected: {
    backgroundColor: THEME_ACCENT_SOFT,
    borderColor: THEME_ACCENT,
  },
  settingsNavbarPresetChoiceButton: {
    alignItems: 'center',
    backgroundColor: '#F7F3EE',
    borderColor: '#E8E2DA',
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    maxWidth: 148,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  settingsNavbarPresetChoiceButtonSelected: {
    backgroundColor: THEME_ACCENT_SOFT,
    borderColor: THEME_ACCENT,
  },
  settingsNavbarPresetChoiceText: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 13,
    fontWeight: FONT_MEDIUM,
    lineHeight: 17,
    maxWidth: 124,
  },
  settingsNavbarPresetChoiceTextSelected: {
    color: THEME_ACCENT,
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
    width: 124,
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
    color: THEME_TEXT,
    fontSize: 14,
    fontWeight: FONT_REGULAR,
    lineHeight: 18,
    minWidth: 0,
  },
  settingsColorLabelTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  settingsColorSourceLabel: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 10,
    fontWeight: FONT_MEDIUM,
    lineHeight: 13,
    marginTop: 1,
    minWidth: 0,
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
    width: 32,
    height: 32,
    borderRadius: CONTROL_BORDER_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E4DED6',
    backgroundColor: '#F7F3EE',
  },
  settingsColorSwatch: {
    width: 16,
    height: 16,
    borderRadius: 5,
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
    paddingHorizontal: 94,
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
  appHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    position: 'absolute',
    right: HORIZONTAL_PADDING,
    top: Platform.OS === 'android' ? TOP_SAFE_GAP - 4 : 4,
  },
  appHeaderActionButton: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    position: 'relative',
    width: 36,
  },
  appHeaderUndoButtonAvailable: {
    backgroundColor: THEME_ACCENT_SOFT,
  },
  appHeaderUndoButtonDisabled: {
    opacity: 0.46,
  },
  appHeaderUndoCountBadge: {
    backgroundColor: NAV_ACCENT,
    borderColor: THEME_CARD,
    borderRadius: 9,
    borderWidth: 1,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: FONT_SEMIBOLD,
    lineHeight: 14,
    minWidth: 17,
    overflow: 'hidden',
    paddingHorizontal: 4,
    position: 'absolute',
    right: -3,
    textAlign: 'center',
    top: -3,
  },
  appHeaderCreateFromSettingsCue: {
    alignItems: 'center',
    backgroundColor: NAV_ACCENT,
    borderColor: THEME_CARD,
    borderRadius: 18,
    borderWidth: 2,
    elevation: 3,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    right: HORIZONTAL_PADDING + 84,
    shadowColor: NAV_ACCENT,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    top: Platform.OS === 'android' ? TOP_SAFE_GAP - 4 : 4,
    width: 36,
    zIndex: 3,
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
    height: HEADER_SEARCH_ROW_HEIGHT,
    paddingBottom: 12,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: 4,
  },
  navSearchIcon: {
    marginRight: 8,
  },
  todoUndoToastLayer: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'flex-end',
    left: 0,
    paddingBottom: BOTTOM_NAV_RESERVED_HEIGHT + 10,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 40,
    elevation: 12,
  },
  todoUndoButton: {
    alignItems: 'center',
    backgroundColor: NAV_ACCENT,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 7,
    minHeight: 42,
    minWidth: 112,
    justifyContent: 'center',
    paddingHorizontal: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 12,
  },
  todoUndoButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  todoUndoButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: FONT_SEMIBOLD,
    letterSpacing: 0,
    lineHeight: 20,
  },
  bottomNav: {
    alignItems: 'stretch',
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E5E5EA',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'column',
    height: BOTTOM_NAV_RESERVED_HEIGHT,
    justifyContent: 'flex-start',
    paddingBottom: 0,
    paddingTop: 0,
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
  bottomNavPrimary: {
    alignItems: 'stretch',
    flexDirection: 'row',
    height: BOTTOM_NAV_PRIMARY_HEIGHT,
    justifyContent: 'space-around',
  },
  bottomNavItem: {
    alignItems: 'center',
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    paddingTop: 0,
  },
  bottomNavAddIcon: {
    transform: [{ translateY: -3 }],
  },
  bottomNavItemDisabled: {
    opacity: 0.42,
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
    minWidth: 0,
    paddingVertical: 0,
  },
  searchModeToggle: {
    alignItems: 'center',
    backgroundColor: THEME_BG,
    borderColor: THEME_BORDER,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginLeft: 8,
    overflow: 'hidden',
    padding: 2,
  },
  searchModeToggleButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 28,
    justifyContent: 'center',
    width: 30,
  },
  searchModeToggleButtonActive: {
    backgroundColor: THEME_ACCENT_SOFT,
  },
  searchModeToggleButtonPressed: {
    opacity: 0.72,
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
    position: 'relative',
  },
  menuDragPill: {
    backgroundColor: '#D8D0C8',
    borderRadius: 999,
    height: 5,
    width: 42,
  },
  listMenuHeaderSaveButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    top: 3,
    width: 34,
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
  listMenuRowAvoided: {
    backgroundColor: '#FDECEC',
    borderBottomColor: '#F4C8C8',
  },
  clearFiltersRow: {
    marginTop: 2,
  },
  listMenuDangerRow: {
    marginTop: 2,
  },
  clearFiltersText: {
    color: '#8F4D46',
    fontSize: 15,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  listMenuDangerText: {
    color: '#A13E37',
    fontSize: 15,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  listMenuDangerCount: {
    color: '#A13E37',
    fontSize: 12,
    fontWeight: FONT_MEDIUM,
    lineHeight: 16,
    letterSpacing: 0.2,
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
  filterTypeTextAvoided: {
    color: THEME_DANGER,
  },
  listMenuRequiredPin: {
    flexShrink: 0,
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
  listMenuPresetSectionRow: {
    backgroundColor: THEME_BG,
    paddingLeft: 28,
  },
  listMenuPresetMainPress: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    minWidth: 0,
  },
  listMenuPresetActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 2,
    marginLeft: 8,
  },
  listMenuPresetIconAction: {
    alignItems: 'center',
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  listMenuPresetActionButton: {
    alignItems: 'center',
    borderRadius: 12,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  listMenuPresetSectionTitle: {
    color: '#5C554E',
    fontSize: 14,
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
  listMenuIconSlot: {
    alignItems: 'center',
    height: 14,
    justifyContent: 'center',
    width: 14,
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
    flexShrink: 1,
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
  todoListHeaderChrome: {
    marginHorizontal: -HORIZONTAL_PADDING,
  },
  todoListItem: {
    alignSelf: 'stretch',
    width: '100%',
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
  todoSectionGroupedShellHighlighted: {
    backgroundColor: THEME_ACCENT_SOFT,
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
  todoSectionHeaderPressable: {
    alignSelf: 'stretch',
    flex: 1,
    flexBasis: 0,
    flexShrink: 1,
    justifyContent: 'center',
    minHeight: 24,
    minWidth: 0,
  },
  todoSectionHeaderMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 24,
    minWidth: 0,
    width: '100%',
  },
  todoGroupHeaderPressed: {
    opacity: 0.72,
  },
  todoSectionHeaderMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 6,
  },
  todoSectionAddButton: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  todoSectionAddButtonPressed: {
    opacity: 0.72,
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
  todoRowDividerHighlighted: {
    backgroundColor: THEME_ACCENT_SOFT,
  },
  searchPresetSectionsContent: {
    gap: TODO_LIST_ROW_GAP,
    paddingBottom: 14,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: 8,
  },
  searchPresetSectionShell: {
    alignSelf: 'stretch',
    width: '100%',
  },
  searchPresetSectionTitleMatched: {
    color: THEME_ACCENT,
  },
  searchListSectionTitleIcon: {
    flexShrink: 0,
  },
  searchPresetSectionEmpty: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  searchPresetSectionEmptyText: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 14,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
    textAlign: 'center',
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
