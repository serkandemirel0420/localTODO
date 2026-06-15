export const REMINDER_PICKER_LABEL = 'Reminder';
export const REPEAT_PICKER_LABEL = 'Repeating';
export const REPEATING_ITEMS_FILTER_LABEL = 'Repeating items';
export const REPEATING_ITEMS_FILTER_VALUE = 'filter:repeating-items';
export const NOT_REPEATING_ITEMS_FILTER_LABEL = 'Not repeating';
export const NOT_REPEATING_ITEMS_FILTER_VALUE = 'filter:not-repeating-items';

export type RepeatPreset = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export type ReminderTime = {
  hours: number;
  minutes: number;
};

export type TodoReminder = {
  time: ReminderTime | null;
  repeat: RepeatPreset;
};

export const REPEAT_PRESETS: Array<{ id: RepeatPreset; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
];

const REPEAT_PREFIX = 'repeat:';
const REPEAT_STATUS_FILTER_VALUES = [
  REPEATING_ITEMS_FILTER_VALUE,
  NOT_REPEATING_ITEMS_FILTER_VALUE,
];

const isRepeatPreset = (value: string): value is RepeatPreset =>
  REPEAT_PRESETS.some((preset) => preset.id === value);

export const DEFAULT_REMINDER_TIME: ReminderTime = {
  hours: 9,
  minutes: 0,
};

export const DEFAULT_TODO_REMINDER: TodoReminder = {
  time: null,
  repeat: 'none',
};

const pad2 = (value: number) => String(value).padStart(2, '0');

const normalizeReminderTime = (time: ReminderTime | null): ReminderTime | null => {
  if (!time) {
    return null;
  }

  const hours = Math.trunc(time.hours);
  const minutes = Math.trunc(time.minutes);

  if (
    !Number.isFinite(hours)
    || !Number.isFinite(minutes)
    || hours < 0
    || hours > 23
    || minutes < 0
    || minutes > 59
  ) {
    return null;
  }

  return { hours, minutes };
};

export const normalizeTodoReminder = (reminder: TodoReminder): TodoReminder => {
  const time = normalizeReminderTime(reminder.time);
  const repeat = isRepeatPreset(reminder.repeat) ? reminder.repeat : 'none';

  return {
    time,
    repeat,
  };
};

const parseTimePart = (value: string): ReminderTime | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return { hours, minutes };
};

export const reminderTimeToDate = (time: ReminderTime): Date => {
  const date = new Date();
  date.setHours(time.hours, time.minutes, 0, 0);
  return date;
};

export const dateToReminderTime = (date: Date): ReminderTime => ({
  hours: date.getHours(),
  minutes: date.getMinutes(),
});

export const formatReminderClockLabel = (time: ReminderTime | null): string => {
  if (!time) {
    return 'None';
  }

  return `${pad2(time.hours)}:${pad2(time.minutes)}`;
};

export const formatRepeatLabel = (repeat: RepeatPreset): string => {
  const preset = REPEAT_PRESETS.find((item) => item.id === repeat);
  return preset?.label ?? 'None';
};

export const encodeTodoReminder = (reminder: TodoReminder): string[] => {
  const normalized = normalizeTodoReminder(reminder);

  if (!normalized.time && normalized.repeat === 'none') {
    return [];
  }

  if (normalized.time) {
    const base = `${pad2(normalized.time.hours)}:${pad2(normalized.time.minutes)}`;
    if (normalized.repeat === 'none') {
      return [base];
    }

    return [`${base}|${REPEAT_PREFIX}${normalized.repeat}`];
  }

  return [`${REPEAT_PREFIX}${normalized.repeat}`];
};

export const decodeTodoReminder = (values: string[]): TodoReminder => {
  const raw = values[0]?.trim();
  if (!raw) {
    return DEFAULT_TODO_REMINDER;
  }

  const segments = raw.split('|');
  const firstSegment = segments[0] ?? '';
  const time = firstSegment ? parseTimePart(firstSegment) : null;

  let repeat: RepeatPreset = 'none';
  const repeatSegments = time ? segments.slice(1) : segments;
  repeatSegments.forEach((segment) => {
    if (segment.startsWith(REPEAT_PREFIX)) {
      const candidate = segment.slice(REPEAT_PREFIX.length);
      if (isRepeatPreset(candidate)) {
        repeat = candidate;
      }
    }
  });

  return normalizeTodoReminder({ time, repeat });
};

