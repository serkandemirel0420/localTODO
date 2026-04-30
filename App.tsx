import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  type GestureResponderEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
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
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';

import { createTodoSearchIndex, searchTodos } from './src/search/todoSearch';
import { localTodoStore } from './src/storage/todoStore';
import { makeTodo, normalizeTodoText, type Todo } from './src/todos';

type SwipeTodoItemProps = {
  gestureSettings: GestureSettings;
  item: Todo;
  onDelete: (id: string) => void;
  onOpenMenu: () => void;
  onToggle: (id: string) => void;
};

type GestureSettings = {
  drawerEdgeOffsetPercent: number;
  drawerTriggerWidthPercent: number;
  drawerVerticalCoveragePercent: number;
  todoSwipeAreaPercent: number;
  todoSwipeOpenDistance: number;
};

type SettingsSliderProps = {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  onSlidingChange?: (sliding: boolean) => void;
  step: number;
  suffix?: string;
  value: number;
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

type SelectedFilters = Record<FilterKey, string[]>;

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
const SWIPE_LIMIT = TODO_LEFT_ACTION_MENU_WIDTH;
const TOP_SAFE_GAP = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 16 : 20;
const HORIZONTAL_PADDING = 20;
const FONT_REGULAR = '400' as const;
const FONT_MEDIUM = '500' as const;
const FONT_SEMIBOLD = '600' as const;
const PULL_MAX = 178;
const PULL_RELEASE = 34;
const DOUBLE_TAP_DELAY = 300;
const EDGE_BACK_WIDTH = 28;
const LEFT_PANEL_MAX_WIDTH = 360;
const GESTURE_SETTINGS_STORAGE_KEY = 'local-todo.gesture-settings.v1';
const DEFAULT_GESTURE_SETTINGS: GestureSettings = {
  drawerEdgeOffsetPercent: 5,
  drawerTriggerWidthPercent: 10,
  drawerVerticalCoveragePercent: 35,
  todoSwipeAreaPercent: 60,
  todoSwipeOpenDistance: 62,
};
const PULL_STAGES = [
  { label: 'Focus search', threshold: 38 },
  { label: 'Menu', threshold: 88 },
  { label: 'Clear text', threshold: 136 },
] as const;
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
  { label: 'Settings' },
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
}));

