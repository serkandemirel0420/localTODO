import materialCommunityIconGlyphmap from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json';

export type MaterialCommunityIconName = keyof typeof materialCommunityIconGlyphmap;

const validMaterialCommunityIcons = new Set<string>(Object.keys(materialCommunityIconGlyphmap));

// Legacy icon names that were listed in settings but are not in the icon font.
const MATERIAL_COMMUNITY_ICON_FALLBACKS: Record<string, MaterialCommunityIconName> = {
  ant: 'bug',
  bear: 'teddy-bear',
  camel: 'horse-variant',
  chicken: 'food-drumstick',
  crab: 'fish',
  crow: 'bird',
  deer: 'forest',
  dove: 'feather',
  fox: 'dog-side',
  frog: 'bug-outline',
  giraffe: 'horse-human',
  goat: 'sheep',
  hamster: 'mouse-variant',
  hedgehog: 'paw-outline',
  hippo: 'water',
  lion: 'cat',
  monkey: 'nature-people',
  mosquito: 'bug-outline',
  octopus: 'jellyfish',
  parrot: 'bird',
  raccoon: 'paw',
  rainbow: 'gradient-vertical',
  rhino: 'elephant',
  squirrel: 'mouse-variant',
  tiger: 'cat',
  whale: 'dolphin',
  wolf: 'dog',
  zebra: 'horse-variant-fast',
};

const DEFAULT_MATERIAL_COMMUNITY_ICON: MaterialCommunityIconName = 'paw';

export const resolveMaterialCommunityIconName = (
  iconName: string,
): MaterialCommunityIconName => {
  const fallback = MATERIAL_COMMUNITY_ICON_FALLBACKS[iconName];
  if (fallback) {
    return fallback;
  }

  if (validMaterialCommunityIcons.has(iconName)) {
    return iconName as MaterialCommunityIconName;
  }

  return DEFAULT_MATERIAL_COMMUNITY_ICON;
};

export const isMaterialCommunityIconName = (iconName: string): iconName is MaterialCommunityIconName => (
  validMaterialCommunityIcons.has(iconName)
);
