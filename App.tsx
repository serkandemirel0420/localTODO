import * as Haptics from 'expo-haptics';
import { TokenResponse } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
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
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
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
  appSettingsStore,
  type AppSettings,
} from './src/storage/appSettingsStore';

WebBrowser.maybeCompleteAuthSession();

type SwipeTodoItemProps = {
  item: Todo;
  isMenuTarget: boolean;
  onDelete: (id: string) => void;
  onListTap: (event: GestureResponderEvent) => boolean;
  onOpenMenu: (id: string) => void;
  onSetDone: (id: string, done: boolean) => void;
};

type ListMenuNode = {
  label: string;
  children?: ListMenuNode[];
};

type VisibleListMenuItem = {
  childCount: number;
  depth: number;
  hasChildren: boolean;
  id: string;
  label: string;
  path: string;
};

type BottomMenuItem = MenuRow | VisibleListMenuItem;

type FilterKey = 'list' | 'date' | 'priority';

type MenuMode = 'date' | 'filters' | 'lists' | 'main' | 'priority';

type SelectedFilters = TodoFilters;

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
      count?: number;
      id: string;
      label: string;
      menuMode: MenuMode;
      type: 'menu';
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
const LIST_MENU_HEIGHT = 280;
const LIST_MENU_BOTTOM_OFFSET = 24;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const MISSING_GOOGLE_CLIENT_ID = 'missing-google-client-id.apps.googleusercontent.com';
const LIST_MENU_TREE: ListMenuNode[] = [
  { label: 'Inbox', children: [{ label: 'Quick capture' }, { label: 'Unsorted' }] },
  { label: 'Today', children: [{ label: 'Morning' }, { label: 'Afternoon' }, { label: 'Evening' }] },
  { label: 'Upcoming' },
  { label: 'Priority', children: [{ label: 'High' }, { label: 'Medium' }, { label: 'Low' }] },
  { label: 'Work', children: [{ label: 'Meetings' }, { label: 'Follow ups' }, { label: 'Deep work' }] },
  { label: 'Personal' },
  { label: 'Home', children: [{ label: 'Cleaning' }, { label: 'Repairs' }] },
  { label: 'Errands' },
  { label: 'Shopping', children: [{ label: 'Groceries' }, { label: 'Household' }] },
  { label: 'Ideas' },
  { label: 'Reading' },
  { label: 'Calls' },
  { label: 'Waiting' },
  { label: 'Someday' },
  { label: 'Projects', children: [{ label: 'Planning' }, { label: 'Active' }, { label: 'Backlog' }] },
  { label: 'Health' },
  { label: 'Finance', children: [{ label: 'Bills' }, { label: 'Budget' }] },
  { label: 'Travel' },
  { label: 'Archive' },
];
const LIST_MENU_ROW_HEIGHT = 52;
const PRIORITY_MENU_ITEMS = ['High', 'Medium', 'Low', 'None'];
const DATE_MENU_ITEMS = ['Today', 'Tomorrow', 'This week', 'Next week', 'Someday'];
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
  [...nodes]
    .sort((first, second) => first.label.localeCompare(second.label))
    .map((node) => ({
      ...node,
      children: node.children ? sortListMenuTree(node.children) : undefined,
    }));

const flattenListMenuItems = (
  nodes: ListMenuNode[],
  expandedPaths: Set<string>,
  parentPath = '',
  depth = 0,
): VisibleListMenuItem[] =>
  nodes.flatMap((node) => {
    const path = parentPath ? `${parentPath}/${node.label}` : node.label;
    const hasChildren = Boolean(node.children?.length);
    const row = {
      childCount: node.children?.length ?? 0,
      depth,
      hasChildren,
      id: path,
      label: node.label,
      path,
    };

    if (!hasChildren || !expandedPaths.has(path)) {
      return [row];
    }

    return [
      row,
      ...flattenListMenuItems(node.children ?? [], expandedPaths, path, depth + 1),
    ];
  });

const countFilters = (filters: SelectedFilters) =>
  filters.date.length + filters.list.length + filters.priority.length;

const todoMatchesFilters = (todo: Todo, filters: SelectedFilters) =>
  (Object.entries(filters) as Array<[FilterKey, string[]]>).every(([filterKey, values]) => (
    values.length === 0 ||
    values.some((value) => todo.filters[filterKey].includes(value))
  ));

