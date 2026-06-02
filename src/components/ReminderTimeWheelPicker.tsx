import React from 'react';

import {
  type ReminderTime,
} from '../reminders';
import { InlineTimePicker } from './InlineTimePicker';

type ReminderTimeWheelPickerProps = {
  value: ReminderTime | null;
  onChange: (value: ReminderTime) => void;
};

export function ReminderTimeWheelPicker({
  value,
  onChange,
}: ReminderTimeWheelPickerProps) {
  return (
    <InlineTimePicker
      onChange={onChange}
      value={value}
    />
  );
}
