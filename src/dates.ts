export const CUSTOM_DATE_LABEL = 'Custom date';
export const DATED_DATE_LABEL = 'Dated items';
export const LATER_DATE_LABEL = 'Later';
export const OVERDUE_DATE_LABEL = 'Overdue';
export const SOMEDAY_DATE_LABEL = 'Someday';

export type DateLabelDisplayMode = 'exact' | 'remaining';

export const DATE_FILTER_PRESETS = [
  'Today',
  'Tomorrow',
  'This Week',
  'Next Week',
  LATER_DATE_LABEL,
  CUSTOM_DATE_LABEL,
] as const;

const DATE_PRESET_LABELS: Record<string, string> = {
  custom: CUSTOM_DATE_LABEL,
  'custom date': CUSTOM_DATE_LABEL,
  dated: DATED_DATE_LABEL,
  'dated items': DATED_DATE_LABEL,
  hasdate: DATED_DATE_LABEL,
  'has date': DATED_DATE_LABEL,
  later: LATER_DATE_LABEL,
  overdue: OVERDUE_DATE_LABEL,
  someday: LATER_DATE_LABEL,
  today: 'Today',
  tomorrow: 'Tomorrow',
  'this week': 'This Week',
  thisweek: 'This Week',
  'next week': 'Next Week',
  nextweek: 'Next Week',
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
  const formattedLabel = formatDateFilterValue(label);

  if (formattedLabel === LATER_DATE_LABEL || formattedLabel === CUSTOM_DATE_LABEL) {
    return formattedLabel;
  }

  const customDate = parseISODateLabel(formattedLabel);
  if (customDate) {
    return customDate.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  return formattedLabel;
};

export const startOfDay = (date: Date): Date => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);

  return next;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_SORT_LATER_RANK = 8_000_000_000_000_000;
const DATE_SORT_NO_DATE_RANK = DATE_SORT_LATER_RANK + 1;
const RELATIVE_DATE_FILTER_DAY_OFFSETS: Record<string, number> = {
  today: 0,
  tomorrow: 1,
  'this week': 2,
  'next week': 7,
};
const EXACT_DATE_FILTER_DAY_OFFSETS: Record<string, number> = {
  today: 0,
  tomorrow: 1,
};
const EXACT_DATE_MENU_SHORTCUT_LABELS = new Set(['Today', 'Tomorrow']);

export type DateLabelAnchor = Date | number | null | undefined;

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);

  return next;
};

const getDateLabelAnchorDay = (
  anchor: DateLabelAnchor,
  now = new Date(),
): Date => {
  if (anchor instanceof Date && Number.isFinite(anchor.getTime())) {
    return startOfDay(anchor);
  }

  if (typeof anchor === 'number' && Number.isFinite(anchor)) {
    return startOfDay(new Date(anchor));
  }

  return startOfDay(now);
};

export const resolveDateFilterValueDate = (
  label: string,
  now = new Date(),
  anchor?: DateLabelAnchor,
): Date | null => {
  const formattedLabel = formatDateFilterValue(label);

  if (
    !formattedLabel
    || formattedLabel === DATED_DATE_LABEL
    || formattedLabel === OVERDUE_DATE_LABEL
    || formattedLabel === LATER_DATE_LABEL
    || formattedLabel === CUSTOM_DATE_LABEL
  ) {
    return null;
  }

  const customDate = parseISODateLabel(formattedLabel);
  if (customDate) {
    return startOfDay(customDate);
  }

  const dayOffset = RELATIVE_DATE_FILTER_DAY_OFFSETS[formattedLabel.toLocaleLowerCase()];
  if (dayOffset === undefined) {
    return null;
  }

  return addDays(getDateLabelAnchorDay(anchor, now), dayOffset);
};

export const freezeDateFilterValue = (
  label: string,
  anchor: DateLabelAnchor = new Date(),
): string => {
  const formattedLabel = formatDateFilterValue(label);

  if (!formattedLabel) {
    return '';
  }

  const resolvedDate = resolveDateFilterValueDate(formattedLabel, new Date(), anchor);
  if (resolvedDate) {
    return toISODateString(resolvedDate);
  }

  return formattedLabel;
};

export const getDateFilterSortRank = (
  label: string,
  now = new Date(),
  anchor?: DateLabelAnchor,
): number => {
  const trimmed = label.trim();

  if (!trimmed) {
    return DATE_SORT_NO_DATE_RANK;
  }

  const normalizedLabel = formatDateFilterValue(trimmed).toLocaleLowerCase();

  if (normalizedLabel === LATER_DATE_LABEL.toLocaleLowerCase()) {
    return DATE_SORT_LATER_RANK;
  }

  const resolvedDate = resolveDateFilterValueDate(trimmed, now, anchor);
  if (resolvedDate) {
    return resolvedDate.getTime();
  }

  return DATE_SORT_NO_DATE_RANK;
};

