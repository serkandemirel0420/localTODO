import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { TokenResponse } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
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

import { createTodoSearchIndex, searchTodos } from './src/search/todoSearch';
import { localTodoStore } from './src/storage/todoStore';
import {
  cloneTodoFilters,
  makeTodo,
  normalizeTodoFilters,
  normalizeTodoText,
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
  cloneListMenuTree,
  cloneMenuPresets,
  DEFAULT_LIST_MENU_TREE,
  type AppSettings,
  type ListOrderMode,
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
  onDelete: (id: string) => void;
  onListTap: (event: GestureResponderEvent) => boolean;
  onOpenMenu: (id: string) => void;
  onSetDone: (id: string, done: boolean) => void;
};

type ListMenuNode = StoredListMenuNode;
type MenuPreset = StoredMenuPreset;

type VisibleListMenuItem = {
  id: string;
  label: string;
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
      type: 'group';
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
): boolean => {
  const filterKey = MENU_SECTION_FILTER_KEYS[menuMode];
  if (filterKey) {
    return filters[filterKey].length > 0;
  }

  if (menuMode === 'filters') {
    return activeFilterCount > 0;
  }

  if (menuMode === 'sort') {
    return sortMode !== 'newest';
  }

  if (menuMode === 'group') {
    return groupMode !== 'none';
  }

  return false;
};

const TODO_ACTION_WIDTH = 68;
const TODO_LEFT_ACTION_MENU_WIDTH = TODO_ACTION_WIDTH * 2;
const TODO_RIGHT_ACTION_MENU_WIDTH = TODO_ACTION_WIDTH;
const TOP_SAFE_GAP = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 16 : 20;
const HORIZONTAL_PADDING = 20;
const FONT_REGULAR = '400' as const;
const FONT_MEDIUM = '500' as const;
const FONT_SEMIBOLD = '600' as const;
const PULL_MAX = 178;
const PULL_RELEASE = 34;
const DOUBLE_TAP_DELAY = 300;
const EDGE_BACK_WIDTH = 28;
const TODO_SWIPE_OPEN_DISTANCE = 62;
const LIST_MENU_HEIGHT_RATIO = 0.5;
const LIST_MENU_BOTTOM_OFFSET = 24;
const MENU_DISMISS_RELEASE = 52;
const MENU_DISMISS_VELOCITY = 680;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const MISSING_GOOGLE_CLIENT_ID = 'missing-google-client-id.apps.googleusercontent.com';
const LIST_MENU_ROW_HEIGHT = 52;
const LIST_MENU_ICON_HIT_SLOP = 14;
const PRESET_SWIPE_DELETE_WIDTH = 72;
const PRIORITY_MENU_ITEMS = ['High', 'Medium', 'Low', 'None'];
const DATE_MENU_ITEMS = ['Today', 'Tomorrow', 'This week', 'Next week', 'Someday'];
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
  [...nodes].sort((first, second) => first.label.localeCompare(second.label));

const collectListNodeLabels = (node: ListMenuNode): string[] => [node.label];

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

const todoMatchesFilters = (todo: Todo, filters: SelectedFilters) =>
  (Object.entries(filters) as Array<[FilterKey, string[]]>).every(([filterKey, values]) => (
    values.length === 0 ||
    values.some((value) => todo.filters[filterKey].includes(value))
  ));

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

const getTodoGroup = (
  todo: Todo,
  groupMode: Exclude<TodoGroupMode, 'none'>,
  orderedListLabels: string[],
) => {
  if (groupMode === 'status') {
    return {
      label: todo.done ? 'Done' : 'Active',
      rank: todo.done ? 1 : 0,
    };
  }

  if (groupMode === 'list') {
    const label = getBestOrderedFilterLabel(todo.filters.list, orderedListLabels, 'No list');
    const rank = orderedListLabels.indexOf(label);

    return {
      label,
      rank: rank >= 0 ? rank : orderedListLabels.length + 1,
    };
  }

  if (groupMode === 'priority') {
    const label = getBestOrderedFilterLabel(todo.filters.priority, PRIORITY_MENU_ITEMS, 'No priority');
    const rank = PRIORITY_MENU_ITEMS.indexOf(label);

    return {
      label,
      rank: rank >= 0 ? rank : PRIORITY_MENU_ITEMS.length + 1,
    };
  }

  const label = getBestOrderedFilterLabel(todo.filters.date, DATE_MENU_ITEMS, 'No date');
  const rank = DATE_MENU_ITEMS.indexOf(label);

  return {
    label,
    rank: rank >= 0 ? rank : DATE_MENU_ITEMS.length + 1,
  };
};

