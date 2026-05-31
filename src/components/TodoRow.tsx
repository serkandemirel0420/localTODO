import { Ionicons } from '@expo/vector-icons';
import React, { useCallback } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { DATE_FILTER_PRESETS } from '../dates';
import { TodoMetaTags } from './TodoMetaTags';
import {
  getTodoColorThemes,
  getTodoPrimaryColorTheme,
  type FilterColorSettings,
} from '../filterColors';
import {
  applyHiddenMetaTagKinds,
  type HiddenMetaTagKind,
  type MetaTagVisibility,
} from '../metaTags';
import { type Todo } from '../todos';

const THEME_CARD = '#FFFFFF';
const THEME_BORDER = '#E5E5EA';
const THEME_TEXT = '#1C1C1E';
const THEME_TEXT_SECONDARY = '#8E8E93';
const THEME_ACCENT = '#4C78FF';
const THEME_ACCENT_SELECTION = 'rgba(76, 120, 255, 0.07)';
const GROUPED_ROW_BLEED = 16;
const FONT_SEMIBOLD = '600';
const FONT_REGULAR = '400';

const DATE_MENU_ITEMS: string[] = [...DATE_FILTER_PRESETS];
const PRIORITY_MENU_ITEMS = ['High', 'Medium', 'Low', 'None'];

const getBestOrderedFilterLabel = (
  values: string[],
  options: string[],
  fallback: string,
) => {
  for (const option of options) {
    if (values.includes(option)) {
      return option;
    }
  }

  return values[0] ?? fallback;
};

export type TodoRowProps = {
  filterColors: FilterColorSettings;
  hiddenMetaTagKinds?: HiddenMetaTagKind[];
  item: Todo;
  isMenuTarget: boolean;
  layout?: 'standalone' | 'grouped';
  metaTagVisibility: MetaTagVisibility;
  onDelete: (id: string) => void;
  onOpenMenu: (id: string) => void;
  onSetDone: (id: string, done: boolean) => void;
  sectionLabel?: string;
};

