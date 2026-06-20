import { startOfDay, toISODateString } from './dates';
import { type FilterColorKey } from './filterColors';

export type MetaTagKey = 'createdAt' | 'date' | 'list' | 'priority';

export type HiddenMetaTagKind = FilterColorKey | 'created';

export type MetaTagVisibility = Record<MetaTagKey, boolean>;

export const META_TAG_KEYS: MetaTagKey[] = ['date', 'list', 'priority', 'createdAt'];

export const META_TAG_LABELS: Record<MetaTagKey, string> = {
  createdAt: 'Created',
  date: 'Date',
  list: 'List',
  priority: 'Priority',
};

export const DEFAULT_META_TAG_VISIBILITY: MetaTagVisibility = {
  createdAt: false,
  date: true,
  list: true,
  priority: false,
};

export const cloneMetaTagVisibility = (
  visibility: MetaTagVisibility = DEFAULT_META_TAG_VISIBILITY,
): MetaTagVisibility => ({
  createdAt: visibility.createdAt,
  date: visibility.date,
  list: visibility.list,
  priority: visibility.priority,
});

export const normalizeMetaTagVisibility = (value: unknown): MetaTagVisibility => {
  if (typeof value !== 'object' || value === null) {
    return cloneMetaTagVisibility();
  }

  const record = value as Partial<Record<MetaTagKey, unknown>>;

  return {
    createdAt: record.createdAt === true,
    date: record.date !== false,
    list: record.list !== false,
    priority: record.priority === true,
  };
};

export const metaTagVisibilityMatchesDefault = (visibility: MetaTagVisibility) =>
  META_TAG_KEYS.every((key) => visibility[key] === DEFAULT_META_TAG_VISIBILITY[key]);

export const metaTagVisibilityEqual = (
  left: MetaTagVisibility,
  right: MetaTagVisibility,
) => META_TAG_KEYS.every((key) => left[key] === right[key]);

export const applyHiddenMetaTagKinds = (
  visibility: MetaTagVisibility,
  hiddenKinds: readonly HiddenMetaTagKind[],
): MetaTagVisibility => ({
  createdAt: visibility.createdAt && !hiddenKinds.includes('created'),
  date: visibility.date && !hiddenKinds.includes('date'),
  list: visibility.list && !hiddenKinds.includes('list'),
  priority: visibility.priority && !hiddenKinds.includes('priority'),
});

export const formatMetaTagVisibilitySummary = (visibility: MetaTagVisibility) => {
  const enabledLabels = META_TAG_KEYS
    .filter((key) => visibility[key])
    .map((key) => META_TAG_LABELS[key]);

  if (enabledLabels.length === 0) {
    return 'None';
  }

  if (enabledLabels.length <= 2) {
    return enabledLabels.join(', ');
  }

  return `${enabledLabels.length} shown`;
};

export const formatCreatedAtMetaLabel = (createdAt: number) => {
  const createdDate = startOfDay(new Date(createdAt));
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (createdDate.getTime() === today.getTime()) {
    return 'Created today';
  }

  if (createdDate.getTime() === startOfDay(yesterday).getTime()) {
    return 'Created yesterday';
  }

  return `Created ${createdDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}`;
};

export const getCreatedAtMetaLookupValue = (createdAt: number) =>
  toISODateString(new Date(createdAt));