const buildTodoListRows = (
  todos: Todo[],
  groupMode: TodoGroupMode,
  orderedListLabels: string[],
  collapsedGroupIds: ReadonlySet<string>,
): TodoListRow[] => {
  if (groupMode === 'none') {
    return todos.map((todo) => ({
      id: todo.id,
      todo,
      type: 'todo',
    }));
  }

  const groups = new Map<string, { label: string; rank: number; todos: Todo[] }>();

  todos.forEach((todo) => {
    const group = getTodoGroup(todo, groupMode, orderedListLabels);
    const existingGroup = groups.get(group.label);

    if (existingGroup) {
      existingGroup.todos.push(todo);
      return;
    }

    groups.set(group.label, {
      label: group.label,
      rank: group.rank,
      todos: [todo],
    });
  });

  return [...groups.values()]
    .sort((first, second) => first.rank - second.rank || first.label.localeCompare(second.label))
    .flatMap((group) => {
      const groupId = `group-${groupMode}-${group.label}`;
      const isCollapsed = collapsedGroupIds.has(groupId);

      return [
        {
          count: group.todos.length,
          id: groupId,
          label: group.label,
          type: 'group' as const,
        },
        ...(isCollapsed
          ? []
          : group.todos.map((todo) => ({
              id: todo.id,
              todo,
              type: 'todo' as const,
            }))),
      ];
    });
};

