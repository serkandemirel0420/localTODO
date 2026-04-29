import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
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

const SWIPE_LIMIT = 112;
const SWIPE_TRIGGER = 74;

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
      <View style={[styles.actionSide, styles.actionLeft]}>
        <Text style={styles.actionText}>{item.done ? 'Active' : 'Done'}</Text>
      </View>
      <View style={[styles.actionSide, styles.actionRight]}>
        <Text style={styles.actionText}>Delete</Text>
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

  useEffect(() => {
    let alive = true;

    localTodoStore
      .load()
      .then((storedTodos) => {
        if (!alive) {
          return;
        }

        setTodos(storedTodos);
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
          renderItem={({ item }) => (
            <SwipeTodoItem item={item} onDelete={deleteTodo} onToggle={toggleTodo} />
          )}
          showsVerticalScrollIndicator={false}
        />
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
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
  },
  searchBox: {
    minHeight: 56,
    borderRadius: 18,
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
    fontSize: 17,
    lineHeight: 22,
    paddingVertical: 12,
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
    paddingHorizontal: 18,
    paddingBottom: 96,
    gap: 10,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  swipeShell: {
    minHeight: 68,
    borderRadius: 18,
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
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  todoRow: {
    minHeight: 68,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EEE7DE',
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 18,
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
    fontSize: 17,
    lineHeight: 23,
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
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: 8,
  },
  emptyText: {
    color: '#827A72',
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: 0,
    textAlign: 'center',
  },
});
