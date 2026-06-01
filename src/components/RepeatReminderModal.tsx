import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { REPEAT_PRESETS, type RepeatPreset } from '../reminders';

const ACCENT = '#4C78FF';

type RepeatReminderModalProps = {
  visible: boolean;
  value: RepeatPreset;
  onClose: () => void;
  onConfirm: (value: RepeatPreset) => void;
};

export function RepeatReminderModal({
  visible,
  value,
  onClose,
  onConfirm,
}: RepeatReminderModalProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setDraft(value);
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
          accessibilityLabel="Dismiss repeat settings"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View style={styles.card}>
          <Text style={styles.title}>Repeating</Text>

          {REPEAT_PRESETS.map((preset) => {
            const selected = draft === preset.id;

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={preset.id}
                onPress={() => setDraft(preset.id)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>
                  {preset.label}
                </Text>
                {selected ? (
                  <Ionicons color={ACCENT} name="checkmark" size={20} />
                ) : null}
              </Pressable>
            );
          })}

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
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 20,
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
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 4,
    paddingBottom: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
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