function SwipeTodoItem({
  filterColors,
  item,
  isMenuTarget,
  onDelete,
  onListTap,
  onOpenMenu,
  onSetDone,
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

  return (
    <View style={styles.swipeShell}>
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
            todoColorTheme && !item.done && {
              backgroundColor: todoColorTheme.tint,
              borderColor: todoColorTheme.border,
              shadowColor: todoColorTheme.accent,
            },
            item.done && styles.todoRowDone,
            isHighlightedForMenu && styles.todoRowMenuTarget,
          ]}
        >
          {todoColorTheme ? (
            <View
              style={[
                styles.todoColorRail,
                { backgroundColor: todoColorTheme.accent },
                item.done && styles.todoColorRailDone,
              ]}
            />
          ) : null}
          <GHTouchableOpacity
            accessibilityRole="button"
            activeOpacity={1}
            onPress={handleTodoPress}
            style={styles.todoTextPressable}
          >
            <Text
              numberOfLines={3}
              style={[styles.todoText, item.done && styles.todoTextDone]}
            >
              {item.text}
            </Text>
            {todoColorDots.length > 0 ? (
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
  const { height: windowHeight } = useWindowDimensions();
  const listMenuHeight = Math.round(windowHeight * LIST_MENU_HEIGHT_RATIO);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
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
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<SelectedFilters>(
    EMPTY_SELECTED_FILTERS,
  );
  const [isListAtTop, setIsListAtTop] = useState(true);
  const searchInputRef = useRef<TextInput>(null);
  const presetSaveInputRef = useRef<TextInput>(null);
  const todoListRef = useRef<FlatList<TodoListRow> | null>(null);
  const scrollOffsetY = useRef(0);
  const hapticPullStage = useRef(0);
  const pullDistanceRef = useRef(0);
  const menuPullAnim = useRef(new Animated.Value(0)).current;
  const menuDismissPullRef = useRef(0);
  const menuDismissHapticRef = useRef(0);
  const listTouchStartRef = useRef({ pageX: 0, pageY: 0, timestamp: 0 });
  const lastListTapRef = useRef({ pageX: 0, pageY: 0, timestamp: 0 });
  const lastRegisteredListTapRef = useRef({ pageX: 0, pageY: 0, timestamp: 0 });
  const listMenuOpen = menuMode !== null;
  const submenuOpen = menuMode !== null && menuMode !== 'main';
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
    if (!listMenuOpen) {
      menuPullAnim.stopAnimation();
      menuPullAnim.setValue(0);
      menuDismissPullRef.current = 0;
      menuDismissHapticRef.current = 0;
    }
  }, [listMenuOpen, menuPullAnim]);

  const closeListMenu = useCallback(() => {
    setMenuMode(null);
    setActiveTodoMenuId(null);
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

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

  const animateMenuDismissClose = useCallback(() => {
    Animated.timing(menuPullAnim, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
      toValue: listMenuHeight * 0.42 + 56,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        menuPullAnim.setValue(0);
        resetMenuDismissPull();
        closeListMenu();
      }
    });
  }, [closeListMenu, listMenuHeight, menuPullAnim, resetMenuDismissPull]);

  const handleMenuDismissGesture = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      const { translationX, translationY } = event.nativeEvent;

      if (translationY <= 0 || Math.abs(translationY) <= Math.abs(translationX)) {
        menuPullAnim.setValue(0);
        menuDismissPullRef.current = 0;
        return;
      }

      const damped = dampMenuPullDistance(translationY);
      menuDismissPullRef.current = damped;
      menuPullAnim.setValue(damped);

      if (damped > MENU_DISMISS_RELEASE && menuDismissHapticRef.current === 0) {
        menuDismissHapticRef.current = 1;
        Haptics.selectionAsync().catch(() => undefined);
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
    [animateMenuDismissClose, animateMenuDismissReset],
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
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const closePresetSaveModal = useCallback(() => {
    Keyboard.dismiss();
    setPresetSaveModalVisible(false);
    setPresetSaveName('');
  }, []);

  const goBackInMenu = useCallback(() => {
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
    closeListMenu,
    closePresetSaveModal,
    closeSettingsModal,
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
      .filter((todo) => todoMatchesFilters(todo, selectedFilters));
  }, [query, searchIndex, selectedFilters, todos]);

  const addTodo = useCallback(() => {
    const text = query.trim().replace(/\s+/g, ' ');

    if (!text) {
      return;
    }

    const exists = todos.some(
      (todo) => normalizeTodoText(todo.text) === normalizeTodoText(text),
    );
    if (exists) {
      Keyboard.dismiss();
      return;
    }

    setTodos((current) => [makeTodo(text), ...current]);
    setQuery('');
  }, [query, todos]);

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

  const resetPull = useCallback(() => {
    pullDistanceRef.current = 0;
    hapticPullStage.current = 0;
  }, []);

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

  const releasePull = useCallback(() => {
    if (pullDistanceRef.current > PULL_RELEASE) {
      searchInputRef.current?.focus();
    }

    resetPull();
  }, [resetPull]);

  const handleTopPullGesture = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      const { translationX, translationY } = event.nativeEvent;

      if (
        !isListAtTop ||
        translationY <= 0 ||
        Math.abs(translationY) <= Math.abs(translationX)
      ) {
        return;
      }

      pullDistanceRef.current = Math.max(0, Math.min(PULL_MAX, translationY));

      if (translationY > PULL_RELEASE && hapticPullStage.current === 0) {
        hapticPullStage.current = 1;
        Haptics.selectionAsync().catch(() => undefined);
      }
    },
    [isListAtTop],
  );

  const handleTopPullStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state } = event.nativeEvent;

      if (
        state === State.END ||
        state === State.CANCELLED ||
        state === State.FAILED
      ) {
        releasePull();
      }
    },
    [releasePull],
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
      setIsListAtTop(offsetY <= 1);
    },
    [],
  );

  const orderedListMenuTree = useMemo(
    () => (listOrderMode === 'alphabetical' ? sortListMenuTree(listMenuTree) : listMenuTree),
    [listMenuTree, listOrderMode],
  );
  const visibleListMenuItems = useMemo(
    () =>
      orderedListMenuTree.map((node) => ({
        id: node.label,
        label: node.label,
      })),
    [orderedListMenuTree],
  );
  const orderedListLabels = useMemo(
    () => orderedListMenuTree.flatMap(collectListNodeLabels),
    [orderedListMenuTree],
  );
  const settingsListColorLabels = useMemo(
    () => Array.from(new Set(listMenuTree.flatMap(collectListNodeLabels))),
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
  const sortedTodos = useMemo(
    () => [...filteredTodos].sort((first, second) => compareTodosBySortMode(first, second, todoSortMode)),
    [filteredTodos, todoSortMode],
  );
  const todoListRows = useMemo(
    () => buildTodoListRows(sortedTodos, todoGroupMode, orderedListLabels, collapsedTodoGroupIds),
    [collapsedTodoGroupIds, orderedListLabels, sortedTodos, todoGroupMode],
  );
  const activeTodoMenuFilters = useMemo(
    () => todos.find((todo) => todo.id === activeTodoMenuId)?.filters ?? null,
    [activeTodoMenuId, todos],
  );
  const menuFilters = activeTodoMenuFilters ?? selectedFilters;
  const activeFilterCount = countFilters(menuFilters);
  const latestMenuPreset = menuPresets[menuPresets.length - 1] ?? null;
  const currentPresetSummary = formatPresetSummary(
    menuFilters,
    todoSortMode,
    todoGroupMode,
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
        valueLabel: TODO_SORT_LABELS[todoSortMode],
      },
      {
        id: 'main-group',
        label: 'Group',
        menuMode: 'group',
        type: 'menu',
        valueLabel:
          todoGroupMode !== 'none' ? TODO_GROUP_LABELS[todoGroupMode] : undefined,
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
    todoGroupMode,
    todoSortMode,
    visibleListMenuItems,
  ]);

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
    setTodoSortMode(sortMode);
    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, []);

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
    setTodoGroupMode(groupMode);
    requestAnimationFrame(() => Haptics.selectionAsync().catch(() => undefined));
  }, []);

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
      selectTodoSortMode('newest');
      return;
    }

    if (section === 'group') {
      selectTodoGroupMode('none');
    }
  }, [activeTodoMenuId, clearFilters, selectTodoGroupMode, selectTodoSortMode, updateTodoFilters]);

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

  const removeSettingsList = useCallback((index: number) => {
    setListMenuTree((current) => {
      const node = current[index];
      if (!node) {
        return current;
      }

      const removedLabels = new Set(collectListNodeLabels(node));
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

  const scrollTodoAboveMenu = useCallback((id: string) => {
    const index = todoListRows.findIndex((row) => row.type === 'todo' && row.todo.id === id);

    if (index < 0) {
      return;
    }

    todoListRef.current?.scrollToIndex({
      animated: true,
      index,
      viewOffset: 12,
      viewPosition: 0.34,
    });
  }, [todoListRows]);

  const handleTodoListScrollToIndexFailed = useCallback((info: ScrollToIndexFailedInfo) => {
    todoListRef.current?.scrollToOffset({
      animated: true,
      offset: Math.max(0, info.averageItemLength * info.index),
    });

    setTimeout(() => {
      todoListRef.current?.scrollToIndex({
        animated: true,
        index: info.index,
        viewOffset: 12,
        viewPosition: 0.34,
      });
    }, 100);
  }, []);

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
      if (item.type === 'group') {
        const isCollapsed = collapsedTodoGroupIds.has(item.id);

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: !isCollapsed }}
            accessibilityLabel={`${item.label}, ${item.count} items`}
            onPress={() => toggleTodoGroupCollapsed(item.id)}
            style={({ pressed }) => [
              styles.todoGroupHeader,
              pressed && styles.todoGroupHeaderPressed,
            ]}
          >
            <View style={styles.todoGroupHeaderMain}>
              <Text
                style={[
                  styles.todoGroupChevron,
                  !isCollapsed && styles.todoGroupChevronExpanded,
                ]}
              >
                ›
              </Text>
              <Text style={styles.todoGroupTitle}>{item.label}</Text>
            </View>
            <Text style={styles.todoGroupCount}>{item.count}</Text>
          </Pressable>
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.screen}
        >
        <View style={styles.topBar}>
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              ref={searchInputRef}
              autoCapitalize="sentences"
              autoCorrect
              clearButtonMode="while-editing"
              onChangeText={setQuery}
              onSubmitEditing={addTodo}
              placeholder="Search or add a todo…"
              placeholderTextColor="#A9A19A"
              returnKeyType="done"
              selectionColor="#2F6F62"
              style={styles.searchInput}
              value={query}
            />
            {query.trim().length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add todo"
                hitSlop={10}
                onPress={addTodo}
                style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
              >
                <Text style={styles.addButtonText}>+</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.listShell}>
          {listMenuOpen ? (
            <>
              <PanGestureHandler
                activeOffsetY={[8, 10000]}
                enabled={listMenuOpen}
                failOffsetX={[-36, 36]}
                onGestureEvent={handleMenuDismissGesture}
                onHandlerStateChange={handleMenuDismissStateChange}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close lists menu"
                  onPress={closeListMenu}
                  style={styles.listMenuBackdrop}
                />
              </PanGestureHandler>
              <View pointerEvents="box-none" style={styles.listMenuLayer}>
                <PanGestureHandler
                  activeOffsetY={[8, 10000]}
                  enabled={listMenuOpen}
                  failOffsetX={[-36, 36]}
                  onGestureEvent={handleMenuDismissGesture}
                  onHandlerStateChange={handleMenuDismissStateChange}
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
                      data={bottomMenuItems}
                      decelerationRate="fast"
                      directionalLockEnabled
                      getItemLayout={(_, index) => ({
                        length: LIST_MENU_ROW_HEIGHT,
                        offset: LIST_MENU_ROW_HEIGHT * index,
                        index,
                      })}
                      keyExtractor={(item) => item.id}
                      keyboardShouldPersistTaps="handled"
                      ListEmptyComponent={
                        <View style={styles.menuEmptyState}>
                          <Text style={styles.menuEmptyText}>No active filters</Text>
                        </View>
                      }
                      nestedScrollEnabled
                      overScrollMode="never"
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
                            const isSelected = todoSortMode === item.sortMode;

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
	                            const isSelected = todoGroupMode === item.groupMode;

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
	                              todoSortMode,
	                              todoGroupMode,
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
                                onPress={() => toggleFilterValue(item.filterKey, item.label)}
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

                        const isSelected = menuFilters.list.includes(item.label);
                        const listColorTheme = getFilterColorTheme(filterColors, 'list', item.label);

                        return (
                          <View
                            style={[
                              styles.listMenuRow,
                              isSelected && styles.listMenuRowSelected,
                              isSelected && {
                                backgroundColor: listColorTheme.tint,
                                borderBottomColor: listColorTheme.border,
                              },
                            ]}
                          >
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => {
                                toggleFilterValue('list', item.label);
                              }}
                              style={({ pressed }) => [
                                styles.listMenuRowMainPress,
                                pressed && styles.listMenuRowPressed,
                              ]}
                            >
                              <View style={styles.listMenuRowTextWrap}>
                                <View
                                  style={[
                                    styles.listMenuColorDot,
                                    { backgroundColor: listColorTheme.accent },
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
                                onPress={() => removeFilter('list', item.label)}
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
            <PanGestureHandler
              activeOffsetY={8}
              enabled={isListAtTop && !listMenuOpen}
              failOffsetX={[-24, 24]}
              onGestureEvent={handleTopPullGesture}
              onHandlerStateChange={handleTopPullStateChange}
            >
              <View
                collapsable={false}
                style={styles.todoListFrame}
              >
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
                          ? 'Press return to add this as a new todo.'
                          : 'Type above and press return to create one.'}
                      </Text>
                    </View>
                  }
                  onScroll={handleListScroll}
                  onScrollEndDrag={releasePull}
                  onScrollToIndexFailed={handleTodoListScrollToIndexFailed}
                  renderItem={renderTodoItem}
                  scrollEventThrottle={16}
                  showsVerticalScrollIndicator={false}
                />
              </View>
            </PanGestureHandler>
          </View>
        </View>
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
                        <View key={`${item.label}-${index}`} style={styles.settingsListEditRow}>
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
                          </View>
                          <View style={styles.settingsListActions}>
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
        </KeyboardAvoidingView>
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
    backgroundColor: '#F8F6F2',
  },
  screen: {
    flex: 1,
    backgroundColor: '#F8F6F2',
  },
  settingsModal: {
    flex: 1,
    backgroundColor: '#F8F6F2',
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
    color: '#1E1B18',
    fontSize: 18,
    fontWeight: FONT_SEMIBOLD,
    lineHeight: 24,
  },
  presetSaveModalMessage: {
    color: '#8C847C',
    fontSize: 14,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
    marginTop: 6,
  },
  presetSaveModalInput: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: '#F8F6F2',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E2DA',
    color: '#1E1B18',
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
    backgroundColor: '#F8F6F2',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E2DA',
  },
  presetSaveModalButtonPrimary: {
    backgroundColor: '#2F6F62',
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
    color: '#1E1B18',
    fontSize: 24,
    fontWeight: FONT_SEMIBOLD,
    lineHeight: 30,
    letterSpacing: 0,
  },
  settingsSubtitle: {
    color: '#8C847C',
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
    color: '#1E1B18',
    fontSize: 16,
    fontWeight: FONT_MEDIUM,
    lineHeight: 21,
    letterSpacing: 0.1,
  },
  settingsSectionSubtitle: {
    color: '#8C847C',
    fontSize: 13,
    fontWeight: FONT_REGULAR,
    lineHeight: 18,
    letterSpacing: 0.1,
    marginTop: 3,
  },
  settingsSectionChevron: {
    color: '#8C847C',
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
    color: '#8C847C',
    fontSize: 14,
    fontWeight: FONT_MEDIUM,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  settingsSegmentButtonTextSelected: {
    color: '#1E1B18',
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
    backgroundColor: '#F8F6F2',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E2DA',
    color: '#1E1B18',
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
    backgroundColor: '#2F6F62',
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
  settingsListEditRow: {
    minHeight: 56,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F2EBE3',
    flexDirection: 'row',
    paddingVertical: 8,
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
    color: '#1E1B18',
    fontSize: 15,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  settingsListSubtitle: {
    color: '#8C847C',
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
    color: '#8C847C',
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
    color: '#1E1B18',
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
    color: '#1E1B18',
    fontSize: 16,
    fontWeight: FONT_MEDIUM,
    lineHeight: 21,
    letterSpacing: 0.1,
  },
  settingsRowSubtitle: {
    color: '#8C847C',
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
    backgroundColor: '#EDF4F0',
  },
  settingsStatusText: {
    color: '#8C847C',
    fontSize: 12,
    fontWeight: FONT_MEDIUM,
    lineHeight: 16,
    letterSpacing: 0.1,
  },
  settingsStatusTextEnabled: {
    color: '#1C5A4E',
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
    color: '#2F6F62',
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
    backgroundColor: '#2F6F62',
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
    color: '#8C847C',
    fontSize: 13,
    fontWeight: FONT_REGULAR,
    lineHeight: 18,
    letterSpacing: 0.1,
    marginTop: 12,
  },
  topBar: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: TOP_SAFE_GAP,
    paddingBottom: 16,
  },
  searchBox: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E2DA',
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 14,
    shadowColor: '#3D3428',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  searchIcon: {
    fontSize: 18,
    color: '#B5ADA5',
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#1E1B18',
    fontSize: 15,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
    paddingVertical: 14,
    letterSpacing: 0.1,
  },
  listShell: {
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
    color: '#2F6F62',
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
    backgroundColor: '#EDF4F0',
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
    color: '#8C847C',
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
    color: '#8C847C',
    fontSize: 12,
    fontWeight: FONT_REGULAR,
    lineHeight: 16,
    letterSpacing: 0.1,
    marginTop: 2,
  },
  listMenuApplyText: {
    color: '#2F6F62',
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
    color: '#1C5A4E',
    fontSize: 16,
    fontWeight: FONT_MEDIUM,
    lineHeight: 20,
    marginLeft: 12,
  },
  listMenuInlineCheck: {
    color: '#1C5A4E',
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
    backgroundColor: '#EDF4F0',
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
    backgroundColor: '#EDF4F0',
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
    color: '#1C5A4E',
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
    color: '#2F6F62',
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
    backgroundColor: '#2F6F62',
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
    paddingTop: 4,
    gap: 8,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  todoGroupHeader: {
    minHeight: 30,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  todoGroupHeaderPressed: {
    opacity: 0.72,
  },
  todoGroupHeaderMain: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 4,
  },
  todoGroupChevron: {
    color: '#A9A19A',
    fontSize: 18,
    fontWeight: FONT_REGULAR,
    lineHeight: 18,
    width: 14,
  },
  todoGroupChevronExpanded: {
    transform: [{ rotate: '90deg' }],
  },
  todoGroupTitle: {
    color: '#706860',
    fontSize: 12,
    fontWeight: FONT_SEMIBOLD,
    lineHeight: 16,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  todoGroupCount: {
    color: '#A9A19A',
    fontSize: 12,
    fontWeight: FONT_MEDIUM,
    lineHeight: 16,
    letterSpacing: 0.1,
  },
  swipeShell: {
    minHeight: 60,
    borderRadius: 14,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  todoSwipeableContainer: {
    minHeight: 60,
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
    backgroundColor: '#2F6F62',
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
    minHeight: 60,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E2DA',
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: '#3D3428',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  todoTextPressable: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  todoRowDone: {
    backgroundColor: '#FAF9F6',
    borderColor: '#EEEAE4',
  },
  todoRowMenuTarget: {
    backgroundColor: '#FFF7E5',
    borderWidth: 1,
    borderColor: '#E4BE63',
    shadowColor: '#D89328',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 3,
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
    color: '#1E1B18',
    fontSize: 15,
    fontWeight: FONT_REGULAR,
    lineHeight: 22,
    letterSpacing: 0.1,
  },
  todoTextDone: {
    color: '#A9A19A',
    textDecorationLine: 'line-through',
    textDecorationColor: '#C4BCB3',
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
    color: '#8C847C',
    fontSize: 14,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
});
