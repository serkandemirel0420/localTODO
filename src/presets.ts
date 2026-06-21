import {
  DEFAULT_QUICK_PRESET_NAV_ICON_NAMES,
  QUICK_PRESET_NAV_MAX_SLOT_COUNT,
  type QuickPresetNavIconNames,
  type QuickPresetNavPresetIds,
  type StoredMenuPreset,
} from './storage/appSettingsStore';
import { resolveMaterialCommunityIconName } from './materialCommunityIconNames';

export type QuickPresetNavItem = {
  displayLabel: string;
  iconName: string;
  id: string;
  // Index into the persisted quick-nav arrays. This can differ from slotNumber
  // when empty or missing assignments are skipped.
  navIndex: number;
  preset: StoredMenuPreset | null;
  presetId: string | null;
  slotNumber: number;
};

export const isListScopedPreset = (preset: StoredMenuPreset | null | undefined) =>
  Boolean(preset && preset.filters.list.length > 0);

export const getQuickPresetNavSlotLimit = (
  menuPresets: StoredMenuPreset[],
  quickPresetNavIconNames: QuickPresetNavIconNames,
  quickPresetNavPresetIds: Array<string | null>,
) => Math.min(
  Math.max(
    menuPresets.length,
    quickPresetNavIconNames.length,
    quickPresetNavPresetIds.length,
  ),
  QUICK_PRESET_NAV_MAX_SLOT_COUNT,
);

export const resolveQuickPresetNavSlotIconName = (
  slotIndex: number,
  quickPresetNavIconName?: string,
): string => {
  const fallbackIconName = DEFAULT_QUICK_PRESET_NAV_ICON_NAMES[
    slotIndex % DEFAULT_QUICK_PRESET_NAV_ICON_NAMES.length
  ] ?? 'star-four-points';

  return resolveMaterialCommunityIconName(
    quickPresetNavIconName,
    fallbackIconName,
  );
};

export const buildQuickPresetNavItems = ({
  menuPresetById,
  menuPresets,
  quickPresetNavIconNames,
  quickPresetNavPresetIds,
}: {
  menuPresetById: Map<string, StoredMenuPreset>;
  menuPresets: StoredMenuPreset[];
  quickPresetNavIconNames: QuickPresetNavIconNames;
  quickPresetNavPresetIds: QuickPresetNavPresetIds;
}): QuickPresetNavItem[] => {
  const slotPresetIds = quickPresetNavPresetIds.length > 0
    ? quickPresetNavPresetIds
    : menuPresets.map((preset) => preset.id);
  const slotLimit = getQuickPresetNavSlotLimit(
    menuPresets,
    quickPresetNavIconNames,
    slotPresetIds,
  );
  const slotCount = Math.min(
    Math.max(slotPresetIds.length, quickPresetNavIconNames.length),
    slotLimit,
  );
  const items: QuickPresetNavItem[] = [];

  for (let index = 0; index < slotCount; index += 1) {
    if (items.length >= QUICK_PRESET_NAV_MAX_SLOT_COUNT) {
      continue;
    }

    const presetId = slotPresetIds[index] ?? null;
    const preset = presetId ? menuPresetById.get(presetId) ?? null : null;
    if (!preset) {
      continue;
    }

    items.push({
      displayLabel: preset.label,
      iconName: resolveQuickPresetNavSlotIconName(
        index,
        quickPresetNavIconNames[index],
      ),
      id: `quick-preset-slot-${index + 1}`,
      navIndex: index,
      preset,
      presetId,
      slotNumber: items.length + 1,
    });
  }

  return items;
};
