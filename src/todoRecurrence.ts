import {
  CUSTOM_DATE_LABEL,
  formatDateFilterValue,
  LATER_DATE_LABEL,
  parseISODateLabel,
  startOfDay,
  toISODateString,
} from './dates';
import { decodeTodoReminder, type RepeatPreset } from './reminders';
import { cloneTodoFilters, type Todo } from './todos';

const RELATIVE_DATE_OFFSETS: Record<string, number> = {
  today: 0,
  tomorrow: 1,
  'this week': 2,
  'next week': 7,
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return startOfDay(next);
};

const getDaysInMonth = (year: number, month: number): number =>
  new Date(year, month + 1, 0).getDate();

const addMonths = (date: Date, months: number): Date => {
  const next = new Date(date);
  const targetMonthStart = new Date(next.getFullYear(), next.getMonth() + months, 1);
  const targetDay = Math.min(
    next.getDate(),
    getDaysInMonth(targetMonthStart.getFullYear(), targetMonthStart.getMonth()),
  );

  targetMonthStart.setDate(targetDay);
  return startOfDay(targetMonthStart);
};

const addYears = (date: Date, years: number): Date => {
  const next = new Date(date);
  const targetYear = next.getFullYear() + years;
  const targetDay = Math.min(next.getDate(), getDaysInMonth(targetYear, next.getMonth()));

  return startOfDay(new Date(targetYear, next.getMonth(), targetDay));
};

const resolveTodoDate = (dateLabels: string[], now = new Date()): Date | null => {
  const label = dateLabels[0]?.trim();
  const normalizedLabel = label ? formatDateFilterValue(label) : '';

  if (
    !normalizedLabel
    || normalizedLabel === LATER_DATE_LABEL
    || normalizedLabel === CUSTOM_DATE_LABEL
  ) {
    return null;
  }

  const customDate = parseISODateLabel(normalizedLabel);
  if (customDate) {
    return startOfDay(customDate);
  }

  const dayOffset = RELATIVE_DATE_OFFSETS[normalizedLabel.toLocaleLowerCase()];
  if (dayOffset === undefined) {
    return null;
  }

  return addDays(startOfDay(now), dayOffset);
};

const addRepeatInterval = (date: Date, repeat: Exclude<RepeatPreset, 'none'>): Date => {
  if (repeat === 'daily') {
    return addDays(date, 1);
  }

  if (repeat === 'weekly') {
    return addDays(date, 7);
  }

  if (repeat === 'monthly') {
    return addMonths(date, 1);
  }

  return addYears(date, 1);
};

const getNextRepeatDateLabel = (
  dateLabels: string[],
  repeat: Exclude<RepeatPreset, 'none'>,
  now = new Date(),
): string => {
  const today = startOfDay(now);
  let nextDate = addRepeatInterval(resolveTodoDate(dateLabels, now) ?? today, repeat);
  let safety = 0;

  while (nextDate.getTime() <= today.getTime() && safety < 5000) {
    nextDate = addRepeatInterval(nextDate, repeat);
    safety += 1;
  }

  return toISODateString(nextDate);
};

export const advanceRepeatingTodoAfterDone = (
  todo: Todo,
  now = new Date(),
): Todo | null => {
  const { repeat } = decodeTodoReminder(todo.filters.reminder);
  if (repeat === 'none') {
    return null;
  }

  return {
    ...todo,
    done: false,
    filters: {
      ...cloneTodoFilters(todo.filters),
      date: [getNextRepeatDateLabel(todo.filters.date, repeat, now)],
    },
  };
};
