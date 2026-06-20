import materialCommunityIconsGlyphMap from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json';

const MATERIAL_COMMUNITY_ICON_GLYPHS = materialCommunityIconsGlyphMap as Record<string, number>;

export const normalizeMaterialCommunityIconName = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const iconName = value.trim();
  return iconName && MATERIAL_COMMUNITY_ICON_GLYPHS[iconName] !== undefined
    ? iconName
    : undefined;
};

export const resolveMaterialCommunityIconName = (
  value: unknown,
  fallbackIconName: string,
): string => normalizeMaterialCommunityIconName(value) ?? fallbackIconName;
