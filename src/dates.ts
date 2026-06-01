export const SOMEDAY_DATE_LABEL = 'Someday';

export const DATE_FILTER_PRESETS = [
  'Today',
  'Tomorrow',
  'This Week',
  'Next Week',
  SOMEDAY_DATE_LABEL,
] as const;

const DATE_PRESET_LABELS: Record<string, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  'this week': 'This Week',
  'next week': 'Next Week',
  someday: SOMEDAY_DATE_LABEL,
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const capitalizeWords = (value: string) =>
  value
    .split(/\s+/)
    .map((word) => (
      word ? word.charAt(0).toLocaleUpperCase() + word.slice(1) : word
    ))
    .join(' ');

export const formatDateFilterValue = (value: string): string => {
  const trimmed = value.trim();

  if (!trimmed || isCustomDateLabel(trimmed)) {
    return trimmed;
  }

  return DATE_PRESET_LABELS[trimmed.toLocaleLowerCase()] ?? capitalizeWords(trimmed);
};

export const isCustomDateLabel = (label: string): boolean => ISO_DATE_PATTERN.test(label);

export const toISODateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

export const parseISODateLabel = (label: string): Date | null => {
  if (!isCustomDateLabel(label)) {
    return null;
  }

  const [year, month, day] = label.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }

  return date;
};

export const formatDateFilterLabel = (label: string): string => {
  if (label === SOMEDAY_DATE_LABEL) {
    return 'Someday';
  }

  const customDate = parseISODateLabel(label);
  if (customDate) {
    return customDate.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  return formatDateFilterValue(label);
};

export const startOfDay = (date: Date): Date => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);

  return next;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_SORT_SOMEDAY_RANK = 8_000_000_000_000_000;
const DATE_SORT_NO_DATE_RANK = DATE_SORT_SOMEDAY_RANK + 1;
const RELATIVE_DATE_FILTER_DAY_OFFSETS: Record<string, number> = {
  today: 0,
  tomorrow: 1,
  'this week': 2,
  'next week': 7,
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);

  return next;
};

export const getDateFilterSortRank = (label: string, now = new Date()): number => {
  const trimmed = label.trim();

  if (!trimmed) {
    return DATE_SORT_NO_DATE_RANK;
  }

  const customDate = parseISODateLabel(trimmed);
  if (customDate) {
    return startOfDay(customDate).getTime();
  }

  const normalizedLabel = formatDateFilterValue(trimmed).toLocaleLowerCase();

  if (normalizedLabel === 'someday') {
    return DATE_SORT_SOMEDAY_RANK;
  }

  const dayOffset = RELATIVE_DATE_FILTER_DAY_OFFSETS[normalizedLabel];
  if (dayOffset !== undefined) {
    return addDays(startOfDay(now), dayOffset).getTime();
  }

  return DATE_SORT_NO_DATE_RANK;
};

/** Short labels for list meta and group headers (Today, Yesterday, May 30). */
export const formatCompactDateFilterLabel = (label: string): string => {
  if (label === SOMEDAY_DATE_LABEL) {
    return 'Someday';
  }

  const customDate = parseISODateLabel(label);
  if (customDate) {
    const dayOffset = Math.round(
      (startOfDay(customDate).getTime() - startOfDay(new Date()).getTime()) / DAY_MS,
    );

    if (dayOffset === 0) {
      return 'Today';
    }

    if (dayOffset === 1) {
      return 'Tomorrow';
    }

    if (dayOffset === -1) {
      return 'Yesterday';
    }

    return customDate.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }

  return label;
};

export const formatCreatedMetaLabel = (createdAt: number): string => {
  const createdDay = startOfDay(new Date(createdAt));
  const dayOffset = Math.round(
    (createdDay.getTime() - startOfDay(new Date()).getTime()) / DAY_MS,
  );

  if (dayOffset === 0) {
    return 'Today';
  }

  if (dayOffset === -1) {
    return 'Yesterday';
  }

  return createdDay.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};

export const isDateFilterOverdue = (label: string): boolean => {
  const parsed = parseISODateLabel(label);
  if (!parsed) {
    return false;
  }

  return startOfDay(parsed).getTime() < startOfDay(new Date()).getTime();
};

export const getInitialDatePickerValue = (dateLabels: string[]): Date => {
  const custom = getSelectedCustomDateLabel(dateLabels);
  if (!custom) {
    return startOfDay(new Date());
  }

  return parseISODateLabel(custom) ?? startOfDay(new Date());
};

export const getSelectedCustomDateLabel = (dateLabels: string[]): string | null => (
  dateLabels.find(isCustomDateLabel) ?? null
);

export const isDateMenuItemSelected = (menuLabel: string, dateLabels: string[]): boolean => {
  if (dateLabels.includes(menuLabel)) {
    return true;
  }

  return menuLabel === SOMEDAY_DATE_LABEL && dateLabels.some(isCustomDateLabel);
};

export const getDateMenuItemDisplayLabel = (menuLabel: string, dateLabels: string[]): string => {
  if (menuLabel === SOMEDAY_DATE_LABEL) {
    const customDate = getSelectedCustomDateLabel(dateLabels);
    if (customDate) {
      return formatDateFilterLabel(customDate);
    }
  }

  return menuLabel;
};

export const getDateMenuClearValue = (menuLabel: string, dateLabels: string[]): string | null => {
  if (menuLabel === SOMEDAY_DATE_LABEL) {
    return getSelectedCustomDateLabel(dateLabels)
      ?? (dateLabels.includes(SOMEDAY_DATE_LABEL) ? SOMEDAY_DATE_LABEL : null);
  }

  return dateLabels.includes(menuLabel) ? menuLabel : null;
};

export const getDateMenuColorLookupValue = (menuLabel: string, dateLabels: string[]): string => {
  if (menuLabel === SOMEDAY_DATE_LABEL && dateLabels.some(isCustomDateLabel)) {
    return SOMEDAY_DATE_LABEL;
  }

  return menuLabel;
};
