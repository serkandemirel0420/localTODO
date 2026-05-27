import type { TodoFilters } from './todos';

export type FilterColorKey = keyof TodoFilters;

export type FilterColorSettings = {
  date: Record<string, string>;
  list: Record<string, string>;
  priority: Record<string, string>;
};

export type FilterColorSwatch = {
  accent: string;
  border: string;
  id: string;
  label: string;
  text: string;
  tint: string;
};

export type FilterColorTheme = FilterColorSwatch & {
  filterKey: FilterColorKey;
  value: string;
};

export const FILTER_COLOR_SWATCHES: FilterColorSwatch[] = [
  {
    accent: '#CF413A',
    border: '#F0C8C3',
    id: 'red',
    label: 'Red',
    text: '#7E2B25',
    tint: '#FFF0EE',
  },
  {
    accent: '#D77B30',
    border: '#F0D2B8',
    id: 'orange',
    label: 'Orange',
    text: '#7A4219',
    tint: '#FFF3E8',
  },
  {
    accent: '#C4A24A',
    border: '#E9DBA8',
    id: 'amber',
    label: 'Amber',
    text: '#6A5520',
    tint: '#FFF9E8',
  },
  {
    accent: '#6B8F71',
    border: '#CADCCB',
    id: 'olive',
    label: 'Olive',
    text: '#38533C',
    tint: '#F1F8F1',
  },
  {
    accent: '#2F6F62',
    border: '#B8D8D0',
    id: 'forest',
    label: 'Forest',
    text: '#1C5A4E',
    tint: '#EDF4F0',
  },
  {
    accent: '#2F8AA0',
    border: '#B8DCE5',
    id: 'teal',
    label: 'Teal',
    text: '#1E5D6B',
    tint: '#EDF8FA',
  },
  {
    accent: '#3E78B2',
    border: '#BED5ED',
    id: 'blue',
    label: 'Blue',
    text: '#284F79',
    tint: '#EEF6FF',
  },
  {
    accent: '#6D62B7',
    border: '#D0CBEE',
    id: 'violet',
    label: 'Violet',
    text: '#453B82',
    tint: '#F3F1FF',
  },
  {
    accent: '#A56DB3',
    border: '#E1C9E7',
    id: 'plum',
    label: 'Plum',
    text: '#684371',
    tint: '#FBF0FF',
  },
  {
    accent: '#C24E66',
    border: '#EEC5CE',
    id: 'rose',
    label: 'Rose',
    text: '#793143',
    tint: '#FFF0F4',
  },
  {
    accent: '#6A6F90',
    border: '#D0D3E0',
    id: 'slate',
    label: 'Slate',
    text: '#41465F',
    tint: '#F3F4FA',
  },
  {
    accent: '#8C847C',
    border: '#DDD6CF',
    id: 'stone',
    label: 'Stone',
    text: '#5D564F',
    tint: '#F6F3EF',
  },
];

const DEFAULT_PRIORITY_COLORS: Record<string, string> = {
  High: '#CF413A',
  Low: '#2F6F62',
  Medium: '#D77B30',
  None: '#8C847C',
};

const DEFAULT_DATE_COLORS: Record<string, string> = {
  'Next week': '#6D62B7',
  Someday: '#8C847C',
  'This week': '#3E78B2',
  Today: '#2F6F62',
  Tomorrow: '#2F8AA0',
};

const DEFAULT_LIST_COLORS: Record<string, string> = {
  Active: '#2F6F62',
  Afternoon: '#D77B30',
  Archive: '#8C847C',
  Backlog: '#6A6F90',
  Bills: '#CF413A',
  Budget: '#C4A24A',
  Calls: '#2F8AA0',
  Cleaning: '#6B8F71',
  'Deep work': '#6D62B7',
  Errands: '#D77B30',
  Evening: '#6D62B7',
  Finance: '#C4A24A',
  'Follow ups': '#2F8AA0',
  Groceries: '#6B8F71',
  Health: '#2F6F62',
  Home: '#6B8F71',
  Household: '#A56DB3',
  Ideas: '#C4A24A',
  Inbox: '#2F6F62',
  Meetings: '#3E78B2',
  Morning: '#C4A24A',
  Personal: '#A56DB3',
  Planning: '#3E78B2',
  Priority: '#CF413A',
  Projects: '#6D62B7',
  'Quick capture': '#2F8AA0',
  Reading: '#6A6F90',
  Repairs: '#D77B30',
  Shopping: '#C24E66',
  Someday: '#8C847C',
  Today: '#2F6F62',
  Travel: '#2F8AA0',
  Upcoming: '#3E78B2',
  Unsorted: '#8C847C',
  Waiting: '#8C847C',
  Work: '#3E78B2',
};

