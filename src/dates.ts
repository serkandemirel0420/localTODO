export const SOMEDAY_DATE_LABEL = 'Someday';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

  return label;
};

export const startOfDay = (date: Date): Date => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);

  return next;
};

export const isDateFilterOverdue = (label: string): boolean => {
  const parsed = parseISODateLabel(label);
  if (!parsed) {
    return false;
  }

  return startOfDay(parsed).getTime() < startOfDay(new Date()).getTime();
};

export const getInitialDatePickerValue = (dateLabels: string[]): Date => {
  const custom = dateLabels.find(isCustomDateLabel);
  if (!custom) {
    return startOfDay(new Date());
  }

  return parseISODateLabel(custom) ?? startOfDay(new Date());
};
