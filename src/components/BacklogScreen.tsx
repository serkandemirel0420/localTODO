import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Linking, Modal, PanResponder, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { emptyBacklog, nextBacklog, normalizeBacklog, previousBacklog, type BacklogState } from '../backlog';
import { hasTodoHabitInterval } from '../reminders';
import type { Todo } from '../todos';
import { TodoContentLinkText } from './TodoContentLinkText';

const STORAGE_KEY = 'local-todo.backlog.v1';

export function BacklogScreen({ todos, initialTodoId, onClose, onDelete, onUndoDelete, onEdit }: { todos: Todo[]; initialTodoId?: string | null; onClose: () => void; onDelete: (id: string) => void; onUndoDelete?: () => void; onEdit: (todo: Todo, field: 'title' | 'content') => void }) {
  const [state, setState] = useState<BacklogState>(emptyBacklog);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [lastDeletedId, setLastDeletedId] = useState<string | null>(null);
  const lastTap = useRef<{ id: string; field: 'title' | 'content'; at: number } | null>(null);
  const stateRef = useRef(state);
  const writeRef = useRef(Promise.resolve());
  const drag = useRef(new Animated.ValueXY()).current;
  const eligible = useMemo(() => todos.filter(todo => !todo.done && !hasTodoHabitInterval(todo.filters.reminder)), [todos]);
  const ids = useMemo(() => eligible.map(todo => todo.id), [eligible]);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const save = (next: BacklogState) => {
    stateRef.current = next;
    setState(next);
    writeRef.current = writeRef.current.catch(() => undefined).then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)))
      .then(() => setError('')).catch(() => setError('Could not save backlog progress. Try again.'));
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (!active) return;
      const loaded = raw ? normalizeBacklog(JSON.parse(raw)) : emptyBacklog();
      const resumeIndex = initialTodoId && idsRef.current.includes(initialTodoId)
        ? loaded.history.indexOf(initialTodoId) : -1;
      if (resumeIndex >= 0) loaded.cursor = resumeIndex;
      else if (initialTodoId && idsRef.current.includes(initialTodoId)) {
        loaded.history.push(initialTodoId);
        loaded.cursor = loaded.history.length - 1;
      }
      const currentExists = idsRef.current.includes(loaded.history[loaded.cursor]);
      const atEnd = loaded.cursor === loaded.history.length;
      const hasUnseen = idsRef.current.some(id => !loaded.history.includes(id));
      const restored = currentExists || (atEnd && !hasUnseen)
        ? loaded : nextBacklog({ ...loaded, cursor: atEnd ? loaded.cursor : -1 }, idsRef.current);
      stateRef.current = restored;
      setState(restored);
      setReady(true);
      if (!currentExists && restored !== loaded) saveRef.current(restored);
    }).catch(() => { if (active) { setError('Could not load backlog progress. Close and try again.'); } });
    return () => { active = false; };
  }, []);
  const move = (direction: 'next' | 'previous') => {
    const next = direction === 'next' ? nextBacklog(stateRef.current, idsRef.current) : previousBacklog(stateRef.current, idsRef.current);
    if (next !== stateRef.current) saveRef.current(next);
  };
  const moveRef = useRef(move);
  moveRef.current = move;
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
    onPanResponderMove: (_, gesture) => drag.setValue({ x: gesture.dx, y: 0 }),
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) > 70) {
        const direction = gesture.dx < 0 ? 'next' : 'previous';
        Animated.timing(drag, { toValue: { x: gesture.dx < 0 ? -380 : 380, y: 0 }, duration: 140, useNativeDriver: true }).start(() => {
          moveRef.current(direction);
          drag.setValue({ x: 0, y: 0 });
        });
      } else Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start(),
  })).current;
  const current = eligible.find(todo => todo.id === state.history[state.cursor]);
  const viewed = state.history.filter(id => ids.includes(id)).length;
  const rating = current ? state.ratings[current.id] : undefined;
  const tapToEdit = (todo: Todo, field: 'title' | 'content') => {
    const now = Date.now();
    const previous = lastTap.current;
    if (previous && previous.id === todo.id && previous.field === field && now - previous.at < 400) {
      lastTap.current = null;
      onEdit(todo, field);
    } else {
      lastTap.current = { id: todo.id, field, at: now };
    }
  };
  const deleteCurrent = () => {
    if (!current) return;
    setLastDeletedId(current.id);
    save(nextBacklog(stateRef.current, idsRef.current.filter(id => id !== current.id)));
    onDelete(current.id);
  };
  const undoDelete = () => {
    if (!lastDeletedId || !onUndoDelete) return;
    const cursor = stateRef.current.history.indexOf(lastDeletedId);
    if (cursor >= 0) save({ ...stateRef.current, cursor });
    onUndoDelete();
    setLastDeletedId(null);
  };
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close backlog" onPress={onClose} style={styles.icon}><Ionicons name="arrow-back" size={23} color="#24283A" /></Pressable>
          <View style={styles.headerText}><Text style={styles.eyebrow}>ONE ITEM AT A TIME</Text><Text style={styles.heading}>Your backlog</Text></View>
          {lastDeletedId && onUndoDelete ? <Pressable accessibilityRole="button" accessibilityLabel="Undo delete" onPress={undoDelete} style={styles.undo}><Ionicons name="arrow-undo" size={20} color="#5866AC" /></Pressable> : null}
          <View style={styles.count}><Text style={styles.countText}>{viewed} / {eligible.length}</Text></View>
        </View>
        {!ready ? <View style={styles.center}>{error ? <Text style={styles.muted}>{error}</Text> : <ActivityIndicator color="#536AF6" />}</View> : current ? (
          <View style={styles.body}>
            <View style={styles.stack}>
              <View pointerEvents="none" style={styles.underCard} />
              <Animated.View style={[styles.card, { transform: [{ translateX: drag.x }, { rotate: drag.x.interpolate({ inputRange: [-300, 0, 300], outputRange: ['-7deg', '0deg', '7deg'] }) }] }]} {...pan.panHandlers}>
                <Text style={styles.cardLabel}>TO REVIEW</Text>
                <ScrollView showsVerticalScrollIndicator nestedScrollEnabled style={styles.cardScroll} contentContainerStyle={styles.cardScrollContent}>
                  <Text accessibilityRole="button" accessibilityHint="Double tap to edit title" onPress={() => tapToEdit(current, 'title')} style={styles.title}>{current.text || 'Untitled item'}</Text>
                  {current.content.trim() ? <TodoContentLinkText accessibilityHint="Double tap to edit notes" onPress={() => tapToEdit(current, 'content')} style={styles.content} text={current.content.trim()} onOpenLinkOptions={(url) => { Linking.openURL(url).catch(() => Alert.alert('Could not open link', url)); }} /> : <Text accessibilityRole="button" accessibilityHint="Double tap to add notes" onPress={() => tapToEdit(current, 'content')} style={styles.emptyContent}>No notes for this item</Text>}
                  {current.filters.list.length ? <Text style={styles.listLabel}>{current.filters.list.join(' · ')}</Text> : null}
                </ScrollView>
                <View style={styles.priorityHeader}><View><Text style={styles.priorityTitle}>Backlog priority</Text><Text style={styles.priorityHelp}>1 low · 10 high</Text></View><Text style={styles.priorityValue}>{rating ?? '—'}<Text style={styles.priorityTotal}> / 10</Text></Text></View>
                <View style={styles.ratings}>{Array.from({ length: 10 }, (_, index) => index + 1).map(value => (
                  <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Set backlog priority to ${value}`} accessibilityState={{ selected: rating === value }} onPress={() => save({ ...stateRef.current, ratings: { ...stateRef.current.ratings, [current.id]: value } })} style={[styles.rating, rating === value && styles.ratingSelected]}><Text style={[styles.ratingText, rating === value && styles.ratingTextSelected]}>{value}</Text></Pressable>
                ))}</View>
              </Animated.View>
            </View>
            <Text style={styles.hint}>Double tap text to edit · swipe to browse</Text>
            <View style={styles.controls}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${current.text || 'item'}`} onPress={deleteCurrent} style={styles.deleteButton}><Ionicons name="trash-outline" size={22} color="#C24E50" /></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Previous item" onPress={() => move('previous')} style={styles.backButton}><Ionicons name="arrow-back" size={22} color="#505D9D" /></Pressable>
              <Pressable accessibilityRole="button" onPress={() => move('next')} style={styles.nextButton}><Text style={styles.nextText}>Next item</Text><Ionicons name="arrow-forward" size={19} color="#FFF" /></Pressable>
            </View>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          </View>
        ) : (
          <View style={styles.center}>
            <Ionicons name="checkmark-circle-outline" size={52} color="#7886D6" />
            <Text style={styles.endTitle}>{eligible.length ? 'You’re all caught up' : 'Your backlog is empty'}</Text>
            <Text style={styles.endText}>{eligible.length ? 'You’ve seen every open item. Start another round whenever you like.' : 'Open items will appear here for review.'}</Text>
            {eligible.length ? <View style={styles.endButtons}><Pressable onPress={() => move('previous')} style={styles.backButton} accessibilityLabel="Previous item"><Ionicons name="arrow-back" size={22} color="#505D9D" /></Pressable><Pressable onPress={() => save(nextBacklog({ ...stateRef.current, history: [], cursor: -1 }, idsRef.current))} style={styles.nextButton}><Text style={styles.nextText}>Start another round</Text></Pressable></View> : null}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4FA', paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 15, gap: 12 },
  icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF', borderRadius: 15 },
  headerText: { flex: 1 }, eyebrow: { color: '#8A90AB', fontSize: 10, letterSpacing: 1.5, fontWeight: '700' }, heading: { fontSize: 22, fontWeight: '700', color: '#24283A', marginTop: 2 },
  undo: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#E5E8FB' },
  count: { backgroundColor: '#E5E8FB', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 }, countText: { color: '#5866AC', fontSize: 13, fontWeight: '700' },
  body: { flex: 1, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12 }, stack: { flex: 1, minHeight: 260 },
  underCard: { position: 'absolute', left: 13, right: 13, top: 10, bottom: -10, borderRadius: 28, backgroundColor: '#DDE1F2' },
  card: { flex: 1, backgroundColor: '#FFF', borderRadius: 24, padding: 18, shadowColor: '#606994', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }, cardLabel: { color: '#858DB7', fontSize: 10, fontWeight: '700', letterSpacing: 1.3, marginBottom: 12 },
  cardScroll: { flex: 1 }, cardScrollContent: { paddingBottom: 16 }, title: { color: '#22263A', fontSize: 27, lineHeight: 34, fontWeight: '700' }, content: { color: '#626A80', fontSize: 16, lineHeight: 24, marginTop: 14 }, emptyContent: { color: '#B0B5C4', fontSize: 14, marginTop: 14 }, listLabel: { color: '#6977C2', fontSize: 13, marginTop: 20 },
  priorityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E7E9F1' }, priorityTitle: { color: '#343A51', fontSize: 15, fontWeight: '700' }, priorityHelp: { color: '#9A9FB1', fontSize: 12, marginTop: 4 }, priorityValue: { color: '#5466E5', fontSize: 18, fontWeight: '700' }, priorityTotal: { color: '#A0A5B7', fontSize: 13 },
  ratings: { flexDirection: 'row', justifyContent: 'space-between', gap: 2, marginTop: 8 }, rating: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#F1F2F8' }, ratingSelected: { backgroundColor: '#586BF2' }, ratingText: { color: '#68708B', fontSize: 12, fontWeight: '600' }, ratingTextSelected: { color: '#FFF' },
  deleteButton: { width: 54, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#F9E6E6' },
  hint: { textAlign: 'center', color: '#969DB2', fontSize: 12, marginTop: 14 }, controls: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 10 }, backButton: { width: 54, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#E2E6F8' }, nextButton: { height: 52, minWidth: 172, paddingHorizontal: 22, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#586BF2', borderRadius: 17 }, nextText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }, muted: { color: '#747B90', textAlign: 'center' }, endTitle: { color: '#252A40', fontWeight: '700', fontSize: 23, textAlign: 'center', marginTop: 18 }, endText: { color: '#8A90A4', fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10 }, endButtons: { flexDirection: 'row', gap: 12, marginTop: 24 }, error: { color: '#AF4B45', textAlign: 'center', fontSize: 12, marginTop: 12 },
});
