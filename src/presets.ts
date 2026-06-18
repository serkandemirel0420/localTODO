import {
  DEFAULT_QUICK_PRESET_NAV_ICON_NAMES,
  QUICK_PRESET_NAV_MAX_SLOT_COUNT,
  type ListOrderMode,
  type QuickPresetNavIconNames,
  type QuickPresetNavPresetIds,
  type StoredListMenuNode,
  type StoredMenuPreset,
  type TodoGroupMode,
  type TodoSortMode,
} from './storage/appSettingsStore';
import { cloneTodoFilters } from './todos';

export type QuickPresetNavItem = {
  iconName: string;
  id: string;
  // Index into the persisted quick-nav arrays and Settings list tree. This is
  // different from `slotNumber` whenever hidden Settings lists are skipped.
  navIndex: number;
  preset: StoredMenuPreset | null;
  presetId: string | null;
  slotNumber: number;
};

export const QUICK_LIST_PRESET_ID_PREFIX = 'quick-list-preset:';

const DEFAULT_LIST_NAV_PRESET_GROUP_MODE: TodoGroupMode = 'none';
const DEFAULT_LIST_NAV_PRESET_SORT_MODE: TodoSortMode = 'newest';

export const normalizeQuickListPresetLabel = (label: string) => label.trim().toLowerCase();

export const getQuickListPresetId = (label: string) =>
  `${QUICK_LIST_PRESET_ID_PREFIX}${normalizeQuickListPresetLabel(label)}`;

// Quick navbar list shortcuts use the same shape as saved presets so filtering,
// grouping, sorting, and the "update this icon" flow can reuse one code path.
export const createQuickListPreset = (
  list: StoredListMenuNode,
  listOrderMode: ListOrderMode,
): StoredMenuPreset => ({
  id: getQuickListPresetId(list.label),
  label: list.label,
  filters: {
    date: [],
    list: [list.label],
    priority: [],
    reminder: [],
  },
  requiredFilters: cloneTodoFilters(),
  avoidedFilters: cloneTodoFilters(),
  listOrderMode,
  todoGroupMode: list.groupMode ?? DEFAULT_LIST_NAV_PRESET_GROUP_MODE,
  todoSortMode: list.sortMode ?? DEFAULT_LIST_NAV_PRESET_SORT_MODE,
  createdAt: 0,
});

export const isListScopedPreset = (preset: StoredMenuPreset | null | undefined) =>
  Boolean(preset && preset.filters.list.length > 0);

// If the user has saved a preset named exactly like a list, prefer it over the
// generated shortcut so their custom sort/group choices win.
export const buildMenuPresetByListLabel = (menuPresets: StoredMenuPreset[]) => {
  const presetsByLabel = new Map<string, StoredMenuPreset>();

  menuPresets.forEach((preset) => {
    const listLabel = preset.filters.list.length === 1 ? preset.filters.list[0] : null;
    const normalizedLabel = listLabel ? normalizeQuickListPresetLabel(listLabel) : '';

    if (normalizedLabel && normalizeQuickListPresetLabel(preset.label) === normalizedLabel) {
      presetsByLabel.set(normalizedLabel, preset);
    }
  });

  return presetsByLabel;
};

export const getQuickPresetNavSlotLimit = (
  listMenuTree: StoredListMenuNode[],
  quickPresetNavIconNames: QuickPresetNavIconNames,
  quickPresetNavPresetIds: QuickPresetNavPresetIds,
) => Math.min(
  Math.max(
    DEFAULT_QUICK_PRESET_NAV_ICON_NAMES.length,
    quickPresetNavIconNames.length,
    quickPresetNavPresetIds.length,
    listMenuTree.length,
  ),
  QUICK_PRESET_NAV_MAX_SLOT_COUNT,
);

export const resolveQuickPresetNavSlotIconName = (
  slotIndex: number,
  listMenuTree: StoredListMenuNode[],
  quickPresetNavIconName?: string,
): string => {
  const listAtSettingsIndex = listMenuTree[slotIndex];

  return listAtSettingsIndex?.iconName
    ?? quickPresetNavIconName
    ?? DEFAULT_QUICK_PRESET_NAV_ICON_NAMES[
      slotIndex % DEFAULT_QUICK_PRESET_NAV_ICON_NAMES.length
    ]
    ?? 'star-four-points';
};

export const buildQuickPresetNavItems = ({
  listMenuTree,
  listOrderMode,
  menuPresetById,
  menuPresetByListLabel,
  quickPresetNavIconNames,
  quickPresetNavPresetIds,
}: {
  listMenuTree: StoredListMenuNode[];
  listOrderMode: ListOrderMode;
  menuPresetById: Map<string, StoredMenuPreset>;
  menuPresetByListLabel: Map<string, StoredMenuPreset>;
  quickPresetNavIconNames: QuickPresetNavIconNames;
  quickPresetNavPresetIds: QuickPresetNavPresetIds;
}): QuickPresetNavItem[] => {
  const slotLimit = getQuickPresetNavSlotLimit(
    listMenuTree,
    quickPresetNavIconNames,
    quickPresetNavPresetIds,
  );
  const usesAutomaticSlots =
    quickPresetNavPresetIds.length === 0 && quickPresetNavIconNames.length === 0;
  const slotCount = usesAutomaticSlots
    ? Math.min(Math.max(DEFAULT_QUICK_PRESET_NAV_ICON_NAMES.length, listMenuTree.length), slotLimit)
    : Math.min(
      Math.max(quickPresetNavPresetIds.length, quickPresetNavIconNames.length, listMenuTree.length, 1),
      slotLimit,
    );
  const items: QuickPresetNavItem[] = [];

  for (let index = 0; index < slotCount; index += 1) {
    const list = listMenuTree[index];
    if (!usesAutomaticSlots && list?.showInNavbar === false) {
      continue;
    }

    // Explicit saved-preset assignments are honored, then each visible Settings
    // list falls back to a generated list shortcut. Nothing hardcoded is needed.
    const explicitPresetId = usesAutomaticSlots ? null : quickPresetNavPresetIds[index] ?? null;
    const explicitPreset = explicitPresetId ? menuPresetById.get(explicitPresetId) ?? null : null;
    const listPreset = !explicitPreset && list
      ? menuPresetByListLabel.get(normalizeQuickListPresetLabel(list.label))
        ?? createQuickListPreset(list, listOrderMode)
      : null;
    const preset = explicitPreset ?? listPreset;

    items.push({
      iconName: resolveQuickPresetNavSlotIconName(
        index,
        listMenuTree,
        usesAutomaticSlots ? undefined : quickPresetNavIconNames[index],
      ),
      id: `quick-preset-slot-${index + 1}`,
      navIndex: index,
      preset,
      presetId: preset?.id ?? explicitPresetId,
      slotNumber: items.length + 1,
    });
  }

  return items;
};
