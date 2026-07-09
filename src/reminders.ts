export const REMINDER_PICKER_LABEL = 'Reminder';
export const HABIT_PICKER_LABEL = 'Habit';
export const REPEAT_PICKER_LABEL = 'Repeating';
export const REPEATING_ITEMS_FILTER_LABEL = 'Repeating items';
export const REPEATING_ITEMS_FILTER_VALUE = 'filter:repeating-items';
const LEGACY_NOT_REPEATING_ITEMS_FILTER_VALUE = 'filter:not-repeating-items';

export type RepeatPreset = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export const HABIT_INTERVAL_HOUR_OPTIONS = [1, 2, 3, 4, 6, 8, 12] as const;
export type HabitIntervalHours = typeof HABIT_INTERVAL_HOUR_OPTIONS[number];

export type ReminderTime = {
  hours: number;
  minutes: number;
};

export type TodoReminder = {
  habitHours?: HabitIntervalHours | null;
  time: ReminderTime | null;
  repeat: RepeatPreset;
};

export type HabitIntervalOption = {
  hours: HabitIntervalHours | null;
  label: string;
};

export const REPEAT_SHORTCUT_MENU_ITEMS = ['Weekly', 'Monthly'] as const;

export const REPEAT_PRESETS: Array<{ id: RepeatPreset; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
];

const REPEAT_PREFIX = 'repeat:';
const HABIT_PREFIX = 'habit:';
const REPEAT_STATUS_FILTER_VALUES = [
  REPEATING_ITEMS_FILTER_VALUE,
  LEGACY_NOT_REPEATING_ITEMS_FILTER_VALUE,
];
const REPEAT_SHORTCUT_MENU_PRESETS = new Set<RepeatPreset>(['weekly', 'monthly']);
const REPEAT_SHORTCUT_MENU_LABELS: Record<string, RepeatPreset> = {
  weekly: 'weekly',
  monthly: 'monthly',
};

const isRepeatPreset = (value: string): value is RepeatPreset =>
  REPEAT_PRESETS.some((preset) => preset.id === value);

export const getRepeatPresetForMenuLabel = (label: string): RepeatPreset | null =>
  REPEAT_SHORTCUT_MENU_LABELS[label.trim().toLocaleLowerCase()] ?? null;

export const isRepeatShortcutMenuLabel = (label: string): boolean =>
  getRepeatPresetForMenuLabel(label) !== null;

export const isRepeatShortcutPreset = (repeat: RepeatPreset): boolean =>
  REPEAT_SHORTCUT_MENU_PRESETS.has(repeat);

export const DEFAULT_REMINDER_TIME: ReminderTime = {
  hours: 9,
  minutes: 0,
};

export const DEFAULT_HABIT_INTERVAL_HOURS: HabitIntervalHours = 4;