function TodoRowComponent({
  filterColors,
  hiddenMetaTagKinds = [],
  item,
  isMenuTarget,
  layout = 'standalone',
  metaTagVisibility,
  onDelete,
  onOpenMenu,
  onSetDone,
}: TodoRowProps) {
  const isGroupedLayout = layout === 'grouped';
  const todoColorTheme = getTodoPrimaryColorTheme(item.filters, filterColors);
  const todoColorDots = getTodoColorThemes(item.filters, filterColors).slice(0, 5);
  const rawDateStatusLabel = getBestOrderedFilterLabel(
    item.filters.date,
    DATE_MENU_ITEMS,
    '',
  );
  const listStatusLabel = item.filters.list[0] ?? '';
  const priorityStatusLabel = getBestOrderedFilterLabel(
    item.filters.priority,
    PRIORITY_MENU_ITEMS,
    '',
  );
  const effectiveMetaTagVisibility = applyHiddenMetaTagKinds(
    metaTagVisibility,
    hiddenMetaTagKinds,
  );

  const toggleDoneFromCheckbox = useCallback(() => {
    onSetDone(item.id, !item.done);
  }, [item.done, item.id, onSetDone]);

  const openRowActions = useCallback(() => {
    Alert.alert(
      item.text,
      undefined,
      [
        {
          text: item.done ? 'Mark active' : 'Mark done',
          onPress: () => onSetDone(item.id, !item.done),
        },
        {
          text: 'More options',
          onPress: () => onOpenMenu(item.id),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(item.id),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [item.done, item.id, item.text, onDelete, onOpenMenu, onSetDone]);

  return (
    <View style={[styles.shell, isGroupedLayout && styles.shellGrouped]}>
      <View
        style={[
          styles.row,
          isGroupedLayout && styles.rowGrouped,
          !isGroupedLayout && todoColorTheme && !item.done && {
            backgroundColor: todoColorTheme.tint,
            borderColor: todoColorTheme.border,
            shadowColor: todoColorTheme.accent,
          },
          item.done && styles.rowDone,
          isMenuTarget && (
            isGroupedLayout
              ? styles.rowMenuTargetGrouped
              : styles.rowMenuTarget
          ),
        ]}
      >
        {!isGroupedLayout && todoColorTheme ? (
          <View
            style={[
              styles.colorRail,
              { backgroundColor: todoColorTheme.accent },
              item.done && styles.colorRailDone,
            ]}
          />
        ) : null}
        <TouchableOpacity
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.done }}
          accessibilityLabel={item.done ? 'Mark todo active' : 'Mark todo done'}
          activeOpacity={0.72}
          onPress={toggleDoneFromCheckbox}
          style={styles.checkboxPressable}
        >
          <View
            style={[
              styles.checkbox,
              item.done && styles.checkboxChecked,
            ]}
          >
            {item.done ? (
              <Ionicons color={THEME_CARD} name="checkmark" size={14} />
            ) : null}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={1}
          delayLongPress={280}
          onLongPress={openRowActions}
          onPress={() => onOpenMenu(item.id)}
          style={styles.textPressable}
        >
          <Text
            numberOfLines={2}
            style={[styles.text, item.done && styles.textDone]}
          >
            {item.text}
          </Text>
          <TodoMetaTags
            createdAt={item.createdAt}
            dateLabel={rawDateStatusLabel || undefined}
            done={item.done}
            filterColors={filterColors}
            listLabel={listStatusLabel || undefined}
            priorityLabel={
              priorityStatusLabel && priorityStatusLabel !== 'None'
                ? priorityStatusLabel
                : undefined
            }
            visibility={effectiveMetaTagVisibility}
          />
          {!isGroupedLayout && todoColorDots.length > 0 ? (
            <View style={styles.colorDotRow}>
              {todoColorDots.map((theme) => (
                <View
                  key={`${theme.filterKey}-${theme.value}`}
                  style={[
                    styles.colorDot,
                    { backgroundColor: theme.accent },
                    item.done && styles.colorDotDone,
                  ]}
                />
              ))}
            </View>
          ) : null}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export const TodoRow = React.memo(TodoRowComponent);

const styles = StyleSheet.create({
  shell: {
    minHeight: 56,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  shellGrouped: {
    minHeight: 52,
  },
  row: {
    minHeight: 56,
    borderRadius: 10,
    backgroundColor: THEME_CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME_BORDER,
    alignItems: 'flex-start',
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  rowGrouped: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    minHeight: 52,
    paddingHorizontal: 0,
    paddingVertical: 12,
    shadowOpacity: 0,
    elevation: 0,
  },
  rowDone: {
    opacity: 0.62,
  },
  rowMenuTarget: {
    backgroundColor: THEME_ACCENT_SELECTION,
    borderColor: 'rgba(76, 120, 255, 0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: THEME_ACCENT,
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  rowMenuTargetGrouped: {
    backgroundColor: THEME_ACCENT_SELECTION,
    marginHorizontal: -GROUPED_ROW_BLEED,
    paddingHorizontal: GROUPED_ROW_BLEED,
  },
  colorRail: {
    alignSelf: 'stretch',
    borderRadius: 2,
    marginRight: 12,
    marginVertical: 2,
    width: 5,
  },
  colorRailDone: {
    opacity: 0.45,
  },
  checkboxPressable: {
    marginRight: 12,
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#C7C7CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: THEME_ACCENT,
    borderColor: THEME_ACCENT,
  },
  textPressable: {
    flex: 1,
    minWidth: 0,
  },
  text: {
    color: THEME_TEXT,
    fontSize: 16,
    fontWeight: FONT_REGULAR,
    lineHeight: 21,
  },
  textDone: {
    color: THEME_TEXT_SECONDARY,
    textDecorationLine: 'line-through',
  },
  colorDotRow: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 8,
  },
  colorDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  colorDotDone: {
    opacity: 0.45,
  },
});