const getDateLabelDayOffset = (
  label: string,
  now = new Date(),
  anchor?: DateLabelAnchor,
): number | null => {
  const formattedLabel = formatDateFilterValue(label);

  if (
    formattedLabel === DATED_DATE_LABEL ||
    formattedLabel === OVERDUE_DATE_LABEL
    || formattedLabel === LATER_DATE_LABEL
    || formattedLabel === CUSTOM_DATE_LABEL
  ) {
    return null;
  }

  const resolvedDate = resolveDateFilterValueDate(formattedLabel, now, anchor);
  if (resolvedDate) {
    return Math.round(
      (resolvedDate.getTime() - startOfDay(now).getTime()) / DAY_MS,
    );
  }

  return null;
};

export const formatRemainingDaysLabel = (
  label: string,
  now = new Date(),
  anchor?: DateLabelAnchor,
): string | null => {
  const formattedLabel = formatDateFilterValue(label);

  if (
    formattedLabel === DATED_DATE_LABEL ||
    formattedLabel === OVERDUE_DATE_LABEL
    || formattedLabel === LATER_DATE_LABEL
    || formattedLabel === CUSTOM_DATE_LABEL
  ) {
    return formattedLabel === CUSTOM_DATE_LABEL ? null : formattedLabel;
  }

  const dayOffset = getDateLabelDayOffset(label, now, anchor);
  if (dayOffset === null) {
    return null;
  }

  if (dayOffset === 0) {
    return 'Today';
  }

  if (dayOffset === 1) {
    return 'Tomorrow';
  }

  if (dayOffset === -1) {
    return '1 day ago';
  }

  if (dayOffset > 1) {
    return `${dayOffset} days`;
  }

  return `${Math.abs(dayOffset)} days ago`;
};

export const formatOverdueDaysLabel = (
  label: string,
  now = new Date(),
  anchor?: DateLabelAnchor,
): string | null => {
  const dayOffset = getDateLabelDayOffset(label, now, anchor);
  if (dayOffset === null || dayOffset >= 0) {
    return null;
  }

  const overdueDays = Math.abs(dayOffset);
  return `${overdueDays} ${overdueDays === 1 ? 'day' : 'days'} overdue`;
};

export const formatDateDisplayLabel = (
  label: string,
  mode: DateLabelDisplayMode = 'exact',
  now = new Date(),
  anchor?: DateLabelAnchor,
): string => {
  if (mode === 'remaining') {
    const remainingLabel = formatRemainingDaysLabel(label, now, anchor);
    if (remainingLabel) {
      return remainingLabel;
    }
  }

  return formatCompactDateFilterLabel(label, now, anchor);
};

