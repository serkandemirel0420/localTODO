import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
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
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';

import { createTodoSearchIndex, searchTodos } from './src/search/todoSearch';
import { localTodoStore } from './src/storage/todoStore';
import { makeTodo, normalizeTodoText, type Todo } from './src/todos';

type SwipeTodoItemProps = {
  item: Todo;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
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

const SWIPE_LIMIT = 112;
const SWIPE_TRIGGER = 74;
const TOP_SAFE_GAP = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 16 : 20;
const HORIZONTAL_PADDING = 20;
const FONT_REGULAR = '400' as const;
const FONT_MEDIUM = '500' as const;
const FONT_SEMIBOLD = '600' as const;
const PULL_MAX = 178;
const PULL_RELEASE = 34;
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

function SwipeTodoItem({ item, onDelete, onToggle }: SwipeTodoItemProps) {
  const translateX = useRef(new Animated.Value(0)).current;

  const resetPosition = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [translateX]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_, gesture) => {
        const nextX = Math.max(-SWIPE_LIMIT, Math.min(SWIPE_LIMIT, gesture.dx));
        translateX.setValue(nextX);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_TRIGGER) {
          onToggle(item.id);
          resetPosition();
          return;
        }

        if (gesture.dx < -SWIPE_TRIGGER) {
          Animated.timing(translateX, {
            toValue: -420,
            duration: 190,
            useNativeDriver: true,
          }).start(() => onDelete(item.id));
          return;
        }

        resetPosition();
      },
      onPanResponderTerminate: resetPosition,
    }),
  ).current;

  return (
    <View style={styles.swipeShell}>
      <View style={styles.actionClip}>
        <View style={[styles.actionSide, styles.actionLeft]}>
          <Text style={styles.actionIcon}>{item.done ? '↩' : '✓'}</Text>
          <Text style={styles.actionText}>{item.done ? 'Active' : 'Done'}</Text>
        </View>
        <View style={[styles.actionSide, styles.actionRight]}>
          <Text style={styles.actionText}>Delete</Text>
          <Text style={styles.actionIcon}>✕</Text>
        </View>
      </View>

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.todoRow,
          item.done && styles.todoRowDone,
          { transform: [{ translateX }] },
        ]}
      >
        <View style={[styles.checkbox, item.done && styles.checkboxDone]}>
          {item.done && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text
          numberOfLines={3}
          style={[styles.todoText, item.done && styles.todoTextDone]}
        >
          {item.text}
        </Text>
      </Animated.View>
    </View>
  );
}

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [pullStage, setPullStage] = useState(0);
  const [menuMode, setMenuMode] = useState<MenuMode | null>(null);
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
  const listMenuOpen = menuMode !== null;

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
        menuMode !== null &&
        menuMode !== 'main' &&
        (translationX > 64 || velocityX > 650)
      ) {
        setMenuMode('main');
        Haptics.selectionAsync().catch(() => undefined);
      }
    },
    [menuMode],
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
            enabled={isListAtTop && !listMenuOpen}
            failOffsetX={[-24, 24]}
            onGestureEvent={handleTopPullGesture}
            onHandlerStateChange={handleTopPullStateChange}
          >
          <Animated.View
            collapsable={false}
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
                <SwipeTodoItem item={item} onDelete={deleteTodo} onToggle={toggleTodo} />
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
  listMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 19,
    backgroundColor: 'rgba(0,0,0,0.04)',
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
  actionClip: {
    position: 'absolute',
    top: 1,
    right: 1,
    bottom: 1,
    left: 1,
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: '#C95449',
  },
  actionSide: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 6,
  },
  actionLeft: {
    justifyContent: 'flex-start',
    backgroundColor: '#2F6F62',
  },
  actionRight: {
    justifyContent: 'flex-end',
    backgroundColor: '#C95449',
  },
  actionIcon: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 18,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: FONT_SEMIBOLD,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
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
