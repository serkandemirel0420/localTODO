import {
  resolveDateFilterValueDate,
  startOfDay,
  toISODateString,
} from './dates';
import { decodeTodoReminder } from './reminders';
import { type Todo } from './todos';

export const getEffectiveTodoDateLabels = (
  todo: Pick<Todo, 'createdAt' | 'filters'>,
  now = new Date(),
): string[] => {
  const { repeat } = decodeTodoReminder(todo.filters.reminder);
  if (repeat !== 'daily') {
    return todo.filters.date;
  }

  const today = startOfDay(now);
  const todayLabel = toISODateString(today);

  if (todo.filters.date.length === 0) {
    return [todayLabel];
  }

  const bestDate = todo.filters.date.reduce<Date | null>((currentBest, label) => {
    const resolvedDate = resolveDateFilterValueDate(label, now, todo.createdAt);
    if (!resolvedDate) {
      return currentBest;
    }

    if (!currentBest || resolvedDate.getTime() < currentBest.getTime()) {
      return resolvedDate;
    }

    return currentBest;
  }, null);

  if (bestDate && bestDate.getTime() < today.getTime()) {
    return [todayLabel];
  }

  return todo.filters.date;
};