function SwipeTodoItem({
  item,
  isMenuTarget,
  onDelete,
  onListTap,
  onOpenMenu,
  onSetDone,
}: SwipeTodoItemProps) {
  const swipeableRef = useRef<Swipeable | null>(null);
  const [isSwipeOpen, setIsSwipeOpen] = useState(false);

  const closeActionMenu = useCallback(() => {
    swipeableRef.current?.close();
    setIsSwipeOpen(false);
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
    requestAnimationFrame(() => {
      closeActionMenu();
    });
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

  const handleSwipeableWillOpen = useCallback(() => {
    setIsSwipeOpen(true);
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const handleSwipeableClose = useCallback(() => {
    setIsSwipeOpen(false);
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
          accessibilityLabel="Open filters"
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

  return (
    <View style={styles.swipeShell}>
      <Swipeable
        ref={swipeableRef}
        childrenContainerStyle={styles.todoSwipeableChildren}
        containerStyle={styles.todoSwipeableContainer}
        friction={1.1}
        leftThreshold={TODO_SWIPE_OPEN_DISTANCE}
        onSwipeableClose={handleSwipeableClose}
        onSwipeableWillOpen={handleSwipeableWillOpen}
        overshootLeft={false}
        overshootRight={false}
        renderLeftActions={renderLeftActions}
        renderRightActions={renderRightActions}
        rightThreshold={TODO_SWIPE_OPEN_DISTANCE}
      >
        <View
          style={[
            styles.todoRow,
            item.done && styles.todoRowDone,
            isMenuTarget && styles.todoRowMenuTarget,
          ]}
        >
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
          </GHTouchableOpacity>
        </View>
      </Swipeable>
    </View>
  );
}

const MemoizedSwipeTodoItem = React.memo(SwipeTodoItem);

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [menuMode, setMenuMode] = useState<MenuMode | null>(null);
  const [activeTodoMenuId, setActiveTodoMenuId] = useState<string | null>(null);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [googleDriveBackupEnabled, setGoogleDriveBackupEnabled] = useState(false);
  const [googleDriveBusy, setGoogleDriveBusy] = useState(false);
  const [googleDriveBackupStatus, setGoogleDriveBackupStatus] = useState('Not backed up');
  const [googleDriveLastBackupAt, setGoogleDriveLastBackupAt] = useState<string | null>(null);
  const [googleDriveLastRestoreAt, setGoogleDriveLastRestoreAt] = useState<string | null>(null);
  const [googleAuth, setGoogleAuth] = useState<StoredGoogleAuth | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<SelectedFilters>(
    EMPTY_SELECTED_FILTERS,
  );
  const [isListAtTop, setIsListAtTop] = useState(true);
  const [expandedListMenuPaths, setExpandedListMenuPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const searchInputRef = useRef<TextInput>(null);
  const todoListRef = useRef<FlatList<Todo> | null>(null);
  const scrollOffsetY = useRef(0);
  const hapticPullStage = useRef(0);
  const pullDistanceRef = useRef(0);
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
        setGoogleDriveBackupEnabled(settings.googleDriveBackupEnabled);
        setGoogleDriveLastBackupAt(settings.googleDriveLastBackupAt);
        setGoogleDriveLastRestoreAt(settings.googleDriveLastRestoreAt);

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
      googleDriveBackupEnabled,
      googleDriveLastBackupAt,
      googleDriveLastRestoreAt,
      selectedFilters,
    };

    appSettingsStore.save(settings).catch(() => undefined);
  }, [
    googleDriveBackupEnabled,
    googleDriveLastBackupAt,
    googleDriveLastRestoreAt,
    selectedFilters,
    settingsLoaded,
  ]);

  useEffect(() => {
    if (menuMode === null) {
      setActiveTodoMenuId(null);
    }
  }, [menuMode]);

  const closeSettingsModal = useCallback(() => {
    setSettingsModalVisible(false);
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const goBackInMenu = useCallback(() => {
    if (settingsModalVisible) {
      closeSettingsModal();
      return true;
    }

    if (submenuOpen) {
      setMenuMode('main');
      Haptics.selectionAsync().catch(() => undefined);
      return true;
    }

    if (menuMode === 'main') {
      setMenuMode(null);
      Haptics.selectionAsync().catch(() => undefined);
      return true;
    }

    return false;
  }, [closeSettingsModal, menuMode, settingsModalVisible, submenuOpen]);

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
        listMenuOpen ||
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
    [isListAtTop, listMenuOpen],
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
        (Math.abs(translationX) > 64 || Math.abs(velocityX) > 650)
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

  const sortedListMenuTree = useMemo(() => sortListMenuTree(LIST_MENU_TREE), []);
  const visibleListMenuItems = useMemo(
    () => flattenListMenuItems(sortedListMenuTree, expandedListMenuPaths),
    [expandedListMenuPaths, sortedListMenuTree],
  );
  const activeTodoMenuFilters = useMemo(
    () => todos.find((todo) => todo.id === activeTodoMenuId)?.filters ?? null,
    [activeTodoMenuId, todos],
  );
  const menuFilters = activeTodoMenuFilters ?? selectedFilters;
  const activeFilterCount = countFilters(menuFilters);
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
        count: menuFilters.date.length || undefined,
        id: 'main-date',
        label: 'Date',
        menuMode: 'date',
        type: 'menu',
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
    ];
  }, [activeFilterCount, menuFilters, menuMode, visibleListMenuItems]);

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

  const openSettingsModal = useCallback(() => {
    Keyboard.dismiss();
    setMenuMode(null);
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
      GoogleSignin.configure();
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
      googleDriveBackupEnabled,
      googleDriveLastBackupAt,
      googleDriveLastRestoreAt,
      selectedFilters,
    });
    await uploadDriveBackup(accessToken, payload);
    setGoogleDriveLastBackupAt(payload.exportedAt);
    setGoogleDriveBackupStatus(`Backed up ${todos.length} items · ${formatBackupTime(payload.exportedAt)}`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, [
    googleDriveBackupEnabled,
    googleDriveLastBackupAt,
    googleDriveLastRestoreAt,
    selectedFilters,
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
    setGoogleDriveBackupEnabled(backup.payload.settings.googleDriveBackupEnabled);
    setGoogleDriveLastBackupAt(backup.payload.settings.googleDriveLastBackupAt);
    setGoogleDriveLastRestoreAt(restoredAt);
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
    const index = filteredTodos.findIndex((todo) => todo.id === id);

    if (index < 0) {
      return;
    }

    todoListRef.current?.scrollToIndex({
      animated: true,
      index,
      viewOffset: 12,
      viewPosition: 0.34,
    });
  }, [filteredTodos]);

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
    ({ item }: { item: Todo }) => (
      <MemoizedSwipeTodoItem
        item={item}
        isMenuTarget={menuMode !== null && activeTodoMenuId === item.id}
        onDelete={deleteTodo}
        onListTap={handleListTap}
        onOpenMenu={openMenuForTodoAction}
        onSetDone={setTodoDone}
      />
    ),
    [
      deleteTodo,
      handleListTap,
      activeTodoMenuId,
      menuMode,
      openMenuForTodoAction,
      setTodoDone,
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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close lists menu"
                onPress={() => setMenuMode(null)}
                style={styles.listMenuBackdrop}
              />
              <View pointerEvents="box-none" style={styles.listMenuLayer}>
                <PanGestureHandler
                  activeOffsetX={32}
                  enabled={menuMode !== null && menuMode !== 'main'}
                  failOffsetY={[-18, 18]}
                  onHandlerStateChange={handleMenuBackStateChange}
                >
                  <View collapsable={false} style={styles.listMenu}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={submenuOpen ? 'Back to main filter menu' : 'Close filter menu'}
                      onPress={() => {
                        if (submenuOpen) {
                          goBackInMenu();
                        } else {
                          setMenuMode(null);
                          Haptics.selectionAsync().catch(() => undefined);
                        }
                      }}
                      style={({ pressed }) => [
                        styles.listMenuBackButton,
                        pressed && styles.listMenuRowPressed,
                      ]}
                    >
                      <Text style={styles.listMenuBackIcon}>{submenuOpen ? '‹' : '×'}</Text>
                      <Text style={styles.listMenuBackText}>{submenuOpen ? 'Back' : 'Close'}</Text>
                    </Pressable>
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

                          if (item.type === 'filter') {
                            return (
                              <Pressable
                                accessibilityRole="button"
                                onPress={() => removeFilter(item.filterKey, item.label)}
                                style={({ pressed }) => [
                                  styles.listMenuRow,
                                  pressed && styles.listMenuRowPressed,
                                ]}
                              >
                                <View style={styles.listMenuRowTextWrap}>
                                  <Text style={styles.listMenuRowTitle}>{item.label}</Text>
                                </View>
                                <Text style={styles.filterTypeText}>{item.filterKey}</Text>
                              </Pressable>
                            );
                          }

                          if (item.type === 'menu') {
                            return (
                              <Pressable
                                accessibilityRole="button"
                                onPress={() => setMenuMode(item.menuMode)}
                                style={({ pressed }) => [
                                  styles.listMenuRow,
                                  pressed && styles.listMenuRowPressed,
                                ]}
                              >
                                <View style={styles.listMenuRowTextWrap}>
                                  <Text style={styles.listMenuRowTitle}>{item.label}</Text>
                                </View>
                                <View style={styles.listMenuSubmenuZone}>
                                  {item.count ? (
                                    <Text style={styles.listMenuChildCount}>{item.count}</Text>
                                  ) : null}
                                  <Text style={styles.listMenuArrow}>›</Text>
                                </View>
                              </Pressable>
                            );
                          }

                          const isSelected = menuFilters[item.filterKey].includes(item.label);

                          return (
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => toggleFilterValue(item.filterKey, item.label)}
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

                        const isExpanded = expandedListMenuPaths.has(item.path);
                        const isSelected = menuFilters.list.includes(item.label);
                        const toggleSubmenu = () => {
                          setExpandedListMenuPaths((current) => {
                            const next = new Set(current);
                            if (next.has(item.path)) {
                              next.delete(item.path);
                            } else {
                              next.add(item.path);
                            }

                            return next;
                          });
                          Haptics.selectionAsync().catch(() => undefined);
                        };

                        return (
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                              toggleFilterValue('list', item.label);
                            }}
                            style={({ pressed }) => [
                              styles.listMenuRow,
                              isSelected && styles.listMenuRowSelected,
                              pressed && !item.hasChildren && styles.listMenuRowPressed,
                            ]}
                          >
                            <View
                              style={[
                                styles.listMenuRowTextWrap,
                                item.depth > 0 && { marginLeft: item.depth * 18 },
                              ]}
                            >
                              <Text style={styles.listMenuRowTitle}>{item.label}</Text>
                            </View>
                            {item.hasChildren ? (
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} ${item.label}`}
                                hitSlop={{ top: 8, right: 4, bottom: 8, left: 0 }}
                                onPress={toggleSubmenu}
                                style={({ pressed }) => [
                                  styles.listMenuSubmenuZone,
                                  pressed && styles.listMenuArrowButtonPressed,
                                ]}
                              >
                                {isSelected ? <Text style={styles.listMenuInlineCheck}>✓</Text> : null}
                                <Text style={styles.listMenuChildCount}>{item.childCount}</Text>
                                <Text style={[styles.listMenuArrow, isExpanded && styles.listMenuArrowExpanded]}>
                                  ›
                                </Text>
                              </Pressable>
                            ) : isSelected ? (
                              <Text style={styles.listMenuCheck}>✓</Text>
                            ) : null}
                          </Pressable>
                        );
                      }}
                      showsVerticalScrollIndicator={false}
                      snapToAlignment="start"
                      snapToInterval={LIST_MENU_ROW_HEIGHT}
                    />
                    {menuMode === 'main' ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Open settings"
                        onPress={openSettingsModal}
                        style={({ pressed }) => [
                          styles.listMenuSettingsButton,
                          pressed && styles.listMenuRowPressed,
                        ]}
                      >
                        <View style={styles.listMenuRowTextWrap}>
                          <Text style={styles.listMenuSettingsTitle}>Settings</Text>
                        </View>
                        <Text style={styles.listMenuArrow}>›</Text>
                      </Pressable>
                    ) : null}
                  </View>
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
                    activeTodoMenuId !== null && listMenuOpen && styles.listContentMenuOpen,
                    filteredTodos.length === 0 && styles.emptyListContent,
                  ]}
                  data={filteredTodos}
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
                <Text style={styles.settingsSubtitle}>Backup</Text>
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

            <View style={styles.settingsBody}>
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>Google Drive</Text>
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
              </View>
            </View>
          </SafeAreaView>
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
  settingsHeader: {
    minHeight: 72,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E2DA',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: 8,
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
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: 22,
  },
  settingsSection: {
    width: '100%',
  },
  settingsSectionTitle: {
    color: '#8C847C',
    fontSize: 12,
    fontWeight: FONT_MEDIUM,
    lineHeight: 16,
    letterSpacing: 0.2,
    marginBottom: 10,
    textTransform: 'uppercase',
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
    height: LIST_MENU_HEIGHT,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E4DDD4',
    paddingHorizontal: 8,
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  listMenuBackButton: {
    minHeight: 42,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 6,
    paddingHorizontal: 12,
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
  listMenuSettingsButton: {
    minHeight: 50,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8E2DA',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 16,
  },
  listMenuSettingsTitle: {
    color: '#2A2520',
    fontSize: 15,
    fontWeight: FONT_MEDIUM,
    lineHeight: 20,
    letterSpacing: 0.1,
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
    width: '30%',
    minWidth: 86,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginLeft: 10,
    paddingRight: 2,
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
    marginRight: 10,
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
  listContentMenuOpen: {
    paddingBottom: LIST_MENU_HEIGHT + LIST_MENU_BOTTOM_OFFSET + 104,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
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
    backgroundColor: '#FFF8E7',
    borderColor: '#E4BE63',
    shadowOpacity: 0.07,
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