export const DEFAULT_FILTER_COLORS: FilterColorSettings = {
  date: DEFAULT_DATE_COLORS,
  list: DEFAULT_LIST_COLORS,
  priority: DEFAULT_PRIORITY_COLORS,
};

const FILTER_COLOR_PRECEDENCE: FilterColorKey[] = ['priority', 'list', 'date'];
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizeHexColor = (value: unknown) =>
  typeof value === 'string' && HEX_COLOR_PATTERN.test(value)
    ? value.toUpperCase()
    : null;

const normalizeColorMap = (
  value: unknown,
  fallback: Record<string, string>,
): Record<string, string> => {
  const colors = { ...fallback };

  if (!isRecord(value)) {
    return colors;
  }

  Object.entries(value).forEach(([label, color]) => {
    const normalizedColor = normalizeHexColor(color);
    if (normalizedColor) {
      colors[label] = normalizedColor;
    }
  });

  return colors;
};

export const normalizeFilterColors = (value: unknown): FilterColorSettings => {
  const record = isRecord(value) ? value : {};

  return {
    date: normalizeColorMap(record.date, DEFAULT_FILTER_COLORS.date),
    list: normalizeColorMap(record.list, DEFAULT_FILTER_COLORS.list),
    priority: normalizeColorMap(record.priority, DEFAULT_FILTER_COLORS.priority),
  };
};

export const cloneFilterColors = (
  colors: FilterColorSettings = DEFAULT_FILTER_COLORS,
): FilterColorSettings => normalizeFilterColors(colors);

const findSwatchByColor = (color: string) =>
  FILTER_COLOR_SWATCHES.find(
    (swatch) => swatch.accent.toUpperCase() === color.toUpperCase(),
  );

const getFallbackSwatch = (value: string) => {
  const hash = value.split('').reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );

  return FILTER_COLOR_SWATCHES[hash % FILTER_COLOR_SWATCHES.length];
};

export const getFilterColor = (
  colors: FilterColorSettings,
  filterKey: FilterColorKey,
  value: string,
) => {
  const savedColor = normalizeHexColor(colors[filterKey]?.[value]);

  if (savedColor) {
    return savedColor;
  }

  const defaultColor = normalizeHexColor(DEFAULT_FILTER_COLORS[filterKey]?.[value]);

  if (defaultColor) {
    return defaultColor;
  }

  return getFallbackSwatch(value).accent;
};

export const getFilterColorTheme = (
  colors: FilterColorSettings,
  filterKey: FilterColorKey,
  value: string,
): FilterColorTheme => {
  const accent = getFilterColor(colors, filterKey, value);
  const swatch = findSwatchByColor(accent) ?? getFallbackSwatch(value);

  return {
    ...swatch,
    accent,
    filterKey,
    value,
  };
};

export const getTodoPrimaryColorTheme = (
  filters: TodoFilters,
  colors: FilterColorSettings,
) => {
  for (const filterKey of FILTER_COLOR_PRECEDENCE) {
    const value = filters[filterKey][0];

    if (value) {
      return getFilterColorTheme(colors, filterKey, value);
    }
  }

  return null;
};

export const getTodoColorThemes = (
  filters: TodoFilters,
  colors: FilterColorSettings,
) => {
  const seenColors = new Set<string>();

  return FILTER_COLOR_PRECEDENCE.flatMap((filterKey) =>
    filters[filterKey].map((value) => getFilterColorTheme(colors, filterKey, value)),
  ).filter((theme) => {
    const colorKey = theme.accent.toUpperCase();
    if (seenColors.has(colorKey)) {
      return false;
    }

    seenColors.add(colorKey);
    return true;
  });
};