export const hasTodoReminderTime = (values: string[]): boolean =>
  decodeTodoReminder(values).time !== null;

export const hasTodoRepeat = (values: string[]): boolean =>
  decodeTodoReminder(values).repeat !== 'none';

export const hasRepeatingItemsFilter = (values: string[]): boolean =>
  values.includes(REPEATING_ITEMS_FILTER_VALUE);

export const hasNotRepeatingItemsFilter = (values: string[]): boolean =>
  values.includes(NOT_REPEATING_ITEMS_FILTER_VALUE);

export const removeRepeatingItemsFilter = (values: string[]): string[] =>
  values.filter((value) => value !== REPEATING_ITEMS_FILTER_VALUE);

export const removeNotRepeatingItemsFilter = (values: string[]): string[] =>
  values.filter((value) => value !== NOT_REPEATING_ITEMS_FILTER_VALUE);

export const removeRepeatStatusFilters = (values: string[]): string[] =>
  values.filter((value) => !REPEAT_STATUS_FILTER_VALUES.includes(value));

export const toggleRepeatingItemsFilterValue = (values: string[]): string[] => {
  const reminderValues = removeRepeatStatusFilters(values);

  return hasRepeatingItemsFilter(values)
    ? reminderValues
    : [...reminderValues, REPEATING_ITEMS_FILTER_VALUE];
};

export const toggleNotRepeatingItemsFilterValue = (values: string[]): string[] => {
  const reminderValues = removeRepeatStatusFilters(values);

  return hasNotRepeatingItemsFilter(values)
    ? reminderValues
    : [...reminderValues, NOT_REPEATING_ITEMS_FILTER_VALUE];
};

export const formatReminderTimeMenuLabel = (values: string[]): string => {
  const { time } = decodeTodoReminder(values);
  if (!time) {
    return REMINDER_PICKER_LABEL;
  }

  return formatReminderClockLabel(time);
};

export const formatRepeatMenuLabel = (values: string[]): string => {
  const { repeat } = decodeTodoReminder(values);
  if (repeat === 'none') {
    return REPEAT_PICKER_LABEL;
  }

  return formatRepeatLabel(repeat);
};

export const formatTodoReminderMetaLabel = (values: string[]): string | null => {
  const { time, repeat } = decodeTodoReminder(values);
  if (!time) {
    return null;
  }

  const timeLabel = formatReminderClockLabel(time);
  if (repeat === 'none') {
    return timeLabel;
  }

  return `${timeLabel} ${formatRepeatLabel(repeat)}`;
};

export const normalizeReminderFilterValues = (values: string[]): string[] => {
  const hasRepeatingFilter = hasRepeatingItemsFilter(values);
  const hasNotRepeatingFilter = hasNotRepeatingItemsFilter(values);
  const reminderValues = removeRepeatStatusFilters(values);
  const normalizedReminder = encodeTodoReminder(decodeTodoReminder(reminderValues));

  if (hasNotRepeatingFilter) {
    return [...normalizedReminder, NOT_REPEATING_ITEMS_FILTER_VALUE];
  }

  if (hasRepeatingFilter) {
    return [...normalizedReminder, REPEATING_ITEMS_FILTER_VALUE];
  }

  return normalizedReminder;
};

export const isDatePickerMenuItemSelected = (
  menuLabel: string,
  dateLabels: string[],
  reminderLabels: string[],
  isDateSelected: (menuLabel: string, dateLabels: string[]) => boolean,
): boolean => {
  if (menuLabel === REMINDER_PICKER_LABEL) {
    return hasTodoReminderTime(reminderLabels);
  }

  if (menuLabel === REPEAT_PICKER_LABEL) {
    return hasTodoRepeat(reminderLabels);
  }

  return isDateSelected(menuLabel, dateLabels);
};

export const getDatePickerMenuDisplayLabel = (
  menuLabel: string,
  dateLabels: string[],
  reminderLabels: string[],
  getDateDisplayLabel: (menuLabel: string, dateLabels: string[]) => string,
): string => {
  if (menuLabel === REMINDER_PICKER_LABEL) {
    return formatReminderTimeMenuLabel(reminderLabels);
  }

  if (menuLabel === REPEAT_PICKER_LABEL) {
    return formatRepeatMenuLabel(reminderLabels);
  }

  return getDateDisplayLabel(menuLabel, dateLabels);
};

export const isReminderPickerMenuLabel = (label: string): boolean =>
  label === REMINDER_PICKER_LABEL || label === REPEAT_PICKER_LABEL;
