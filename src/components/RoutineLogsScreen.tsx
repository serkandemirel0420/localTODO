import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, SafeAreaView, StatusBar, Keyboard, View } from 'react-native';
import { formatHabitIntervalLabel, decodeTodoReminder } from '../reminders';
import { normalizeRoutineLogs, type RoutineLog } from '../routineLogs';
import { FlatList, GestureHandlerRootView, Swipeable, TouchableOpacity as GestureTouchableOpacity } from 'react-native-gesture-handler';
import type { Todo } from '../todos';
import { useRememberedScroll } from '../useRememberedScroll';

function RoutineLogRow({ log, disabled, onDelete, onEdit }: {
  log: RoutineLog; disabled: boolean; onDelete: (id: string) => void; onEdit: (log: RoutineLog) => void;
}) {
  const [rowHeight, setRowHeight] = useState(80);
  const swipe = useRef<Swipeable>(null);
  return (
    <Swipeable ref={swipe} enabled={!disabled} containerStyle={styles.swipeShell}
      overshootRight={false} rightThreshold={40}
      renderRightActions={() => (
        <View style={[styles.deleteSlot, { height: rowHeight }]}>
          <GestureTouchableOpacity accessibilityRole="button" accessibilityLabel={`Delete log: ${log.text}`}
            containerStyle={styles.deleteTouchContainer} style={styles.deleteAction}
            onPress={() => onDelete(log.id)}>
            <Ionicons name="trash-outline" color="#FFF" size={22} />
            <Text style={styles.deleteLabel}>Delete</Text>
          </GestureTouchableOpacity>
        </View>
      )}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit log: ${log.text}`}
        accessibilityHint="Opens this note for editing" disabled={disabled}
        onPress={() => { swipe.current?.close(); onEdit(log); }}
        style={({ pressed }) => [styles.entry, pressed && styles.entryPressed]}
        onLayout={event => setRowHeight(Math.max(80, Math.ceil(event.nativeEvent.layout.height)))}>
        <View style={styles.entryHeader}>
          <Text style={[styles.date, styles.entryDate]}>
            {new Date(log.createdAt).toLocaleString(undefined, {
              month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </Text>
          <Ionicons name="create-outline" color="#8E8E93" size={18} />
        </View>
        <Text style={styles.note}>{log.text}</Text>
      </Pressable>
    </Swipeable>
  );
}

export function RoutineLogsScreen({ todo, onClose, onEdit, onAdd, onDelete, onEditLog, onUndo, undoLabel, initiallyComposing, reachSpace }: {
  reachSpace: number; initiallyComposing: boolean; todo: Todo; onClose: () => void; onEdit: () => void;
  onAdd: (text: string) => Promise<void>;
  onDelete: (logId: string) => Promise<void>;
  onEditLog: (logId: string, text: string) => Promise<void>;
  onUndo: () => void;
  undoLabel: string | null;
}) {
  const [draft, setDraft] = useState('');
  const [composing, setComposing] = useState(initiallyComposing);
  const [editingLog, setEditingLog] = useState<RoutineLog | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const input = useRef<TextInput>(null);
  const list = useRef<FlatList<RoutineLog>>(null);
  const scrollMemory = useRememberedScroll(`routine-logs:${todo.id}`, list);
  const logs = React.useMemo(() => normalizeRoutineLogs(todo.routineLogs), [todo.routineLogs]);
  const interval = decodeTodoReminder(todo.filters.reminder).habitHours;
  const saveLog = async () => {
    if (!draft.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true); setError('');
    try {
      if (editingLog) await onEditLog(editingLog.id, draft.trim());
      else await onAdd(draft.trim());
      setDraft(''); setComposing(false); setEditingLog(null); Keyboard.dismiss();
      if (!editingLog) list.current?.scrollToOffset({ offset: reachSpace, animated: true });
    }
    catch { setError('Could not save. Your entry is still here. Try again.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const deleteLog = async (logId: string) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try { await onDelete(logId); }
    catch { setError('Could not delete this log. Try again.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const close = () => { if (!savingRef.current) onClose(); };
  const startLog = () => {
    setEditingLog(null);
    setError('');
    setComposing(true);
    requestAnimationFrame(() => input.current?.focus());
  };
  const startEditLog = (log: RoutineLog) => {
    if (savingRef.current || composing) return;
    setEditingLog(log);
    setDraft(log.text);
    setError('');
    setComposing(true);
    requestAnimationFrame(() => input.current?.focus());
  };
  const saveDisabled = saving || !draft.trim() || Boolean(editingLog && draft.trim() === editingLog.text);

  return (
    <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent={Platform.OS === 'android'} visible onRequestClose={close}>
      <GestureHandlerRootView style={styles.gestureRoot}>
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.navigation}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to routines"
            disabled={saving} onPress={close} style={styles.icon}>
            <Ionicons name="arrow-back" size={23} color="#252934" />
          </Pressable>
          <Text style={styles.navigationTitle}>Routine logs</Text>
          {undoLabel ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Undo ${undoLabel}`}
              accessibilityHint="Reverses the latest recorded change"
              disabled={saving || composing} onPress={() => { if (!savingRef.current) { setError(''); onUndo(); } }}
              style={[styles.icon, styles.undo, (saving || composing) && { opacity: 0.4 }]}>
              <Ionicons name="arrow-undo" size={22} color="#4C78FF" />
            </Pressable>
          ) : null}
        </View>
        <KeyboardAvoidingView style={styles.body}
          keyboardVerticalOffset={Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 8 : 0}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <FlatList
            ref={list}
            {...scrollMemory}
            scrollEventThrottle={16}
            style={styles.body}
            removeClippedSubviews={false}
            showsVerticalScrollIndicator
            initialNumToRender={20}
            data={logs}
            keyExtractor={entry => entry.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View>
                <View pointerEvents="none" style={{ height: reachSpace }} />
                <View style={styles.header}>
                  <View style={styles.titleStack}>
                    <Text style={styles.title}>{todo.text}</Text>
                    {todo.content.trim() ? <Text style={styles.routineContent}>{todo.content.trim()}</Text> : null}
                    <Text style={styles.secondary}>
                      {interval ? formatHabitIntervalLabel(interval) : 'Routine'} · {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
                    </Text>
                  </View>
                </View>
                <Pressable accessibilityRole="button" disabled={saving || composing} onPress={onEdit} style={styles.edit}>
                  <Ionicons name="options-outline" color="#8E8E93" size={17} />
                  <Text style={styles.editText}>Edit routine</Text>
                </Pressable>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTitle}>Logs</Text>
                  <Text style={styles.secondary}>Newest first</Text>
                </View>
                {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
              </View>
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.secondary}>No logs yet. Tap + to add your first note.</Text>
              </View>
            }
            ListFooterComponent={logs.length ? <Text style={styles.endOfLogs}>All {logs.length} {logs.length === 1 ? 'log' : 'logs'}</Text> : null}
            renderItem={({ item }) => (
              <RoutineLogRow log={item} disabled={saving || composing} onDelete={deleteLog} onEdit={startEditLog} />
            )}
          />
          {composing ? (
            <View style={styles.composer}>
              {editingLog ? <Text style={styles.composerTitle}>Edit log</Text> : null}
              <TextInput ref={input} autoFocus multiline editable={!saving}
                placeholder="Add a note about this routine…" value={draft} onChangeText={setDraft}
                style={styles.input} accessibilityLabel="Routine log note" />
              <View style={styles.composerActions}>
                <Pressable accessibilityRole="button" disabled={saving}
                  onPress={() => { setComposing(false); if (editingLog) setDraft(''); setEditingLog(null); setError(''); Keyboard.dismiss(); }} style={styles.cancel}>
                  <Text style={styles.secondary}>Cancel</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={saveDisabled} onPress={saveLog}
                  style={[styles.save, saveDisabled && { opacity: 0.4 }]}>
                  <Ionicons name={editingLog ? 'checkmark' : 'add'} color="white" size={18} />
                  <Text style={styles.saveText}>{saving ? 'Saving…' : editingLog ? 'Save changes' : 'Add log'}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.addBar}>
              <Pressable accessibilityRole="button" accessibilityLabel="Add routine log"
                style={styles.plus} onPress={startLog}>
                <Ionicons name="add" size={28} color="#4C78FF" />
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  gestureRoot: { flex: 1 },
  root: { flex: 1, backgroundColor: '#F5F6F8', paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 8 : 0 },
  navigation: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  navigationTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: '#252934' },
  undo: { borderRadius: 4, backgroundColor: '#E8EEFF' },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  listContent: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 22, paddingBottom: 104 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  titleStack: { flex: 1 },
  title: { fontSize: 23, fontWeight: '600', color: '#1C1C1E', marginBottom: 8 },
  routineContent: { fontSize: 16, lineHeight: 24, color: '#4B4F59', marginBottom: 10 },
  secondary: { fontSize: 13, color: '#8E8E93', lineHeight: 19 },
  addBar: { position: 'absolute', right: 22, bottom: 20 },
  plus: { width: 56, height: 56, borderRadius: 6, backgroundColor: '#E8EEFF', alignItems: 'center', justifyContent: 'center' },
  edit: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 14 },
  editText: { fontSize: 13, color: '#8E8E93' },
  composer: { backgroundColor: '#FFF', borderRadius: 4, padding: 16, marginHorizontal: 22, marginTop: 10, marginBottom: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E5E7EC' },
  composerTitle: { fontSize: 14, fontWeight: '600', color: '#252934', marginBottom: 8 },
  input: { fontSize: 16, lineHeight: 23, minHeight: 64, maxHeight: 120, color: '#1C1C1E', textAlignVertical: 'top' },
  composerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16, marginTop: 14 },
  cancel: { padding: 10 },
  save: { flexDirection: 'row', gap: 5, alignItems: 'center', backgroundColor: '#4C78FF', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 4 },
  saveText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  error: { color: '#C44545', fontSize: 13 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 },
  historyTitle: { fontSize: 16, fontWeight: '600', color: '#252934' },
  swipeShell: { marginLeft: 20 },
  deleteSlot: { width: 72 },
  deleteTouchContainer: { flex: 1, width: '100%' },
  deleteAction: { flex: 1, height: '100%', width: '100%', backgroundColor: '#D14A42', alignItems: 'center', justifyContent: 'center', gap: 6 },
  deleteLabel: { color: '#FFF', fontSize: 12, fontWeight: '500' },
  entry: { minHeight: 80, backgroundColor: '#F5F6F8', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E5EB', paddingVertical: 18 },
  entryPressed: { backgroundColor: '#E8EEFF' },
  entryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  entryDate: { flex: 1, marginBottom: 0 },
  date: { fontSize: 12, color: '#8E8E93', marginBottom: 8 },
  note: { fontSize: 16, lineHeight: 24, color: '#252934' },
  endOfLogs: { textAlign: 'center', color: '#8E8E93', fontSize: 12, paddingTop: 24 },
  empty: { marginLeft: 20, paddingVertical: 24 },
});
