import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  DEFAULT_HABIT_INTERVAL,
  formatHabitIntervalShortLabel,
  HABIT_INTERVAL_VALUES,
  type HabitInterval,
} from '../reminders';

const ACCENT = '#4C78FF';

type HabitReminderModalProps = {
  visible: boolean;
  value: HabitInterval | null;
  onClose: () => void;
  onConfirm: (value: HabitInterval | null) => void;
};

export function HabitReminderModal({
  visible,
  value,
  onClose,
  onConfirm,
}: HabitReminderModalProps) {
  const [draft, setDraft] = useState<HabitInterval | null>(
    value ?? DEFAULT_HABIT_INTERVAL,
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    setDraft(value ?? DEFAULT_HABIT_INTERVAL);
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
          accessibilityLabel="Dismiss habit settings"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View style={styles.card}>
          <Text style={styles.title}>Habit</Text>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: draft === null }}
            onPress={() => setDraft(null)}
            style={({ pressed }) => [styles.noneRow, pressed && styles.pressed]}
          >
            <Text style={[styles.rowLabel, draft === null && styles.rowLabelSelected]}>
              None
            </Text>
            {draft === null ? (
              <Ionicons color={ACCENT} name="checkmark" size={20} />
            ) : null}
          </Pressable>

          <View style={styles.intervalGrid}>
            {HABIT_INTERVAL_VALUES.map((interval) => {
              const selected = draft === interval;

              return (
                <View key={interval} style={styles.intervalCell}>
                  <Pressable
                    accessibilityLabel={`Habit interval ${interval}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setDraft(interval)}
                    style={({ pressed }) => [
                      styles.intervalButton,
                      selected && styles.intervalButtonSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[
                      styles.intervalLabel,
                      selected && styles.rowLabelSelected,
                    ]}>
                      {formatHabitIntervalShortLabel(interval)}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>

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
    borderRadius: 5,
    elevation: 10,
    overflow: 'hidden',
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
    paddingBottom: 6,
    paddingHorizontal: 20,
  },
  noneRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 20,
  },
  intervalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  intervalCell: {
    padding: 4,
    width: '25%',
  },
  intervalButton: {
    alignItems: 'center',
    borderColor: '#E4DED7',
    borderRadius: 4,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  intervalButtonSelected: {
    backgroundColor: '#EEF3FF',
    borderColor: ACCENT,
  },
  pressed: {
    backgroundColor: '#F5F2ED',
  },
  rowLabel: {
    color: '#1F1B17',
    fontSize: 16,
    fontWeight: '400',
  },
  rowLabelSelected: {
    color: ACCENT,
    fontWeight: '500',
  },
  intervalLabel: {
    color: '#1F1B17',
    fontSize: 16,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 4,
    paddingBottom: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  actionButton: {
    borderRadius: 4,
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
