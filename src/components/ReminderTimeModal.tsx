import React, {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  DEFAULT_REMINDER_TIME,
  type ReminderTime,
} from '../reminders';
import { InlineTimePicker } from './InlineTimePicker';

const ACCENT = '#4C78FF';

export type ReminderTimeModalSource = 'create' | 'activeTodo';

export type ReminderTimeModalHandle = {
  close: () => void;
  open: (params: {
    source: ReminderTimeModalSource;
    value: ReminderTime | null;
  }) => void;
};

type ReminderTimeModalProps = {
  onConfirm: (source: ReminderTimeModalSource, time: ReminderTime) => void;
};

function ReminderTimeModalHost({
  onConfirm,
}: ReminderTimeModalProps, ref: React.ForwardedRef<ReminderTimeModalHandle>) {
  const sourceRef = useRef<ReminderTimeModalSource>('create');
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState<ReminderTime>(DEFAULT_REMINDER_TIME);

  const close = useCallback(() => {
    setVisible(false);
  }, []);

  const open = useCallback((params: {
    source: ReminderTimeModalSource;
    value: ReminderTime | null;
  }) => {
    sourceRef.current = params.source;
    setDraft(params.value ?? DEFAULT_REMINDER_TIME);
    setVisible(true);
  }, []);

  useImperativeHandle(ref, () => ({
    close,
    open,
  }), [close, open]);

  const handleConfirm = useCallback(() => {
    onConfirm(sourceRef.current, draft);
    close();
  }, [close, draft, onConfirm]);

  if (!visible) {
    return null;
  }

  return (
    <Modal
      animationType="none"
      hardwareAccelerated
      onRequestClose={close}
      transparent
      visible={visible}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss reminder"
          onPress={close}
          style={styles.backdrop}
        />
        <View style={styles.card}>
          <Text style={styles.title}>Reminder</Text>
          <InlineTimePicker
            onChange={setDraft}
            value={draft}
          />
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={close}
              style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
            >
              <Text style={styles.actionText}>CANCEL</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={handleConfirm}
              style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
            >
              <Text style={styles.actionText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export const ReminderTimeModal = memo(forwardRef(ReminderTimeModalHost));

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    elevation: 10,
    overflow: 'hidden',
    paddingBottom: 8,
    paddingTop: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
  },
  title: {
    color: '#1F1B17',
    fontSize: 20,
    fontWeight: '700',
    paddingBottom: 4,
    paddingHorizontal: 20,
  },
  pressed: {
    backgroundColor: '#F5F2ED',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 4,
    paddingBottom: 8,
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  actionButton: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionText: {
    color: ACCENT,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
});