const withInitialTodos = (storedTodos: Todo[]) => {
  const storedIds = new Set(storedTodos.map((todo) => todo.id));
  const missingSeeds = INITIAL_TODOS.filter((todo) => !storedIds.has(todo.id));

  return [...storedTodos, ...missingSeeds];
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const normalizeGestureSettings = (
  value: Partial<GestureSettings>,
): GestureSettings => ({
  drawerEdgeOffsetPercent: clamp(
    Number(value.drawerEdgeOffsetPercent ?? DEFAULT_GESTURE_SETTINGS.drawerEdgeOffsetPercent),
    0,
    20,
  ),
  drawerTriggerWidthPercent: clamp(
    Number(value.drawerTriggerWidthPercent ?? DEFAULT_GESTURE_SETTINGS.drawerTriggerWidthPercent),
    5,
    25,
  ),
  drawerVerticalCoveragePercent: clamp(
    Number(value.drawerVerticalCoveragePercent ?? DEFAULT_GESTURE_SETTINGS.drawerVerticalCoveragePercent),
    20,
    80,
  ),
  todoSwipeAreaPercent: clamp(
    Number(value.todoSwipeAreaPercent ?? DEFAULT_GESTURE_SETTINGS.todoSwipeAreaPercent),
    30,
    100,
  ),
  todoSwipeOpenDistance: clamp(
    Number(value.todoSwipeOpenDistance ?? DEFAULT_GESTURE_SETTINGS.todoSwipeOpenDistance),
    28,
    120,
  ),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

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

function SettingsSlider({
  label,
  max,
  min,
  onChange,
  onSlidingChange,
  step,
  suffix = '',
  value,
}: SettingsSliderProps) {
  const [trackWidth, setTrackWidth] = useState(1);
  const valueRange = max - min;
  const progress = valueRange <= 0 ? 0 : (value - min) / valueRange;

  const updateFromX = useCallback(
    (locationX: number) => {
      const rawValue = min + clamp(locationX / trackWidth, 0, 1) * valueRange;
      const steppedValue = Math.round(rawValue / step) * step;
      onChange(clamp(steppedValue, min, max));
    },
    [max, min, onChange, step, trackWidth, valueRange],
  );

  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
      onPanResponderGrant: (event) => {
        onSlidingChange?.(true);
        updateFromX(event.nativeEvent.locationX);
      },
      onPanResponderMove: (event) => {
        updateFromX(event.nativeEvent.locationX);
      },
      onPanResponderRelease: () => {
        onSlidingChange?.(false);
        Haptics.selectionAsync().catch(() => undefined);
      },
      onPanResponderTerminate: () => onSlidingChange?.(false),
    }),
    [onSlidingChange, updateFromX],
  );

  return (
    <View style={styles.settingsSlider}>
      <View style={styles.settingsSliderHeader}>
        <Text style={styles.settingsSliderLabel}>{label}</Text>
        <Text style={styles.settingsSliderValue}>
          {value}
          {suffix}
        </Text>
      </View>
      <View
        {...panResponder.panHandlers}
        onLayout={(event) => setTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
        style={styles.settingsSliderTrack}
      >
        <View style={[styles.settingsSliderFill, { width: `${progress * 100}%` }]} />
        <View style={[styles.settingsSliderThumb, { left: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

function SwipeTodoItem({ gestureSettings, item, onDelete, onOpenMenu, onToggle }: SwipeTodoItemProps) {
  const { width: screenWidth } = useWindowDimensions();
  const translateX = useRef(new Animated.Value(0)).current;
  const [actionMenuSide, setActionMenuSide] = useState<'left' | 'right' | null>(null);
  const actionMenuOpen = actionMenuSide !== null;
  const swipeRowWidth = Math.max(1, screenWidth - HORIZONTAL_PADDING * 2);
  const swipeSidePadding = (100 - gestureSettings.todoSwipeAreaPercent) / 200;
  const swipeStartMinX = swipeRowWidth * swipeSidePadding;
  const swipeStartMaxX = swipeRowWidth * (1 - swipeSidePadding);
  const todoSwipeOpenDistance = gestureSettings.todoSwipeOpenDistance;

  const animateRow = useCallback((toValue: number) => {
    Animated.spring(translateX, {
      toValue,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [translateX]);

  const closeActionMenu = useCallback(() => {
    setActionMenuSide(null);
    animateRow(0);
  }, [animateRow]);

  const openLeftActionMenu = useCallback(() => {
    setActionMenuSide('left');
    animateRow(TODO_LEFT_ACTION_MENU_WIDTH);
    Haptics.selectionAsync().catch(() => undefined);
  }, [animateRow]);

  const openRightActionMenu = useCallback(() => {
    setActionMenuSide('right');
    animateRow(-TODO_RIGHT_ACTION_MENU_WIDTH);
    Haptics.selectionAsync().catch(() => undefined);
  }, [animateRow]);

  const toggleSelection = useCallback(() => {
    onToggle(item.id);
    Haptics.selectionAsync().catch(() => undefined);
  }, [item.id, onToggle]);

  const toggleFromMenu = useCallback(() => {
    toggleSelection();
    closeActionMenu();
  }, [closeActionMenu, toggleSelection]);

  const deleteFromMenu = useCallback(() => {
    closeActionMenu();
    requestAnimationFrame(() => onDelete(item.id));
  }, [closeActionMenu, item.id, onDelete]);

  const openMenuFromAction = useCallback(() => {
    closeActionMenu();
    onOpenMenu();
  }, [closeActionMenu, onOpenMenu]);

  const handleTodoPress = useCallback(() => {
    if (actionMenuOpen) {
      closeActionMenu();
    }
  }, [actionMenuOpen, closeActionMenu]);

  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (event, gesture) => {
        const startX = event.nativeEvent.locationX;
        const startedInsideSwipeBand = startX >= swipeStartMinX && startX <= swipeStartMaxX;

        return (
          startedInsideSwipeBand &&
          Math.abs(gesture.dx) > 8 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy)
        );
      },
      onPanResponderMove: (_, gesture) => {
        const baseX =
          actionMenuSide === 'left'
            ? TODO_LEFT_ACTION_MENU_WIDTH
            : actionMenuSide === 'right'
              ? -TODO_RIGHT_ACTION_MENU_WIDTH
              : 0;
        const nextX = Math.max(-TODO_RIGHT_ACTION_MENU_WIDTH, Math.min(SWIPE_LIMIT, baseX + gesture.dx));
        translateX.setValue(nextX);
      },
      onPanResponderRelease: (_, gesture) => {
        if (actionMenuSide === 'right' && gesture.dx > todoSwipeOpenDistance) {
          closeActionMenu();
          return;
        }

        if (actionMenuSide === 'left' && gesture.dx < -todoSwipeOpenDistance) {
          closeActionMenu();
          return;
        }

        if (gesture.dx > todoSwipeOpenDistance) {
          openLeftActionMenu();
          return;
        }

        if (gesture.dx < -todoSwipeOpenDistance) {
          openRightActionMenu();
          return;
        }

        if (actionMenuSide === 'left') {
          animateRow(TODO_LEFT_ACTION_MENU_WIDTH);
          return;
        }

        if (actionMenuSide === 'right') {
          animateRow(-TODO_RIGHT_ACTION_MENU_WIDTH);
          return;
        }

        closeActionMenu();
      },
      onPanResponderTerminate: () => {
        if (actionMenuSide === 'left') {
          animateRow(TODO_LEFT_ACTION_MENU_WIDTH);
          return;
        }

        if (actionMenuSide === 'right') {
          animateRow(-TODO_RIGHT_ACTION_MENU_WIDTH);
          return;
        }

        closeActionMenu();
      },
    }),
    [
      actionMenuSide,
      animateRow,
      closeActionMenu,
      openLeftActionMenu,
      openRightActionMenu,
      swipeStartMaxX,
      swipeStartMinX,
      translateX,
      todoSwipeOpenDistance,
    ],
  );

  return (
    <View style={styles.swipeShell}>
      <View style={styles.todoLeftActionMenu}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.done ? 'Mark todo active' : 'Mark todo done'}
          onPress={toggleFromMenu}
          style={({ pressed }) => [
            styles.todoActionButton,
            styles.todoActionDone,
            pressed && styles.todoActionPressed,
          ]}
        >
          <Text style={styles.todoActionIcon}>{item.done ? '↩' : '✓'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete todo"
          onPress={deleteFromMenu}
          style={({ pressed }) => [
            styles.todoActionButton,
            styles.todoActionDelete,
            pressed && styles.todoActionPressed,
          ]}
        >
          <Text style={styles.todoActionIcon}>⌫</Text>
        </Pressable>
      </View>
      <View style={styles.todoRightActionMenu}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          onPress={openMenuFromAction}
          style={({ pressed }) => [
            styles.todoActionButton,
            styles.todoActionMore,
            pressed && styles.todoActionPressed,
          ]}
        >
          <Text style={styles.todoActionIcon}>□</Text>
        </Pressable>
      </View>

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.todoRow,
          item.done && styles.todoRowDone,
          { transform: [{ translateX }] },
        ]}
      >
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.done }}
          hitSlop={8}
          onPress={actionMenuOpen ? closeActionMenu : toggleSelection}
          style={[styles.checkbox, item.done && styles.checkboxDone]}
        >
          {item.done && <Text style={styles.checkmark}>✓</Text>}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!actionMenuOpen}
          onPress={handleTodoPress}
          style={styles.todoTextPressable}
        >
          <Text
            numberOfLines={3}
            style={[styles.todoText, item.done && styles.todoTextDone]}
          >
            {item.text}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function App() {
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [pullStage, setPullStage] = useState(0);
  const [menuMode, setMenuMode] = useState<MenuMode | null>(null);
  const [leftPanelVisible, setLeftPanelVisible] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [rightPanelVisible, setRightPanelVisible] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsSliderActive, setSettingsSliderActive] = useState(false);
  const [gestureSettings, setGestureSettings] = useState<GestureSettings>(
    DEFAULT_GESTURE_SETTINGS,
  );
  const [selectedFilters, setSelectedFilters] = useState<SelectedFilters>(
    EMPTY_SELECTED_FILTERS,
  );
  const [isListAtTop, setIsListAtTop] = useState(true);
  const [expandedListMenuPaths, setExpandedListMenuPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const searchInputRef = useRef<TextInput>(null);
  const scrollOffsetY = useRef(0);
  const selectedPullStage = useRef(0);
  const hapticPullStage = useRef(0);
  const pullDistanceRef = useRef(0);
  const pullTapStartRef = useRef({ pageX: 0, pageY: 0, timestamp: 0 });
  const lastListTapRef = useRef({ pageX: 0, pageY: 0, timestamp: 0 });
  const leftPanelTranslateX = useRef(new Animated.Value(-LEFT_PANEL_MAX_WIDTH)).current;
  const rightPanelTranslateX = useRef(new Animated.Value(LEFT_PANEL_MAX_WIDTH)).current;
  const listMenuOpen = menuMode !== null;
  const submenuOpen = menuMode !== null && menuMode !== 'main';
  const leftPanelWidth = Math.min(LEFT_PANEL_MAX_WIDTH, Math.max(300, screenWidth * 0.86));
  const drawerVerticalCoverage = gestureSettings.drawerVerticalCoveragePercent / 100;
  const leftPanelGestureStyle = {
    height: screenHeight * drawerVerticalCoverage,
    left: screenWidth * (gestureSettings.drawerEdgeOffsetPercent / 100),
    top: screenHeight * ((1 - drawerVerticalCoverage) / 2),
    width: screenWidth * (gestureSettings.drawerTriggerWidthPercent / 100),
  };
  const rightPanelGestureStyle = {
    height: screenHeight * drawerVerticalCoverage,
    right: screenWidth * (gestureSettings.drawerEdgeOffsetPercent / 100),
    top: screenHeight * ((1 - drawerVerticalCoverage) / 2),
    width: screenWidth * (gestureSettings.drawerTriggerWidthPercent / 100),
  };

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

    AsyncStorage.getItem(GESTURE_SETTINGS_STORAGE_KEY)
      .then((storedSettings) => {
        if (!alive || !storedSettings) {
          return;
        }

        const parsed = JSON.parse(storedSettings) as unknown;
        if (isRecord(parsed)) {
          setGestureSettings(normalizeGestureSettings(parsed));
        }
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

    AsyncStorage.setItem(
      GESTURE_SETTINGS_STORAGE_KEY,
      JSON.stringify(gestureSettings),
    ).catch(() => undefined);
  }, [gestureSettings, settingsLoaded]);

  const updateGestureSetting = useCallback(
    (key: keyof GestureSettings, value: number) => {
      setGestureSettings((current) =>
        normalizeGestureSettings({ ...current, [key]: value }),
      );
    },
    [],
  );

  useEffect(() => {
    if (!leftPanelVisible && !leftPanelOpen) {
      leftPanelTranslateX.setValue(-leftPanelWidth);
    }
    if (!rightPanelVisible && !rightPanelOpen) {
      rightPanelTranslateX.setValue(leftPanelWidth);
    }
  }, [
    leftPanelOpen,
    leftPanelTranslateX,
    leftPanelVisible,
    leftPanelWidth,
    rightPanelOpen,
    rightPanelTranslateX,
    rightPanelVisible,
  ]);

  const animateLeftPanel = useCallback(
    (toValue: number, onComplete?: () => void) => {
      Animated.spring(leftPanelTranslateX, {
        toValue,
        damping: 22,
        stiffness: 230,
        mass: 0.9,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          onComplete?.();
        }
      });
    },
    [leftPanelTranslateX],
  );

  const animateRightPanel = useCallback(
    (toValue: number, onComplete?: () => void) => {
      Animated.spring(rightPanelTranslateX, {
        toValue,
        damping: 22,
        stiffness: 230,
        mass: 0.9,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          onComplete?.();
        }
      });
    },
    [rightPanelTranslateX],
  );

  const openLeftPanel = useCallback(() => {
    Keyboard.dismiss();
    setLeftPanelVisible(true);
    setLeftPanelOpen(true);
    animateLeftPanel(0);
    Haptics.selectionAsync().catch(() => undefined);
  }, [animateLeftPanel]);

  const openRightPanel = useCallback(() => {
    Keyboard.dismiss();
    setRightPanelVisible(true);
    setRightPanelOpen(true);
    animateRightPanel(0);
    Haptics.selectionAsync().catch(() => undefined);
  }, [animateRightPanel]);

  const closeLeftPanel = useCallback(() => {
    setLeftPanelOpen(false);
    animateLeftPanel(-leftPanelWidth, () => setLeftPanelVisible(false));
    Haptics.selectionAsync().catch(() => undefined);
  }, [animateLeftPanel, leftPanelWidth]);

  const closeRightPanel = useCallback(() => {
    setRightPanelOpen(false);
    animateRightPanel(leftPanelWidth, () => setRightPanelVisible(false));
    Haptics.selectionAsync().catch(() => undefined);
  }, [animateRightPanel, leftPanelWidth]);

  const goBackInMenu = useCallback(() => {
    if (leftPanelVisible) {
      closeLeftPanel();
      return true;
    }

    if (rightPanelVisible) {
      closeRightPanel();
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
  }, [
    closeLeftPanel,
    closeRightPanel,
    leftPanelVisible,
    menuMode,
    rightPanelVisible,
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
    return searchTodos(todos, searchIndex, query);
  }, [query, searchIndex, todos]);

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

  const toggleTodo = useCallback((id: string) => {
    setTodos((current) =>
      current.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo)),
    );
  }, []);

  const getPullStage = useCallback((distance: number) => {
    if (distance >= PULL_STAGES[2].threshold) {
      return 3;
    }

    if (distance >= PULL_STAGES[1].threshold) {
      return 2;
    }

    if (distance >= PULL_STAGES[0].threshold) {
      return 1;
    }

    return 0;
  }, []);

  const triggerStageHaptic = useCallback((stage: number) => {
    if (Platform.OS === 'web' || stage === 0 || stage === hapticPullStage.current) {
      return;
    }

    hapticPullStage.current = stage;

    if (stage === 1) {
      Haptics.selectionAsync().catch(() => undefined);
    } else if (stage === 2) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    } else if (stage === 3) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
    }
  }, []);

  const updatePull = useCallback(
    (distance: number) => {
      const nextDistance = Math.max(0, Math.min(PULL_MAX, distance));
      const nextStage = getPullStage(nextDistance);

      pullDistanceRef.current = nextDistance;
      selectedPullStage.current = nextStage;
      setPullDistance(nextDistance);
      setPullStage(nextStage);
      triggerStageHaptic(nextStage);
    },
    [getPullStage, triggerStageHaptic],
  );

  const resetPull = useCallback(() => {
    pullDistanceRef.current = 0;
    selectedPullStage.current = 0;
    hapticPullStage.current = 0;
    setPullDistance(0);
    setPullStage(0);
  }, []);

  const handlePullTapStart = useCallback((event: GestureResponderEvent) => {
    const { pageX, pageY, timestamp } = event.nativeEvent;
    pullTapStartRef.current = { pageX, pageY, timestamp };
  }, []);

  const handlePullTapEnd = useCallback(
    (event: GestureResponderEvent) => {
      if (
        listMenuOpen ||
        leftPanelVisible ||
        rightPanelVisible
      ) {
        return;
      }

      const { pageX, pageY, timestamp } = event.nativeEvent;
      const start = pullTapStartRef.current;
      const moveX = Math.abs(pageX - start.pageX);
      const moveY = Math.abs(pageY - start.pageY);
      const elapsed = timestamp - start.timestamp;

      if (moveX > 8 || moveY > 8 || elapsed > 280) {
        return;
      }

      const lastTap = lastListTapRef.current;
      const sinceLastTap = timestamp - lastTap.timestamp;
      const distanceFromLastTap = Math.hypot(pageX - lastTap.pageX, pageY - lastTap.pageY);

      if (sinceLastTap <= DOUBLE_TAP_DELAY && distanceFromLastTap <= 28) {
        lastListTapRef.current = { pageX: 0, pageY: 0, timestamp: 0 };
        Keyboard.dismiss();
        setMenuMode('main');
        Haptics.selectionAsync().catch(() => undefined);
        return;
      }

      lastListTapRef.current = { pageX, pageY, timestamp };
    },
    [
      leftPanelVisible,
      listMenuOpen,
      rightPanelVisible,
    ],
  );

  const runPullAction = useCallback(
    (stage: number) => {
      if (stage === 1) {
        searchInputRef.current?.focus();
        return;
      }

      if (stage === 2) {
        Keyboard.dismiss();
        setMenuMode('main');
        return;
      }

      if (stage === 3) {
        setQuery('');
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
    },
    [],
  );

  const releasePull = useCallback(() => {
    const selectedStage = selectedPullStage.current;

    if (pullDistanceRef.current > PULL_RELEASE && selectedStage > 0) {
      runPullAction(selectedStage);
    }

    resetPull();
  }, [resetPull, runPullAction]);

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

      updatePull(translationY);
    },
    [isListAtTop, listMenuOpen, updatePull],
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

  const handleLeftPanelOpenGesture = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      if (listMenuOpen || leftPanelOpen) {
        return;
      }

      const nextX = Math.min(0, -leftPanelWidth + Math.max(0, event.nativeEvent.translationX));
      leftPanelTranslateX.setValue(nextX);
    },
    [leftPanelOpen, leftPanelTranslateX, leftPanelWidth, listMenuOpen],
  );

  const handleLeftPanelOpenStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state, translationX, velocityX } = event.nativeEvent;

      if ((state === State.BEGAN || state === State.ACTIVE) && !leftPanelOpen && !listMenuOpen) {
        Keyboard.dismiss();
        setLeftPanelVisible(true);
        leftPanelTranslateX.setValue(-leftPanelWidth);
      }

      if (
        (state === State.END || state === State.CANCELLED || state === State.FAILED) &&
        !listMenuOpen &&
        !leftPanelOpen
      ) {
        if (translationX > leftPanelWidth * 0.36 || velocityX > 650) {
          openLeftPanel();
        } else {
          setLeftPanelOpen(false);
          animateLeftPanel(-leftPanelWidth, () => setLeftPanelVisible(false));
        }
      }
    },
    [
      animateLeftPanel,
      leftPanelOpen,
      leftPanelTranslateX,
      leftPanelWidth,
      listMenuOpen,
      openLeftPanel,
    ],
  );

  const handleLeftPanelCloseGesture = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      if (!leftPanelOpen) {
        return;
      }

      const nextX = Math.max(-leftPanelWidth, Math.min(0, event.nativeEvent.translationX));
      leftPanelTranslateX.setValue(nextX);
    },
    [leftPanelOpen, leftPanelTranslateX, leftPanelWidth],
  );

  const handleLeftPanelCloseStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state, translationX, velocityX } = event.nativeEvent;

      if (
        (state === State.END || state === State.CANCELLED || state === State.FAILED) &&
        leftPanelOpen
      ) {
        if (translationX < -leftPanelWidth * 0.28 || velocityX < -650) {
          closeLeftPanel();
        } else {
          animateLeftPanel(0);
        }
      }
    },
    [animateLeftPanel, closeLeftPanel, leftPanelOpen, leftPanelWidth],
  );

  const handleRightPanelOpenGesture = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      if (listMenuOpen || rightPanelOpen) {
        return;
      }

      const nextX = Math.max(0, leftPanelWidth + Math.min(0, event.nativeEvent.translationX));
      rightPanelTranslateX.setValue(nextX);
    },
    [leftPanelWidth, listMenuOpen, rightPanelOpen, rightPanelTranslateX],
  );

  const handleRightPanelOpenStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state, translationX, velocityX } = event.nativeEvent;

      if ((state === State.BEGAN || state === State.ACTIVE) && !rightPanelOpen && !listMenuOpen) {
        Keyboard.dismiss();
        setRightPanelVisible(true);
        rightPanelTranslateX.setValue(leftPanelWidth);
      }

      if (
        (state === State.END || state === State.CANCELLED || state === State.FAILED) &&
        !listMenuOpen &&
        !rightPanelOpen
      ) {
        if (translationX < -leftPanelWidth * 0.36 || velocityX < -650) {
          openRightPanel();
        } else {
          setRightPanelOpen(false);
          animateRightPanel(leftPanelWidth, () => setRightPanelVisible(false));
        }
      }
    },
    [
      animateRightPanel,
      leftPanelWidth,
      listMenuOpen,
      openRightPanel,
      rightPanelOpen,
      rightPanelTranslateX,
    ],
  );

  const handleRightPanelCloseGesture = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      if (!rightPanelOpen) {
        return;
      }

      const nextX = Math.min(leftPanelWidth, Math.max(0, event.nativeEvent.translationX));
      rightPanelTranslateX.setValue(nextX);
    },
    [leftPanelWidth, rightPanelOpen, rightPanelTranslateX],
  );

  const handleRightPanelCloseStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state, translationX, velocityX } = event.nativeEvent;

      if (
        (state === State.END || state === State.CANCELLED || state === State.FAILED) &&
        rightPanelOpen
      ) {
        if (translationX > leftPanelWidth * 0.28 || velocityX > 650) {
          closeRightPanel();
        } else {
          animateRightPanel(0);
        }
      }
    },
    [animateRightPanel, closeRightPanel, leftPanelWidth, rightPanelOpen],
  );

  const handleListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      scrollOffsetY.current = Math.max(0, offsetY);
      setIsListAtTop(offsetY <= 1);

      if (!listMenuOpen && offsetY < 0) {
        updatePull(Math.abs(offsetY));
      }
    },
    [listMenuOpen, updatePull],
  );

  const pullMenuOpacity = Math.min(1, pullDistance / PULL_STAGES[0].threshold);
  const pullMenuTranslateY = -18 + Math.min(18, pullDistance * 0.24);
  const pullMenuScale = 0.94 + Math.min(0.06, pullDistance / 900);
  const listTranslateY = Math.min(116, pullDistance * 0.62);
  const hasSearchText = query.trim().length > 0;
  const sortedListMenuTree = useMemo(() => sortListMenuTree(LIST_MENU_TREE), []);
  const visibleListMenuItems = useMemo(
    () => flattenListMenuItems(sortedListMenuTree, expandedListMenuPaths),
    [expandedListMenuPaths, sortedListMenuTree],
  );
  const activeFilterCount = Object.values(selectedFilters).reduce(
    (count, values) => count + values.length,
    0,
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
      return (Object.entries(selectedFilters) as Array<[FilterKey, string[]]>)
        .flatMap(([filterKey, values]) => values.map((label) => ({
          filterKey,
          id: `filter-${filterKey}-${label}`,
          label,
          type: 'filter',
        })));
    }

    return [
      {
        count: selectedFilters.list.length || undefined,
        id: 'main-lists',
        label: 'Lists',
        menuMode: 'lists',
        type: 'menu',
      },
      {
        count: selectedFilters.priority.length || undefined,
        id: 'main-priority',
        label: 'Priority',
        menuMode: 'priority',
        type: 'menu',
      },
      {
        count: selectedFilters.date.length || undefined,
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
  }, [activeFilterCount, menuMode, selectedFilters, visibleListMenuItems]);

  const toggleFilterValue = useCallback((filterKey: FilterKey, value: string) => {
    setSelectedFilters((current) => {
      const currentValues = current[filterKey];
      const hasValue = currentValues.includes(value);

      return {
        ...current,
        [filterKey]: hasValue
          ? currentValues.filter((item) => item !== value)
          : [...currentValues, value],
      };
    });
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const removeFilter = useCallback((filterKey: FilterKey, value: string) => {
    setSelectedFilters((current) => {
      const nextValues = current[filterKey].filter((item) => item !== value);
      return { ...current, [filterKey]: nextValues };
    });
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedFilters({
      date: [],
      list: [],
      priority: [],
    });
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

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
          {!leftPanelOpen && !rightPanelVisible && !listMenuOpen ? (
            <PanGestureHandler
              activeOffsetX={[-2, 2]}
              failOffsetY={[-18, 18]}
              onGestureEvent={handleLeftPanelOpenGesture}
              onHandlerStateChange={handleLeftPanelOpenStateChange}
            >
              <View
                collapsable={false}
                pointerEvents="box-only"
                style={[styles.leftPanelOpenZone, leftPanelGestureStyle]}
              />
            </PanGestureHandler>
          ) : null}

          {!rightPanelOpen && !leftPanelVisible && !listMenuOpen ? (
            <PanGestureHandler
              activeOffsetX={[-2, 2]}
              failOffsetY={[-18, 18]}
              onGestureEvent={handleRightPanelOpenGesture}
              onHandlerStateChange={handleRightPanelOpenStateChange}
            >
              <View
                collapsable={false}
                pointerEvents="box-only"
                style={[styles.leftPanelOpenZone, rightPanelGestureStyle]}
              />
            </PanGestureHandler>
          ) : null}

          {leftPanelVisible ? (
            <>
              {leftPanelOpen ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close left panel"
                  onPress={closeLeftPanel}
                  style={styles.leftPanelBackdrop}
                />
              ) : null}
              <PanGestureHandler
                enabled={!settingsSliderActive}
                activeOffsetX={[-8, 8]}
                failOffsetY={[-20, 20]}
                onGestureEvent={handleLeftPanelCloseGesture}
                onHandlerStateChange={handleLeftPanelCloseStateChange}
              >
                <Animated.View
                  collapsable={false}
                  style={[
                    styles.leftPanel,
                    {
                      transform: [{ translateX: leftPanelTranslateX }],
                      width: leftPanelWidth,
                    },
                  ]}
                >
                  <ScrollView
                    contentContainerStyle={styles.leftPanelScrollContent}
                    showsVerticalScrollIndicator={false}
                  >
                    <Text style={styles.leftPanelTitle}>Todo</Text>
                    <Text style={styles.leftPanelSubtitle}>
                      {todos.length} items · {todos.filter((todo) => !todo.done).length} active
                    </Text>

                    <View style={styles.leftPanelSection}>
                      <Text style={styles.leftPanelSectionTitle}>Filters</Text>
                      <View style={styles.leftPanelMetricRow}>
                        <Text style={styles.leftPanelMetricLabel}>Lists</Text>
                        <Text style={styles.leftPanelMetricValue}>{selectedFilters.list.length}</Text>
                      </View>
                      <View style={styles.leftPanelMetricRow}>
                        <Text style={styles.leftPanelMetricLabel}>Priority</Text>
                        <Text style={styles.leftPanelMetricValue}>{selectedFilters.priority.length}</Text>
                      </View>
                      <View style={styles.leftPanelMetricRow}>
                        <Text style={styles.leftPanelMetricLabel}>Date</Text>
                        <Text style={styles.leftPanelMetricValue}>{selectedFilters.date.length}</Text>
                      </View>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setMenuMode('main');
                        closeLeftPanel();
                      }}
                      style={({ pressed }) => [
                        styles.leftPanelAction,
                        pressed && styles.leftPanelActionPressed,
                      ]}
                    >
                      <Text style={styles.leftPanelActionText}>Open menu</Text>
                      <Text style={styles.leftPanelActionIcon}>›</Text>
                    </Pressable>

                    <View style={styles.leftPanelSection}>
                      <Text style={styles.leftPanelSectionTitle}>Swipe settings</Text>
                      <SettingsSlider
                        label="Drawer edge offset"
                        min={0}
                        max={20}
                        onChange={(value) => updateGestureSetting('drawerEdgeOffsetPercent', value)}
                        onSlidingChange={setSettingsSliderActive}
                        step={1}
                        suffix="%"
                        value={gestureSettings.drawerEdgeOffsetPercent}
                      />
                      <SettingsSlider
                        label="Drawer trigger width"
                        min={5}
                        max={25}
                        onChange={(value) => updateGestureSetting('drawerTriggerWidthPercent', value)}
                        onSlidingChange={setSettingsSliderActive}
                        step={1}
                        suffix="%"
                        value={gestureSettings.drawerTriggerWidthPercent}
                      />
                      <SettingsSlider
                        label="Drawer vertical area"
                        min={20}
                        max={80}
                        onChange={(value) => updateGestureSetting('drawerVerticalCoveragePercent', value)}
                        onSlidingChange={setSettingsSliderActive}
                        step={5}
                        suffix="%"
                        value={gestureSettings.drawerVerticalCoveragePercent}
                      />
                      <SettingsSlider
                        label="Todo swipe area"
                        min={30}
                        max={100}
                        onChange={(value) => updateGestureSetting('todoSwipeAreaPercent', value)}
                        onSlidingChange={setSettingsSliderActive}
                        step={5}
                        suffix="%"
                        value={gestureSettings.todoSwipeAreaPercent}
                      />
                      <SettingsSlider
                        label="Todo reveal distance"
                        min={28}
                        max={120}
                        onChange={(value) => updateGestureSetting('todoSwipeOpenDistance', value)}
                        onSlidingChange={setSettingsSliderActive}
                        step={4}
                        value={gestureSettings.todoSwipeOpenDistance}
                      />
                    </View>
                  </ScrollView>
                </Animated.View>
              </PanGestureHandler>
            </>
          ) : null}

          {rightPanelVisible ? (
            <>
              {rightPanelOpen ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close right panel"
                  onPress={closeRightPanel}
                  style={styles.leftPanelBackdrop}
                />
              ) : null}
              <PanGestureHandler
                activeOffsetX={[-8, 8]}
                failOffsetY={[-20, 20]}
                onGestureEvent={handleRightPanelCloseGesture}
                onHandlerStateChange={handleRightPanelCloseStateChange}
              >
                <Animated.View
                  collapsable={false}
                  style={[
                    styles.leftPanel,
                    styles.rightPanel,
                    {
                      transform: [{ translateX: rightPanelTranslateX }],
                      width: leftPanelWidth,
                    },
                  ]}
                >
                  <Text style={styles.leftPanelTitle}>Todo</Text>
                  <Text style={styles.leftPanelSubtitle}>
                    {todos.length} items · {todos.filter((todo) => !todo.done).length} active
                  </Text>

                  <View style={styles.leftPanelSection}>
                    <Text style={styles.leftPanelSectionTitle}>Filters</Text>
                    <View style={styles.leftPanelMetricRow}>
                      <Text style={styles.leftPanelMetricLabel}>Lists</Text>
                      <Text style={styles.leftPanelMetricValue}>{selectedFilters.list.length}</Text>
                    </View>
                    <View style={styles.leftPanelMetricRow}>
                      <Text style={styles.leftPanelMetricLabel}>Priority</Text>
                      <Text style={styles.leftPanelMetricValue}>{selectedFilters.priority.length}</Text>
                    </View>
                    <View style={styles.leftPanelMetricRow}>
                      <Text style={styles.leftPanelMetricLabel}>Date</Text>
                      <Text style={styles.leftPanelMetricValue}>{selectedFilters.date.length}</Text>
                    </View>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setMenuMode('main');
                      closeRightPanel();
                    }}
                    style={({ pressed }) => [
                      styles.leftPanelAction,
                      pressed && styles.leftPanelActionPressed,
                    ]}
                  >
                    <Text style={styles.leftPanelActionText}>Open menu</Text>
                    <Text style={styles.leftPanelActionIcon}>›</Text>
                  </Pressable>
                </Animated.View>
              </PanGestureHandler>
            </>
          ) : null}

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

                          const isSelected = selectedFilters[item.filterKey].includes(item.label);

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
                        const isSelected = selectedFilters.list.includes(item.label);
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

          <Animated.View
            pointerEvents="none"
            style={[
              styles.pullMenu,
              {
                opacity: pullMenuOpacity,
                transform: [
                  { translateY: pullMenuTranslateY },
                  { scale: pullMenuScale },
                ],
              },
            ]}
          >
            {PULL_STAGES.map((stage, index) => {
              const stageNumber = index + 1;
              const isActive = pullStage === stageNumber;
              const isDisabled = stageNumber === 3 && !hasSearchText;

              return (
                <View
                  key={stage.label}
                  style={[
                    styles.pullStage,
                    isActive && styles.pullStageActive,
                    isDisabled && styles.pullStageDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.pullStageText,
                      isActive && styles.pullStageTextActive,
                      isDisabled && styles.pullStageTextDisabled,
                    ]}
                  >
                    {stage.label}
                  </Text>
                  <Text
                    style={[
                      styles.pullStageMark,
                      isActive && styles.pullStageMarkActive,
                      isDisabled && styles.pullStageMarkDisabled,
                    ]}
                  >
                    {stageNumber === 2 ? '>' : stageNumber}
                  </Text>
                </View>
              );
            })}
          </Animated.View>

          <PanGestureHandler
            activeOffsetY={8}
            enabled={false}
            failOffsetX={[-24, 24]}
            onGestureEvent={handleTopPullGesture}
            onHandlerStateChange={handleTopPullStateChange}
          >
          <Animated.View
            collapsable={false}
            onTouchEnd={handlePullTapEnd}
            onTouchStart={handlePullTapStart}
            style={[styles.todoListFrame, { transform: [{ translateY: listTranslateY }] }]}
          >
            <FlatList
              alwaysBounceVertical
              bounces
              contentContainerStyle={[
                styles.listContent,
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
              renderItem={({ item }) => (
                <SwipeTodoItem
                  gestureSettings={gestureSettings}
                  item={item}
                  onDelete={deleteTodo}
                  onOpenMenu={() => {
                    Keyboard.dismiss();
                    setMenuMode('main');
                    Haptics.selectionAsync().catch(() => undefined);
                  }}
                  onToggle={toggleTodo}
                />
              )}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
            />
          </Animated.View>
          </PanGestureHandler>
        </View>
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
  leftPanelOpenZone: {
    position: 'absolute',
    zIndex: 12,
    elevation: 4,
    backgroundColor: 'transparent',
  },
  leftPanelBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 34,
    backgroundColor: 'rgba(31, 27, 22, 0.14)',
  },
  leftPanel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 35,
    elevation: 10,
    backgroundColor: '#FFFFFF',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#E4DDD4',
    paddingHorizontal: 20,
    paddingTop: 24,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 8, height: 0 },
  },
  leftPanelScrollContent: {
    paddingBottom: 28,
  },
  rightPanel: {
    left: undefined,
    right: 0,
    borderRightWidth: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#E4DDD4',
    shadowOffset: { width: -8, height: 0 },
  },
  leftPanelTitle: {
    color: '#1E1B18',
    fontSize: 22,
    fontWeight: FONT_SEMIBOLD,
    lineHeight: 28,
    letterSpacing: 0,
  },
  leftPanelSubtitle: {
    color: '#8C847C',
    fontSize: 13,
    fontWeight: FONT_REGULAR,
    lineHeight: 18,
    letterSpacing: 0.1,
    marginTop: 4,
  },
  leftPanelSection: {
    marginTop: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EEE8E0',
    paddingTop: 16,
  },
  leftPanelSectionTitle: {
    color: '#8C847C',
    fontSize: 12,
    fontWeight: FONT_MEDIUM,
    lineHeight: 16,
    letterSpacing: 0.2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  leftPanelMetricRow: {
    minHeight: 38,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F2EBE3',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  leftPanelMetricLabel: {
    color: '#2A2520',
    fontSize: 15,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  leftPanelMetricValue: {
    color: '#2F6F62',
    fontSize: 14,
    fontWeight: FONT_MEDIUM,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  leftPanelAction: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#EDF4F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 22,
    paddingHorizontal: 14,
  },
  leftPanelActionPressed: {
    opacity: 0.75,
  },
  leftPanelActionText: {
    color: '#1C5A4E',
    fontSize: 15,
    fontWeight: FONT_MEDIUM,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  leftPanelActionIcon: {
    color: '#2F6F62',
    fontSize: 22,
    fontWeight: FONT_REGULAR,
    lineHeight: 24,
  },
  settingsSlider: {
    paddingVertical: 12,
  },
  settingsSliderHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  settingsSliderLabel: {
    color: '#2A2520',
    fontSize: 14,
    fontWeight: FONT_REGULAR,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  settingsSliderValue: {
    color: '#2F6F62',
    fontSize: 13,
    fontWeight: FONT_MEDIUM,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  settingsSliderTrack: {
    height: 28,
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#F3EEE7',
  },
  settingsSliderFill: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2F6F62',
  },
  settingsSliderThumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#2F6F62',
    marginLeft: -11,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
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
    bottom: 24,
    left: HORIZONTAL_PADDING,
    right: HORIZONTAL_PADDING,
    zIndex: 20,
    elevation: 7,
  },
  listMenu: {
    height: 280,
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
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  swipeShell: {
    minHeight: 60,
    borderRadius: 14,
    backgroundColor: 'transparent',
  },
  todoLeftActionMenu: {
    position: 'absolute',
    top: 1,
    left: 1,
    bottom: 1,
    width: TODO_LEFT_ACTION_MENU_WIDTH,
    borderRadius: 13,
    overflow: 'hidden',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    backgroundColor: '#CF413A',
  },
  todoRightActionMenu: {
    position: 'absolute',
    top: 1,
    right: 1,
    bottom: 1,
    width: TODO_RIGHT_ACTION_MENU_WIDTH,
    borderRadius: 13,
    overflow: 'hidden',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: '#F19A38',
  },
  todoActionButton: {
    width: TODO_ACTION_WIDTH,
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
  },
  todoRowDone: {
    backgroundColor: '#FAF9F6',
    borderColor: '#EEEAE4',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#D4CCC2',
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAF8F5',
  },
  checkboxDone: {
    backgroundColor: '#2F6F62',
    borderColor: '#2F6F62',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: FONT_SEMIBOLD,
    lineHeight: 14,
    marginTop: 1,
  },
  todoText: {
    flex: 1,
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
