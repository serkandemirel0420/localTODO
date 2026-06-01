import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { REPEAT_PRESETS, type RepeatPreset } from '../reminders';

const ACCENT = '#4C78FF';

type RepeatPickerListProps = {
  value: RepeatPreset;
  onSelect: (value: RepeatPreset) => void;
};

export function RepeatPickerList({ value, onSelect }: RepeatPickerListProps) {
  return (
    <>
      {REPEAT_PRESETS.map((preset) => {
        const selected = value === preset.id;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={preset.id}
            onPress={() => onSelect(preset.id)}
            style={({ pressed }) => [
              styles.row,
              selected && styles.rowSelected,
              pressed && styles.rowPressed,
            ]}
          >
            <Text style={[styles.rowText, selected && styles.rowTextSelected]}>
              {preset.label}
            </Text>
            {selected ? (
              <Ionicons color={ACCENT} name="checkmark" size={18} />
            ) : null}
          </Pressable>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  rowSelected: {
    backgroundColor: '#E8EEFF',
  },
  rowPressed: {
    backgroundColor: '#F5F2ED',
  },
  rowText: {
    color: '#2A2520',
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 20,
  },
  rowTextSelected: {
    color: ACCENT,
    fontWeight: '500',
  },
});
