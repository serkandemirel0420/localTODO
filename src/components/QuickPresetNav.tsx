import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import {
  type GestureResponderEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { resolveMaterialCommunityIconName } from '../materialCommunityIconNames';
import type { QuickPresetNavItem } from '../presets';

type MaterialCommunityIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export type QuickPresetNavDetail = {
  details: string[];
  title: string;
};

type QuickPresetNavProps = {
  accentColor: string;
  activePresetId: string | null;
  bottomOffset: number;
  detail: QuickPresetNavDetail | null;
  emptyColor: string;
  inactiveColor: string;
  isSearchTab: boolean;
  items: QuickPresetNavItem[];
  onLongPressSlot: (slotNumber: number) => void;
  onPressItem: (
    item: QuickPresetNavItem,
    event: GestureResponderEvent,
    phase: 'press' | 'pressIn',
  ) => void;
  onReleaseSlot: (slotNumber: number) => void;
  openPresetId: string | null;
  openSlotNumber: number | null;
  pressDelayMs: number;
  selectedBackgroundColor: string;
};

const toMaterialCommunityIconName = (iconName: string): MaterialCommunityIconName => (
  iconName as MaterialCommunityIconName
);

// The quick nav renders saved preset slots. Lists have their own Settings surface.
export function QuickPresetNav({
  accentColor,
  activePresetId,
  bottomOffset,
  detail,
  emptyColor,
  inactiveColor,
  isSearchTab,
  items,
  onLongPressSlot,
  onPressItem,
  onReleaseSlot,
  openPresetId,
  openSlotNumber,
  pressDelayMs,
  selectedBackgroundColor,
}: QuickPresetNavProps) {
  return (
    <>
      {detail ? (
        <View
          pointerEvents="none"
          style={[styles.holdDetailLayer, { bottom: bottomOffset + 8 }]}
        >
          <View style={styles.holdDetail}>
            <Text style={[styles.holdDetailTitle, { color: accentColor }]}>
              {detail.title}
            </Text>
            <View style={styles.holdDetailLines}>
              {detail.details.map((line) => (
                <Text key={line} style={styles.holdDetailText}>
                  {line}
                </Text>
              ))}
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.nav}>
        <ScrollView
          alwaysBounceHorizontal={false}
          bounces={false}
          contentContainerStyle={styles.items}
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          style={styles.scroll}
        >
          {items.map((item) => {
            const openedFromThisSlot = Boolean(
              item.preset && openSlotNumber === item.slotNumber && openPresetId,
            );
            const selected = !isSearchTab && Boolean(
              item.preset &&
                (
                  openedFromThisSlot ||
                  (!openSlotNumber && (openPresetId ?? activePresetId) === item.preset.id)
                ),
            );
            const iconColor = item.preset
              ? selected ? accentColor : inactiveColor
              : emptyColor;

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityHint={
                  item.preset
                    ? 'Applies this list. Double tap expands or collapses grouped sections. Long press shows details'
                    : 'No list assigned'
                }
                accessibilityLabel={
                  item.preset
                    ? `Apply ${item.displayLabel || item.preset.label}`
                    : `List slot ${item.slotNumber}`
                }
                accessibilityState={{ disabled: !item.preset, selected }}
                disabled={!item.preset}
                key={item.id}
                unstable_pressDelay={pressDelayMs}
                onLongPress={() => {
                  if (item.preset) {
                    onLongPressSlot(item.slotNumber);
                  }
                }}
                onPress={(event) => onPressItem(item, event, 'press')}
                onPressIn={(event) => onPressItem(item, event, 'pressIn')}
                onPressOut={() => onReleaseSlot(item.slotNumber)}
                style={({ pressed }) => [
                  styles.item,
                  selected && { backgroundColor: selectedBackgroundColor },
                  !item.preset && styles.itemEmpty,
                  pressed && styles.itemPressed,
                ]}
              >
                <MaterialCommunityIcons
                  color={iconColor}
                  name={toMaterialCommunityIconName(
                    resolveMaterialCommunityIconName(item.iconName, 'star-four-points')
                  )}
                  size={20}
                />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  holdDetailLayer: {
    alignItems: 'center',
    elevation: 7,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 18,
  },
  holdDetail: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8E0D8',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 340,
    minWidth: 210,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  holdDetailLines: {
    gap: 5,
    marginTop: 8,
  },
  holdDetailText: {
    color: '#6E655D',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 18,
    textAlign: 'center',
  },
  holdDetailTitle: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 17,
    textAlign: 'center',
  },
  item: {
    alignItems: 'center',
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    width: 52,
  },
  itemEmpty: {
    opacity: 0.68,
  },
  itemPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  items: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
  },
  nav: {
    alignItems: 'stretch',
    borderBottomColor: '#F2F2F7',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'column',
    height: 40,
    justifyContent: 'flex-start',
  },
  scroll: {
    flexGrow: 0,
    height: 40,
  },
});
