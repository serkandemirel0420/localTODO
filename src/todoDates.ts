import {
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

  if (todo.filters.date.length === 0) {
    const fallbackDate = Number.isFinite(todo.createdAt)
      ? new Date(todo.createdAt)
      : now;

    return [toISODateString(startOfDay(fallbackDate))];
  }

  return todo.filters.date;
};