export const DEFAULT_TODO_REMINDER: TodoReminder = {
  habitHours: null,
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

export const formatHabitIntervalLabel = (hours: HabitIntervalHours): string => (
  hours === 1 ? 'Every hour' : `Every ${hours} hours`
);

export const formatHabitIntervalShortLabel = (hours: HabitIntervalHours): string =>
  `${hours}h`;

export const HABIT_INTERVAL_OPTIONS: HabitIntervalOption[] = [
  { hours: null, label: 'None' },
  ...HABIT_INTERVAL_HOUR_OPTIONS.map((hours) => ({
    hours,
    label: formatHabitIntervalLabel(hours),
  })),
];

const normalizeHabitIntervalHours = (
  value: TodoReminder['habitHours'],
): HabitIntervalHours | null => (
  HABIT_INTERVAL_HOUR_OPTIONS.find((hours) => hours === value) ?? null
);

export const normalizeTodoReminder = (reminder: TodoReminder): TodoReminder => {
  const time = normalizeReminderTime(reminder.time);
  const repeat = isRepeatPreset(reminder.repeat) ? reminder.repeat : 'none';
  const habitHours = normalizeHabitIntervalHours(reminder.habitHours);

  return {
    habitHours,
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

const parseHabitPart = (value: string): HabitIntervalHours | null => {
  const match = /^(\d+)$/.exec(value);
  if (!match) {
    return null;
  }

  return normalizeHabitIntervalHours(Number(match[1]) as HabitIntervalHours);
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
  const repeatPart = normalized.repeat === 'none'
    ? null
    : `${REPEAT_PREFIX}${normalized.repeat}`;
  const habitPart = normalized.habitHours
    ? `${HABIT_PREFIX}${normalized.habitHours}`
    : null;

  if (!normalized.time && !repeatPart && !habitPart) {
    return [];
  }

  const extraParts = [repeatPart, habitPart].filter((part): part is string => Boolean(part));

  if (normalized.time) {
    const base = `${pad2(normalized.time.hours)}:${pad2(normalized.time.minutes)}`;
    if (extraParts.length === 0) {
      return [base];
    }

    return [`${base}|${extraParts.join('|')}`];
  }

  return [extraParts.join('|')];
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
  let habitHours: HabitIntervalHours | null = null;
  const repeatSegments = time ? segments.slice(1) : segments;
  repeatSegments.forEach((segment) => {
    if (segment.startsWith(REPEAT_PREFIX)) {
      const candidate = segment.slice(REPEAT_PREFIX.length);
      if (isRepeatPreset(candidate)) {
        repeat = candidate;
      }
    }

    if (segment.startsWith(HABIT_PREFIX)) {
      habitHours = parseHabitPart(segment.slice(HABIT_PREFIX.length));
    }
  });

  return normalizeTodoReminder({ habitHours, time, repeat });
};

export const hasTodoReminderTime = (values: string[]): boolean =>
  decodeTodoReminder(values).time !== null;

export const hasTodoHabitInterval = (values: string[]): boolean =>
  decodeTodoReminder(values).habitHours !== null;

export const hasTodoRepeat = (values: string[]): boolean =>
  decodeTodoReminder(values).repeat !== 'none' || hasTodoHabitInterval(values);

export const hasRepeatingItemsFilter = (values: string[]): boolean =>
  values.includes(REPEATING_ITEMS_FILTER_VALUE);

export const removeRepeatingItemsFilter = (values: string[]): string[] =>
  values.filter((value) => value !== REPEATING_ITEMS_FILTER_VALUE);

export const removeRepeatStatusFilters = (values: string[]): string[] =>
  values.filter((value) => !REPEAT_STATUS_FILTER_VALUES.includes(value));

export const toggleRepeatingItemsFilterValue = (values: string[]): string[] => {
  const reminderValues = removeRepeatStatusFilters(values);

  return hasRepeatingItemsFilter(values)
    ? reminderValues
    : [...reminderValues, REPEATING_ITEMS_FILTER_VALUE];
};

export const formatReminderTimeMenuLabel = (values: string[]): string => {
  const { time } = decodeTodoReminder(values);
  if (!time) {
    return REMINDER_PICKER_LABEL;
  }

  return formatReminderClockLabel(time);
};

export const formatHabitMenuLabel = (values: string[]): string => {
  const { habitHours } = decodeTodoReminder(values);
  if (!habitHours) {
    return HABIT_PICKER_LABEL;
  }

  return formatHabitIntervalLabel(habitHours);
};

export const formatRepeatMenuLabel = (values: string[]): string => {
  const { repeat } = decodeTodoReminder(values);
  if (repeat === 'none') {
    return REPEAT_PICKER_LABEL;
  }

  return formatRepeatLabel(repeat);
};

export const formatTodoReminderMetaLabel = (values: string[]): string | null => {
  const { habitHours, time, repeat } = decodeTodoReminder(values);
  if (habitHours) {
    return formatHabitIntervalLabel(habitHours);
  }

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
  const reminderValues = removeRepeatStatusFilters(values);
  const normalizedReminder = encodeTodoReminder(decodeTodoReminder(reminderValues));

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

  if (menuLabel === HABIT_PICKER_LABEL) {
    return hasTodoHabitInterval(reminderLabels);
  }

  const repeatShortcut = getRepeatPresetForMenuLabel(menuLabel);
  if (repeatShortcut) {
    return decodeTodoReminder(reminderLabels).repeat === repeatShortcut;
  }

  if (menuLabel === REPEAT_PICKER_LABEL) {
    const { repeat } = decodeTodoReminder(reminderLabels);
    return repeat !== 'none';
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

  if (menuLabel === HABIT_PICKER_LABEL) {
    return formatHabitMenuLabel(reminderLabels);
  }

  const repeatShortcut = getRepeatPresetForMenuLabel(menuLabel);
  if (repeatShortcut) {
    return formatRepeatLabel(repeatShortcut);
  }

  if (menuLabel === REPEAT_PICKER_LABEL) {
    return formatRepeatMenuLabel(reminderLabels);
  }

  return getDateDisplayLabel(menuLabel, dateLabels);
};

export const isReminderPickerMenuLabel = (label: string): boolean =>
  label === REMINDER_PICKER_LABEL ||
  label === HABIT_PICKER_LABEL ||
  label === REPEAT_PICKER_LABEL ||
  isRepeatShortcutMenuLabel(label);
