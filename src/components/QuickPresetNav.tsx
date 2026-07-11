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

const QUICK_PRESET_NAV_ITEM_WIDTH = 52;
const QUICK_PRESET_NAV_ITEM_GAP = 6;
const QUICK_PRESET_NAV_HORIZONTAL_PADDING = 16;

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
  const scrollRef = React.useRef<ScrollView | null>(null);
  const scrollOffsetRef = React.useRef(0);
  const [scrollViewportWidth, setScrollViewportWidth] = React.useState(0);
  const isItemSelected = React.useCallback((item: QuickPresetNavItem) => {
    const openedFromThisSlot = Boolean(
      item.preset && openSlotNumber === item.slotNumber && openPresetId,
    );

    return !isSearchTab && Boolean(
      item.preset &&
        (
          openedFromThisSlot ||
          (!openSlotNumber && (openPresetId ?? activePresetId) === item.preset.id)
        ),
    );
  }, [activePresetId, isSearchTab, openPresetId, openSlotNumber]);
  const selectedItemIndex = React.useMemo(
    () => items.findIndex((item) => isItemSelected(item)),
    [isItemSelected, items],
  );

  React.useEffect(() => {
    if (selectedItemIndex < 0 || scrollViewportWidth <= 0) {
      return undefined;
    }

    const contentWidth =
      (QUICK_PRESET_NAV_HORIZONTAL_PADDING * 2) +
      (items.length * QUICK_PRESET_NAV_ITEM_WIDTH) +
      (Math.max(0, items.length - 1) * QUICK_PRESET_NAV_ITEM_GAP);
    const maxOffset = Math.max(0, contentWidth - scrollViewportWidth);
    const itemLeft =
      QUICK_PRESET_NAV_HORIZONTAL_PADDING +
      (selectedItemIndex * (QUICK_PRESET_NAV_ITEM_WIDTH + QUICK_PRESET_NAV_ITEM_GAP));
    const itemRight = itemLeft + QUICK_PRESET_NAV_ITEM_WIDTH;
    const visibleLeft = scrollOffsetRef.current;
    const visibleRight = visibleLeft + scrollViewportWidth;
    let targetOffset = visibleLeft;

    if (itemLeft < visibleLeft + QUICK_PRESET_NAV_HORIZONTAL_PADDING) {
      targetOffset = itemLeft - QUICK_PRESET_NAV_HORIZONTAL_PADDING;
    } else if (itemRight > visibleRight - QUICK_PRESET_NAV_HORIZONTAL_PADDING) {
      targetOffset = itemRight - scrollViewportWidth + QUICK_PRESET_NAV_HORIZONTAL_PADDING;
    } else {
      return undefined;
    }

    targetOffset = Math.min(maxOffset, Math.max(0, targetOffset));
    scrollOffsetRef.current = targetOffset;
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ animated: true, x: targetOffset });
    });

    return () => cancelAnimationFrame(frame);
  }, [items.length, scrollViewportWidth, selectedItemIndex]);

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
          onLayout={(event) => setScrollViewportWidth(event.nativeEvent.layout.width)}
          onScroll={(event) => {
            scrollOffsetRef.current = event.nativeEvent.contentOffset.x;
          }}
          ref={scrollRef}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          style={styles.scroll}
        >
          {items.map((item) => {
            const selected = isItemSelected(item);
            const iconColor = item.preset
              ? item.color ?? (selected ? accentColor : inactiveColor)
              : emptyColor;

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityHint={
                  item.preset
                    ? 'Applies this list. Press and hold shows details and expands or collapses grouped sections'
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
    borderRadius: 10,
    height: 34,
    justifyContent: 'center',
    width: QUICK_PRESET_NAV_ITEM_WIDTH,
  },
  itemEmpty: {
    opacity: 0.68,
  },
  itemPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.94 }],
  },
  items: {
    alignItems: 'center',
    gap: QUICK_PRESET_NAV_ITEM_GAP,
    paddingHorizontal: QUICK_PRESET_NAV_HORIZONTAL_PADDING,
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
