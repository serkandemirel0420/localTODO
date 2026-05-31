import { DATE_FILTER_PRESETS } from './dates';
import {
  type TodoGroupMode,
  type TodoSortMode,
} from './storage/appSettingsStore';

export const PRIORITY_MENU_ITEMS = ['High', 'Medium', 'Low', 'None'];
export const DATE_MENU_ITEMS: string[] = [...DATE_FILTER_PRESETS];

export const getBestOrderedFilterLabel = (
  values: string[],
  orderedLabels: string[],
  fallbackLabel: string,
) => {
  let bestLabel: string | null = null;
  let bestRank = Number.POSITIVE_INFINITY;

  values.forEach((value, index) => {
    const orderedIndex = orderedLabels.indexOf(value);
    const rank = orderedIndex >= 0 ? orderedIndex : orderedLabels.length + index;

    if (rank < bestRank) {
      bestRank = rank;
      bestLabel = value;
    }
  });

  return bestLabel ?? fallbackLabel;
};

export const TODO_SORT_OPTIONS: Array<{ label: string; mode: TodoSortMode }> = [
  { label: 'Newest first', mode: 'newest' },
  { label: 'Oldest first', mode: 'oldest' },
  { label: 'A to Z', mode: 'alphabetical' },
  { label: 'Priority', mode: 'priority' },
  { label: 'Date', mode: 'date' },
];

export const TODO_GROUP_OPTIONS: Array<{ label: string; mode: TodoGroupMode }> = [
  { label: 'None', mode: 'none' },
  { label: 'Priority', mode: 'priority' },
  { label: 'Date', mode: 'date' },
  { label: 'List', mode: 'list' },
  { label: 'Status', mode: 'status' },
];

export const TODO_SORT_LABELS: Record<TodoSortMode, string> = {
  alphabetical: 'A to Z',
  date: 'Date',
  newest: 'Newest',
  oldest: 'Oldest',
  priority: 'Priority',
};

export const TODO_GROUP_LABELS: Record<TodoGroupMode, string> = {
  date: 'Date',
  list: 'List',
  none: 'None',
  priority: 'Priority',
  status: 'Status',
};
