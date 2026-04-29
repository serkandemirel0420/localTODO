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

const SWIPE_LIMIT = 112;
const SWIPE_TRIGGER = 74;
const TOP_SAFE_GAP = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 14 : 18;
const HORIZONTAL_PADDING = 18;
const FONT_REGULAR = '400' as const;
const FONT_MEDIUM = '500' as const;
const FONT_SEMIBOLD = '600' as const;
const PULL_MAX = 178;
const PULL_RELEASE = 34;
const PULL_STAGES = [
  { label: 'Focus search', threshold: 38 },
  { label: 'Lists', threshold: 88 },
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
          <Text style={styles.actionText}>{item.done ? 'Active' : 'Done'}</Text>
        </View>
        <View style={[styles.actionSide, styles.actionRight]}>
          <Text style={styles.actionText}>Delete</Text>
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
        <View style={[styles.statusDot, item.done && styles.statusDotDone]} />
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
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const [expandedListMenuPaths, setExpandedListMenuPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const searchInputRef = useRef<TextInput>(null);
  const scrollOffsetY = useRef(0);
  const selectedPullStage = useRef(0);
  const hapticPullStage = useRef(0);
  const pullDistanceRef = useRef(0);

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
        setListMenuOpen(true);
        return;
      }

      if (stage === 3) {
        setQuery('');
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
    },
    [],
  );

  const pullResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: () =>
          !listMenuOpen && scrollOffsetY.current <= 0,
        onMoveShouldSetPanResponder: (_, gesture) =>
          !listMenuOpen &&
          scrollOffsetY.current <= 0 &&
          gesture.dy > 4 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          if (!listMenuOpen && scrollOffsetY.current <= 0 && gesture.dy > 0) {
            updatePull(gesture.dy);
          }
        },
        onPanResponderRelease: () => {
          const selectedStage = selectedPullStage.current;

          if (pullDistanceRef.current > PULL_RELEASE && selectedStage > 0) {
            runPullAction(selectedStage);
          }

          resetPull();
        },
        onPanResponderTerminate: resetPull,
      }),
    [listMenuOpen, resetPull, runPullAction, updatePull],
  );

  const handleListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffsetY.current = Math.max(0, event.nativeEvent.contentOffset.y);
    },
    [],
  );

  const pullMenuOpacity = Math.min(1, pullDistance / PULL_STAGES[0].threshold);
  const pullMenuTranslateY = -18 + Math.min(18, pullDistance * 0.24);
  const pullMenuScale = 0.94 + Math.min(0.06, pullDistance / 900);
  const listTranslateY = Math.min(116, pullDistance * 0.62);
  const hasSearchText = query.trim().length > 0;
  const pullHandlers = listMenuOpen ? {} : pullResponder.panHandlers;
  const sortedListMenuTree = useMemo(() => sortListMenuTree(LIST_MENU_TREE), []);
  const visibleListMenuItems = useMemo(
    () => flattenListMenuItems(sortedListMenuTree, expandedListMenuPaths),
    [expandedListMenuPaths, sortedListMenuTree],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.screen}
      >
        <View style={styles.topBar}>
          <View style={styles.searchBox}>
            <TextInput
              ref={searchInputRef}
              autoCapitalize="sentences"
              autoCorrect
              clearButtonMode="while-editing"
              onChangeText={setQuery}
              onSubmitEditing={addTodo}
              placeholder="Search or add a todo"
              placeholderTextColor="#989188"
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

        <View style={styles.listShell} {...pullHandlers}>
          {listMenuOpen ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close lists menu"
                onPress={() => setListMenuOpen(false)}
                style={styles.listMenuBackdrop}
              />
              <View style={styles.listMenu}>
                <FlatList
                  data={visibleListMenuItems}
                  decelerationRate="fast"
                  directionalLockEnabled
                  getItemLayout={(_, index) => ({
                    length: LIST_MENU_ROW_HEIGHT,
                    offset: LIST_MENU_ROW_HEIGHT * index,
                    index,
                  })}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  overScrollMode="never"
                  renderItem={({ item }) => {
                    const isExpanded = expandedListMenuPaths.has(item.path);
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
                          setQuery(item.label);
                          setListMenuOpen(false);
                          requestAnimationFrame(() => searchInputRef.current?.focus());
                        }}
                        style={({ pressed }) => [
                          styles.listMenuRow,
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
                            <Text style={styles.listMenuChildCount}>{item.childCount}</Text>
                            <Text style={styles.listMenuArrow}>
                              {isExpanded ? 'v' : '>'}
                            </Text>
                          </Pressable>
                        ) : null}
                      </Pressable>
                    );
                  }}
                  showsVerticalScrollIndicator={false}
                  snapToAlignment="start"
                  snapToInterval={LIST_MENU_ROW_HEIGHT}
                />
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
                      isDisabled && styles.pullStageTextDisabled,
                    ]}
                  >
                    {stageNumber === 2 ? '>' : stageNumber}
                  </Text>
                </View>
              );
            })}
          </Animated.View>

          <View style={{ flex: 1, transform: [{ translateY: listTranslateY }] }}>
            <FlatList
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
              renderItem={({ item }) => (
                <SwipeTodoItem item={item} onDelete={deleteTodo} onToggle={toggleTodo} />
              )}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F4EF',
  },
  screen: {
    flex: 1,
    backgroundColor: '#F7F4EF',
  },
  topBar: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: TOP_SAFE_GAP,
    paddingBottom: 14,
  },
  searchBox: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECE6DE',
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 16,
    shadowColor: '#4F463B',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    color: '#24211E',
    fontSize: 16,
    fontWeight: FONT_REGULAR,
    lineHeight: 22,
    paddingVertical: 12,
  },
  listShell: {
    flex: 1,
  },
  listMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 19,
  },
  listMenu: {
    position: 'absolute',
    bottom: 18,
    left: HORIZONTAL_PADDING,
    right: HORIZONTAL_PADDING,
    zIndex: 20,
    height: 260,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EAE2D8',
    paddingHorizontal: 6,
    paddingVertical: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  listMenuRow: {
    height: LIST_MENU_ROW_HEIGHT,
    borderRadius: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0E9E0',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  listMenuRowPressed: {
    backgroundColor: '#F7F4EF',
  },
  listMenuRowTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  listMenuRowTitle: {
    color: '#2E2924',
    fontSize: 15,
    fontWeight: FONT_MEDIUM,
    lineHeight: 20,
    letterSpacing: 0,
  },
  listMenuArrow: {
    color: '#8C8378',
    fontSize: 16,
    fontWeight: FONT_MEDIUM,
    lineHeight: 20,
    letterSpacing: 0,
  },
  listMenuSubmenuZone: {
    width: '30%',
    minWidth: 78,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginLeft: 8,
  },
  listMenuArrowButtonPressed: {
    backgroundColor: '#EEF5F1',
  },
  listMenuChildCount: {
    color: '#A79F96',
    fontSize: 12,
    fontWeight: FONT_MEDIUM,
    lineHeight: 18,
    letterSpacing: 0,
    marginRight: 8,
  },
  pullMenu: {
    position: 'absolute',
    top: 8,
    left: HORIZONTAL_PADDING,
    right: HORIZONTAL_PADDING,
    zIndex: 10,
    minHeight: 140,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EAE2D8',
    gap: 4,
    padding: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  pullStage: {
    minHeight: 38,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  pullStageActive: {
    backgroundColor: '#EEF5F1',
  },
  pullStageDisabled: {
    opacity: 0.55,
  },
  pullStageText: {
    color: '#6F675E',
    fontSize: 13,
    fontWeight: FONT_MEDIUM,
    lineHeight: 18,
    letterSpacing: 0,
  },
  pullStageTextActive: {
    color: '#1F5E52',
  },
  pullStageTextDisabled: {
    color: '#A79F96',
  },
  pullStageMark: {
    color: '#B1A89D',
    fontSize: 12,
    fontWeight: FONT_MEDIUM,
    lineHeight: 18,
    letterSpacing: 0,
  },
  pullStageMarkActive: {
    color: '#2F6F62',
  },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2F6F62',
    marginLeft: 8,
  },
  addButtonPressed: {
    opacity: 0.72,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 24,
    lineHeight: 28,
    marginTop: -2,
  },
  listContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 96,
    gap: 10,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  swipeShell: {
    minHeight: 64,
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  actionClip: {
    position: 'absolute',
    top: 2,
    right: 2,
    bottom: 2,
    left: 2,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#C95449',
  },
  actionSide: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  actionLeft: {
    alignItems: 'flex-start',
    backgroundColor: '#2F6F62',
  },
  actionRight: {
    alignItems: 'flex-end',
    backgroundColor: '#C95449',
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: FONT_MEDIUM,
    lineHeight: 18,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  todoRow: {
    minHeight: 68,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EEE7DE',
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#544A3F',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  todoRowDone: {
    backgroundColor: '#FBFAF7',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D8CFC3',
    marginRight: 14,
  },
  statusDotDone: {
    backgroundColor: '#2F6F62',
  },
  todoText: {
    flex: 1,
    color: '#24211E',
    fontSize: 16,
    fontWeight: FONT_REGULAR,
    lineHeight: 22,
    letterSpacing: 0,
  },
  todoTextDone: {
    color: '#948D84',
    textDecorationLine: 'line-through',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  emptyTitle: {
    color: '#36312D',
    fontSize: 18,
    fontWeight: FONT_SEMIBOLD,
    letterSpacing: 0,
    marginBottom: 8,
  },
  emptyText: {
    color: '#827A72',
    fontSize: 14,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
    letterSpacing: 0,
    textAlign: 'center',
  },
});
