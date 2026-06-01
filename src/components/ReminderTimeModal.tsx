import React, { useEffect, useState } from 'react';
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

type ReminderTimeModalProps = {
  visible: boolean;
  value: ReminderTime | null;
  onClose: () => void;
  onConfirm: (time: ReminderTime) => void;
};

export function ReminderTimeModal({
  visible,
  value,
  onClose,
  onConfirm,
}: ReminderTimeModalProps) {
  const [draft, setDraft] = useState<ReminderTime>(value ?? DEFAULT_REMINDER_TIME);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setDraft(value ?? DEFAULT_REMINDER_TIME);
  }, [value, visible]);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss reminder"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View style={styles.card}>
          <Text style={styles.title}>Reminder</Text>
          <InlineTimePicker
            key={visible ? 'open' : 'closed'}
            onChange={setDraft}
            value={draft}
          />
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
            >
              <Text style={styles.actionText}>CANCEL</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => onConfirm(draft)}
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
