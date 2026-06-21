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
import { resolveMaterialCommunityIconName } from './materialCommunityIconNames';
import { cloneTodoFilters } from './todos';

export type QuickPresetNavItem = {
  displayLabel: string;
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
) => {
  const groupMode = list.groupMode ?? DEFAULT_LIST_NAV_PRESET_GROUP_MODE;

  return {
    id: getQuickListPresetId(list.label),
    label: list.label,
    filters: {
      date: [],
      list: [list.label],
      priority: [],
      reminder: [],
      tag: [],
    },
    requiredFilters: cloneTodoFilters(),
    avoidedFilters: cloneTodoFilters(),
    listOrderMode,
    todoGroupMode: groupMode,
    todoSortMode: list.sortMode ?? DEFAULT_LIST_NAV_PRESET_SORT_MODE,
    createdAt: 0,
  };
};

export const isListScopedPreset = (preset: StoredMenuPreset | null | undefined) =>
  Boolean(preset && preset.filters.list.length > 0);

export const getQuickPresetNavSlotLimit = (
  listMenuTree: StoredListMenuNode[],
  menuPresets: StoredMenuPreset[],
  quickPresetNavIconNames: QuickPresetNavIconNames,
  quickPresetNavPresetIds: Array<string | null>,
) => Math.min(
  Math.max(
    DEFAULT_QUICK_PRESET_NAV_ICON_NAMES.length,
    menuPresets.length,
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
  const fallbackIconName = DEFAULT_QUICK_PRESET_NAV_ICON_NAMES[
    slotIndex % DEFAULT_QUICK_PRESET_NAV_ICON_NAMES.length
  ] ?? 'star-four-points';

  return resolveMaterialCommunityIconName(
    quickPresetNavIconName ?? listAtSettingsIndex?.iconName,
    fallbackIconName,
  );
};

export const buildQuickPresetNavItems = ({
  listMenuTree,
  listOrderMode,
  menuPresetById,
  menuPresets,
  quickPresetNavIconNames,
  quickPresetNavPresetIds,
}: {
  listMenuTree: StoredListMenuNode[];
  listOrderMode: ListOrderMode;
  menuPresetById: Map<string, StoredMenuPreset>;
  menuPresets: StoredMenuPreset[];
  quickPresetNavIconNames: QuickPresetNavIconNames;
  quickPresetNavPresetIds: QuickPresetNavPresetIds;
}): QuickPresetNavItem[] => {
  const slotLimit = getQuickPresetNavSlotLimit(
    listMenuTree,
    menuPresets,
    quickPresetNavIconNames,
    quickPresetNavPresetIds,
  );
  const usesAutomaticSlots = quickPresetNavPresetIds.length === 0;
  const slotCount = usesAutomaticSlots
    ? Math.min(
      Math.max(DEFAULT_QUICK_PRESET_NAV_ICON_NAMES.length, menuPresets.length, listMenuTree.length),
      slotLimit,
    )
    : Math.min(
      Math.max(quickPresetNavPresetIds.length, quickPresetNavIconNames.length, listMenuTree.length, 1),
      slotLimit,
    );
  const items: QuickPresetNavItem[] = [];

  for (let index = 0; index < slotCount; index += 1) {
    const list = listMenuTree[index];
    const explicitPresetId = usesAutomaticSlots ? null : quickPresetNavPresetIds[index] ?? null;
    if (list?.showInNavbar === false) {
      continue;
    }

    if (items.length >= QUICK_PRESET_NAV_MAX_SLOT_COUNT) {
      continue;
    }

    const explicitPreset = explicitPresetId ? menuPresetById.get(explicitPresetId) ?? null : null;
    const listPreset = list
      ? createQuickListPreset(list, listOrderMode)
      : null;
    const automaticPreset = usesAutomaticSlots && !listPreset ? menuPresets[index] ?? null : null;
    const preset = explicitPreset ?? listPreset ?? automaticPreset;

    items.push({
      displayLabel: explicitPreset?.label ?? list?.label ?? preset?.label ?? '',
      iconName: resolveQuickPresetNavSlotIconName(
        index,
        listMenuTree,
        quickPresetNavIconNames[index],
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