/** Short labels for list meta and group headers (Today, Yesterday, May 30). */
export const formatCompactDateFilterLabel = (
  label: string,
  now = new Date(),
  anchor?: DateLabelAnchor,
): string => {
  const formattedLabel = formatDateFilterValue(label);

  if (
    formattedLabel === DATED_DATE_LABEL ||
    formattedLabel === OVERDUE_DATE_LABEL
    || formattedLabel === LATER_DATE_LABEL
    || formattedLabel === CUSTOM_DATE_LABEL
  ) {
    return formattedLabel;
  }

  const customDate = parseISODateLabel(formattedLabel);
  const exactDayOffset = EXACT_DATE_FILTER_DAY_OFFSETS[formattedLabel.toLocaleLowerCase()];
  const date = customDate
    ? startOfDay(customDate)
    : exactDayOffset !== undefined
      ? addDays(getDateLabelAnchorDay(anchor, now), exactDayOffset)
      : null;

  if (date) {
    const dayOffset = Math.round(
      (date.getTime() - startOfDay(now).getTime()) / DAY_MS,
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

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }

  return formattedLabel;
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

export const isDateFilterOverdue = (
  label: string,
  now = new Date(),
  anchor?: DateLabelAnchor,
): boolean => {
  const resolvedDate = resolveDateFilterValueDate(label, now, anchor);
  if (!resolvedDate) {
    return false;
  }

  return resolvedDate.getTime() < startOfDay(now).getTime();
};

export const isDateFilterDueToday = (
  label: string,
  now = new Date(),
  anchor?: DateLabelAnchor,
): boolean => {
  const resolvedDate = resolveDateFilterValueDate(label, now, anchor);
  if (!resolvedDate) {
    return false;
  }

  return resolvedDate.getTime() === startOfDay(now).getTime();
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

export const isSameCalendarDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth()
  && a.getDate() === b.getDate();

const dateFilterValuesResolveToSameDay = (
  firstLabel: string,
  secondLabel: string,
  now = new Date(),
): boolean => {
  const firstDate = resolveDateFilterValueDate(firstLabel, now);
  const secondDate = resolveDateFilterValueDate(secondLabel, now);

  return Boolean(firstDate && secondDate && isSameCalendarDay(firstDate, secondDate));
};

const getExactDateFilterValueDate = (
  label: string,
  now = new Date(),
  anchor?: DateLabelAnchor,
): Date | null => {
  const formattedLabel = formatDateFilterValue(label);
  const customDate = parseISODateLabel(formattedLabel);
  if (customDate) {
    return startOfDay(customDate);
  }

  const dayOffset = EXACT_DATE_FILTER_DAY_OFFSETS[formattedLabel.toLocaleLowerCase()];
  if (dayOffset === undefined) {
    return null;
  }

  return addDays(getDateLabelAnchorDay(anchor, now), dayOffset);
};

export const isLaterDateFilterValue = (
  label: string,
  now = new Date(),
  anchor?: DateLabelAnchor,
): boolean => {
  const formattedLabel = formatDateFilterValue(label);

  if (formattedLabel === LATER_DATE_LABEL) {
    return true;
  }

  const resolvedDate = resolveDateFilterValueDate(formattedLabel, now, anchor);
  if (resolvedDate) {
    return resolvedDate.getTime() > startOfDay(now).getTime();
  }

  return false;
};

export const dateFilterValueMatches = (
  todoDateLabel: string,
  selectedDateLabel: string,
  now = new Date(),
  todoDateAnchor?: DateLabelAnchor,
): boolean => {
  const todoDateValue = formatDateFilterValue(todoDateLabel);
  const selectedDateValue = formatDateFilterValue(selectedDateLabel);

  if (!todoDateValue || !selectedDateValue || selectedDateValue === CUSTOM_DATE_LABEL) {
    return false;
  }

  if (selectedDateValue === DATED_DATE_LABEL) {
    return true;
  }

  if (selectedDateValue === OVERDUE_DATE_LABEL) {
    return isDateFilterOverdue(todoDateValue, now, todoDateAnchor);
  }

  if (selectedDateValue === LATER_DATE_LABEL) {
    return isLaterDateFilterValue(todoDateValue, now, todoDateAnchor);
  }

  const selectedExactDate = getExactDateFilterValueDate(selectedDateValue, now);
  const todoExactDate = getExactDateFilterValueDate(todoDateValue, now, todoDateAnchor);

  if (selectedExactDate || todoExactDate) {
    return Boolean(
      selectedExactDate
      && todoExactDate
      && isSameCalendarDay(todoExactDate, selectedExactDate),
    );
  }

  return todoDateValue === selectedDateValue;
};

export const todoMatchesSelectedDateFilters = (
  todoDateLabels: string[],
  selectedDateLabels: string[],
  now = new Date(),
  todoDateAnchor?: DateLabelAnchor,
): boolean => {
  if (selectedDateLabels.length === 0) {
    return true;
  }

  return selectedDateLabels.some((selectedLabel) =>
    todoDateLabels.some((todoLabel) =>
      dateFilterValueMatches(todoLabel, selectedLabel, now, todoDateAnchor),
    ),
  );
};

export const isDateMenuItemSelected = (menuLabel: string, dateLabels: string[]): boolean => {
  const formattedMenuLabel = formatDateFilterValue(menuLabel);
  if (dateLabels.some((label) => formatDateFilterValue(label) === formattedMenuLabel)) {
    return true;
  }

  if (formattedMenuLabel === CUSTOM_DATE_LABEL) {
    return dateLabels.some(isCustomDateLabel);
  }

  if (!EXACT_DATE_MENU_SHORTCUT_LABELS.has(formattedMenuLabel)) {
    return false;
  }

  return dateLabels.some((label) =>
    dateFilterValuesResolveToSameDay(formattedMenuLabel, label),
  );
};

export const getDateMenuItemDisplayLabel = (
  menuLabel: string,
  dateLabels: string[],
  mode: DateLabelDisplayMode = 'exact',
  now = new Date(),
): string => {
  if (formatDateFilterValue(menuLabel) === CUSTOM_DATE_LABEL) {
    const customDate = getSelectedCustomDateLabel(dateLabels);
    if (customDate) {
      if (mode === 'remaining') {
        const remainingLabel = formatRemainingDaysLabel(customDate, now);
        if (remainingLabel) {
          return remainingLabel;
        }
      }

      const compactLabel = formatCompactDateFilterLabel(customDate, now);
      if (compactLabel === 'Today' || compactLabel === 'Tomorrow' || compactLabel === 'Yesterday') {
        return compactLabel;
      }

      return formatDateFilterLabel(customDate);
    }
  }

  if (mode === 'remaining') {
    const remainingLabel = formatRemainingDaysLabel(menuLabel, now);
    if (remainingLabel) {
      return remainingLabel;
    }
  }

  return formatDateFilterLabel(menuLabel);
};

export const getDateMenuClearValue = (menuLabel: string, dateLabels: string[]): string | null => {
  const formattedMenuLabel = formatDateFilterValue(menuLabel);

  if (formattedMenuLabel === CUSTOM_DATE_LABEL) {
    return getSelectedCustomDateLabel(dateLabels);
  }

  return dateLabels.find((label) =>
    formatDateFilterValue(label) === formattedMenuLabel ||
    (
      EXACT_DATE_MENU_SHORTCUT_LABELS.has(formattedMenuLabel) &&
      dateFilterValuesResolveToSameDay(formattedMenuLabel, label)
    ),
  ) ?? null;
};

export const getDateMenuColorLookupValue = (menuLabel: string, dateLabels: string[]): string => {
  const formattedMenuLabel = formatDateFilterValue(menuLabel);
  if (formattedMenuLabel === CUSTOM_DATE_LABEL && dateLabels.some(isCustomDateLabel)) {
    return CUSTOM_DATE_LABEL;
  }

  return formattedMenuLabel;
};

export const getDateMenuItemsForDateLabels = (
  menuLabels: string[],
  dateLabels: string[],
  now = new Date(),
  options: { sortSelectedCustomDate?: boolean } = {},
): string[] => {
  const customDate = getSelectedCustomDateLabel(dateLabels);
  if (!customDate) {
    return menuLabels;
  }

  const matchingShortcut = menuLabels.some((label) => {
    const formattedLabel = formatDateFilterValue(label);
    return (
      EXACT_DATE_MENU_SHORTCUT_LABELS.has(formattedLabel) &&
      dateFilterValuesResolveToSameDay(formattedLabel, customDate, now)
    );
  });

  const visibleMenuLabels = matchingShortcut
    ? menuLabels.filter((label) => formatDateFilterValue(label) !== CUSTOM_DATE_LABEL)
    : menuLabels;

  if (!options.sortSelectedCustomDate || !visibleMenuLabels.includes(CUSTOM_DATE_LABEL)) {
    return visibleMenuLabels;
  }

  const getSortableDateRank = (label: string): number | null => {
    const formattedLabel = formatDateFilterValue(label);

    if (formattedLabel === CUSTOM_DATE_LABEL) {
      return getDateFilterSortRank(customDate, now);
    }

    if (formattedLabel === LATER_DATE_LABEL) {
      return DATE_SORT_LATER_RANK;
    }

    const resolvedDate = resolveDateFilterValueDate(formattedLabel, now);
    return resolvedDate ? resolvedDate.getTime() : null;
  };

  return visibleMenuLabels
    .map((label, index) => ({
      index,
      label,
      rank: getSortableDateRank(label),
    }))
    .sort((first, second) => {
      if (first.rank === null && second.rank === null) {
        return first.index - second.index;
      }

      if (first.rank === null) {
        return 1;
      }

      if (second.rank === null) {
        return -1;
      }

      return first.rank - second.rank || first.index - second.index;
    })
    .map((item) => item.label);
};

const addCalendarDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return startOfDay(next);
};

export const getISOWeekNumber = (date: Date): number => {
  const target = startOfDay(date);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const weekYear = target.getFullYear();
  const firstThursday = new Date(weekYear, 0, 4);
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
};

export type CalendarCell = {
  date: Date;
  inCurrentMonth: boolean;
};

export const buildCalendarMonthGrid = (visibleMonth: Date): CalendarCell[][] => {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = addCalendarDays(firstOfMonth, -startOffset);

  const weeks: CalendarCell[][] = [];
  let cursor = new Date(gridStart);

  for (let week = 0; week < 6; week += 1) {
    const row: CalendarCell[] = [];
    for (let day = 0; day < 7; day += 1) {
      row.push({
        date: new Date(cursor),
        inCurrentMonth: cursor.getMonth() === month,
      });
      cursor = addCalendarDays(cursor, 1);
    }
    weeks.push(row);
  }

  return weeks;
};

export const formatCalendarMonthTitle = (date: Date): string =>
  date.toLocaleDateString(undefined, { month: 'long' });
