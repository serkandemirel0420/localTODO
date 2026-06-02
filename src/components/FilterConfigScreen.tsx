import React, { useCallback, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  CUSTOM_DATE_LABEL,
  formatDateDisplayLabel,
  formatDateFilterLabel,
  getDateMenuClearValue,
  getDateMenuColorLookupValue,
  getDateMenuItemDisplayLabel,
  isDateMenuItemSelected,
  type DateLabelDisplayMode,
} from '../dates';
import {
  getFilterColorTheme,
  type FilterColorSettings,
} from '../filterColors';
import {
  formatMetaTagVisibilitySummary,
  META_TAG_KEYS,
  META_TAG_LABELS,
  type MetaTagKey,
  type MetaTagVisibility,
} from '../metaTags';
import {
  type StoredMenuPreset,
  type TodoGroupMode,
  type TodoSortMode,
} from '../storage/appSettingsStore';
import {
  DATE_MENU_ITEMS,
  PRIORITY_MENU_ITEMS,
  TODO_GROUP_LABELS,
  TODO_GROUP_OPTIONS,
  TODO_SORT_LABELS,
  TODO_SORT_OPTIONS,
} from '../todoOptions';
import type { TodoFilters } from '../todos';

const FONT_REGULAR = '400' as const;
const FONT_MEDIUM = '500' as const;
const FONT_SEMIBOLD = '600' as const;
const THEME_BG = '#F4F6F8';
const THEME_TEXT = '#212121';
const THEME_TEXT_SECONDARY = '#8E8E93';
const THEME_ACCENT = '#4C78FF';
const THEME_ACCENT_SOFT = '#E8EEFF';
const SECTION_TOGGLE_HIT_SLOP = { bottom: 8, left: 8, right: 8, top: 8 };
const OPTION_ROW_HEIGHT = 48;

export type FilterConfigListItem = {
  depth: number;
  id: string;
  isSubsection: boolean;
  label: string;
  parentLabel?: string;
};

type FilterKey = 'list' | 'date' | 'priority';

type FilterConfigScreenProps = {
  visible: boolean;
  filters: TodoFilters;
  filterColors: FilterColorSettings;
  listMenuItems: FilterConfigListItem[];
  sortMode: TodoSortMode;
  groupMode: TodoGroupMode;
  metaTagVisibility: MetaTagVisibility;
  menuPresets: StoredMenuPreset[];
  activeMenuPreset: StoredMenuPreset | null;
  latestMenuPreset: StoredMenuPreset | null;
  currentPresetSummary: string;
  presetSummaries: Record<string, string>;
  resultCount: number;
  dateLabelDisplayMode: DateLabelDisplayMode;
  isListItemSelected: (item: FilterConfigListItem) => boolean;
  onClose: () => void;
  onShowResults: () => void;
  onToggleFilter: (filterKey: FilterKey, value: string) => void;
  onDateMenuPress: (label: string) => void;
  onRemoveFilter: (filterKey: FilterKey, value: string) => void;
  onToggleListItem: (item: FilterConfigListItem) => void;
  onRemoveListItem: (item: FilterConfigListItem) => void;
  onSelectSort: (mode: TodoSortMode) => void;
  onSelectGroup: (mode: TodoGroupMode) => void;
  onToggleMetaTag: (key: MetaTagKey) => void;
  onApplyPreset: (preset: StoredMenuPreset) => void;
  onRemovePreset: (presetId: string) => void;
  onOpenSavePreset: () => void;
  onClearFilters: () => void;
  onClearSection: (
    section: 'presets' | 'lists' | 'priority' | 'date' | 'sort' | 'group' | 'metaTags',
  ) => void;
  onToggleDateLabelDisplayMode: () => void;
};

const formatSelectionSummary = (values: string[], emptyLabel: string) => {
  if (values.length === 0) {
    return emptyLabel;
  }

  if (values.length === 1) {
    return values[0];
  }

  return `${values.length} selected`;
};

const AccordionSection = ({
  title,
  subtitle,
  expanded,
  onToggle,
  onClear,
  canClear,
  children,
}: {
  title: string;
  subtitle: string;
  expanded: boolean;
  onToggle: () => void;
  onClear?: () => void;
  canClear?: boolean;
  children: React.ReactNode;
}) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <Pressable
        accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${title} section`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => [
          styles.sectionHeaderMain,
          pressed && styles.sectionHeaderPressed,
        ]}
      >
        <View style={styles.sectionHeaderTextWrap}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text numberOfLines={1} style={styles.sectionSubtitle}>
            {subtitle}
          </Text>
        </View>
        <Text
          style={[
            styles.sectionChevron,
            expanded && styles.sectionChevronExpanded,
          ]}
        >
          ›
        </Text>
      </Pressable>
      {canClear && onClear ? (
        <Pressable
          accessibilityLabel={`Clear ${title}`}
          accessibilityRole="button"
          hitSlop={SECTION_TOGGLE_HIT_SLOP}
          onPress={onClear}
          style={({ pressed }) => [
            styles.sectionClearButton,
            pressed && styles.sectionClearButtonPressed,
          ]}
        >
          <Text style={styles.sectionClearButtonText}>×</Text>
        </Pressable>
      ) : null}
    </View>
    {expanded ? <View style={styles.sectionCard}>{children}</View> : null}
  </View>
);

export const FilterConfigScreen = ({
  visible,
  filters,
  filterColors,
  listMenuItems,
  sortMode,
  groupMode,
  metaTagVisibility,
  menuPresets,
  activeMenuPreset,
  latestMenuPreset,
  currentPresetSummary,
  presetSummaries,
  resultCount,
  dateLabelDisplayMode,
  isListItemSelected,
  onClose,
  onShowResults,
  onToggleFilter,
  onDateMenuPress,
  onRemoveFilter,
  onToggleListItem,
  onRemoveListItem,
  onSelectSort,
  onSelectGroup,
  onToggleMetaTag,
  onApplyPreset,
  onRemovePreset,
  onOpenSavePreset,
  onClearFilters,
  onClearSection,
  onToggleDateLabelDisplayMode,
}: FilterConfigScreenProps) => {
  const formatActiveDateLabel = (value: string) => (
    dateLabelDisplayMode === 'remaining'
      ? formatDateDisplayLabel(value, 'remaining')
      : formatDateFilterLabel(value)
  );
  const getDateMenuDisplayLabel = (menuLabel: string) =>
    getDateMenuItemDisplayLabel(menuLabel, filters.date, dateLabelDisplayMode);
  const [presetsExpanded, setPresetsExpanded] = useState(false);
  const [listsExpanded, setListsExpanded] = useState(true);
  const [priorityExpanded, setPriorityExpanded] = useState(false);
  const [dateExpanded, setDateExpanded] = useState(true);
  const [sortExpanded, setSortExpanded] = useState(false);
  const [groupExpanded, setGroupExpanded] = useState(false);
  const [metaTagsExpanded, setMetaTagsExpanded] = useState(false);

  const renderOptionRow = useCallback(
    (
      key: string,
      label: string,
      selected: boolean,
      onPress: () => void,
      options?: {
        colorTheme?: ReturnType<typeof getFilterColorTheme>;
        indented?: boolean;
        marker?: string;
      },
    ) => (
      <Pressable
        key={key}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.optionRow,
          options?.indented && styles.optionRowIndented,
          (selected || pressed) && styles.optionRowSelected,
          options?.colorTheme && (selected || pressed) && {
            backgroundColor: options.colorTheme.tint,
            borderBottomColor: options.colorTheme.border,
          },
        ]}
      >
        <View style={styles.optionRowContent}>
          {options?.marker ? (
            <Text style={styles.subsectionMarker}>{options.marker}</Text>
          ) : options?.colorTheme ? (
            <View
              style={[
                styles.colorDot,
                { backgroundColor: options.colorTheme.accent },
              ]}
            />
          ) : (
            <View style={[styles.colorDot, styles.colorDotNoColor]} />
          )}
          <Text
            style={[
              styles.optionLabel,
              options?.indented && styles.optionLabelSubsection,
            ]}
          >
            {label}
          </Text>
        </View>
        {selected ? <Text style={styles.optionCheck}>✓</Text> : null}
      </Pressable>
    ),
    [],
  );

  const resultsLabel = resultCount === 1
    ? 'Show 1 result'
    : `Show ${resultCount} results`;

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <SafeAreaView style={styles.safeArea}>
      <View style={styles.modal}>
        <View style={styles.header}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>Filters</Text>
            <Text style={styles.subtitle}>Configure how items are shown</Text>
          </View>
          <Pressable
            accessibilityLabel="Close filters"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              pressed && styles.closeButtonPressed,
            ]}
          >
            <Text style={styles.closeIcon}>×</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.body}
        >
          <AccordionSection
            canClear={activeMenuPreset !== null}
            expanded={presetsExpanded}
            onClear={() => onClearSection('presets')}
            onToggle={() => setPresetsExpanded((current) => !current)}
            subtitle={activeMenuPreset?.label ?? 'No preset applied'}
            title="Presets"
          >
            {latestMenuPreset ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onApplyPreset(latestMenuPreset)}
                style={({ pressed }) => [
                  styles.presetRow,
                  pressed && styles.optionRowSelected,
                ]}
              >
                <View style={styles.presetTextWrap}>
                  <Text style={styles.optionLabel}>Quick apply</Text>
                  <Text numberOfLines={1} style={styles.presetSummary}>
                    {latestMenuPreset.label}
                  </Text>
                </View>
                <Text style={styles.presetAction}>Apply</Text>
              </Pressable>
            ) : null}
            {menuPresets.map((preset) => (
              <View key={preset.id} style={styles.presetRowWrap}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onApplyPreset(preset)}
                  style={({ pressed }) => [
                    styles.presetRow,
                    pressed && styles.optionRowSelected,
                  ]}
                >
                  <View style={styles.presetTextWrap}>
                    <Text style={styles.optionLabel}>{preset.label}</Text>
                    <Text numberOfLines={1} style={styles.presetSummary}>
                      {presetSummaries[preset.id] ?? ''}
                    </Text>
                  </View>
                  <Text style={styles.presetAction}>Apply</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`Delete preset ${preset.label}`}
                  accessibilityRole="button"
                  onPress={() => onRemovePreset(preset.id)}
                  style={({ pressed }) => [
                    styles.presetDeleteButton,
                    pressed && styles.sectionClearButtonPressed,
                  ]}
                >
                  <Text style={styles.presetDeleteText}>×</Text>
                </Pressable>
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={onOpenSavePreset}
              style={({ pressed }) => [
                styles.savePresetRow,
                pressed && styles.optionRowSelected,
              ]}
            >
              <View style={styles.presetTextWrap}>
                <Text style={styles.optionLabel}>Save current as preset</Text>
                <Text numberOfLines={1} style={styles.presetSummary}>
                  {currentPresetSummary}
                </Text>
              </View>
              <Text style={styles.presetAction}>+</Text>
            </Pressable>
          </AccordionSection>

          <AccordionSection
            canClear={filters.list.length > 0}
            expanded={listsExpanded}
            onClear={() => onClearSection('lists')}
            onToggle={() => setListsExpanded((current) => !current)}
            subtitle={formatSelectionSummary(filters.list, 'All lists')}
            title="Lists"
          >
            {listMenuItems.map((item) => {
              const selected = isListItemSelected(item);
              const listColorTheme = getFilterColorTheme(
                filterColors,
                'list',
                item.isSubsection && item.parentLabel ? item.parentLabel : item.label,
              );

              return (
                <View key={item.id} style={styles.selectableRow}>
                  {renderOptionRow(
                    item.id,
                    item.label,
                    selected,
                    () => onToggleListItem(item),
                    {
                      colorTheme: listColorTheme,
                      indented: item.depth > 0,
                      marker: item.isSubsection ? '└' : undefined,
                    },
                  )}
                  {selected ? (
                    <Pressable
                      accessibilityLabel={`Clear ${item.label}`}
                      accessibilityRole="button"
                      onPress={() => onRemoveListItem(item)}
                      style={({ pressed }) => [
                        styles.rowClearButton,
                        pressed && styles.sectionClearButtonPressed,
                      ]}
                    >
                      <Text style={styles.rowClearButtonText}>×</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </AccordionSection>

          <AccordionSection
            canClear={filters.priority.length > 0}
            expanded={priorityExpanded}
            onClear={() => onClearSection('priority')}
            onToggle={() => setPriorityExpanded((current) => !current)}
            subtitle={formatSelectionSummary(filters.priority, 'Any priority')}
            title="Priority"
          >
            {PRIORITY_MENU_ITEMS.map((label) => {
              const selected = filters.priority.includes(label);
              const colorTheme = getFilterColorTheme(filterColors, 'priority', label);

              return renderOptionRow(
                `priority-${label}`,
                label,
                selected,
                () => onToggleFilter('priority', label),
                { colorTheme },
              );
            })}
          </AccordionSection>

          <AccordionSection
            canClear={filters.date.length > 0}
            expanded={dateExpanded}
            onClear={() => onClearSection('date')}
            onToggle={() => setDateExpanded((current) => !current)}
            subtitle={formatSelectionSummary(
              filters.date.map((value) => formatActiveDateLabel(value)),
              'Any date',
            )}
            title="Date"
          >
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: dateLabelDisplayMode === 'remaining' }}
              onPress={onToggleDateLabelDisplayMode}
              style={({ pressed }) => [
                styles.dateDisplayModeRow,
                pressed && styles.optionRowSelected,
              ]}
            >
              <View style={styles.dateDisplayModeTextWrap}>
                <Text style={styles.optionLabel}>Show days remaining</Text>
                <Text style={styles.dateDisplayModeSubtitle}>
                  {dateLabelDisplayMode === 'remaining'
                    ? '0 days, 1 day, 3 days…'
                    : 'Today, Tomorrow, Jun 5…'}
                </Text>
              </View>
              <Text style={styles.dateDisplayModeValue}>
                {dateLabelDisplayMode === 'remaining' ? 'On' : 'Off'}
              </Text>
            </Pressable>
            {DATE_MENU_ITEMS.map((label) => {
              const selected = isDateMenuItemSelected(label, filters.date);
              const displayLabel = getDateMenuDisplayLabel(label);
              const colorLookupValue = getDateMenuColorLookupValue(label, filters.date);
              const colorTheme = getFilterColorTheme(
                filterColors,
                'date',
                colorLookupValue,
              );
              const clearValue = getDateMenuClearValue(label, filters.date);

              return (
                <View key={`date-${label}`} style={styles.selectableRow}>
                  {renderOptionRow(
                    `date-${label}`,
                    displayLabel,
                    selected,
                    () => (
                      label === CUSTOM_DATE_LABEL
                        ? onDateMenuPress(label)
                        : onToggleFilter('date', label)
                    ),
                    { colorTheme },
                  )}
                  {selected && clearValue ? (
                    <Pressable
                      accessibilityLabel={`Clear ${displayLabel}`}
                      accessibilityRole="button"
                      onPress={() => onRemoveFilter('date', clearValue)}
                      style={({ pressed }) => [
                        styles.rowClearButton,
                        pressed && styles.sectionClearButtonPressed,
                      ]}
                    >
                      <Text style={styles.rowClearButtonText}>×</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </AccordionSection>

          <AccordionSection
            canClear={sortMode !== 'newest'}
            expanded={sortExpanded}
            onClear={() => onClearSection('sort')}
            onToggle={() => setSortExpanded((current) => !current)}
            subtitle={TODO_SORT_LABELS[sortMode]}
            title="Sort"
          >
            {TODO_SORT_OPTIONS.map((item) => renderOptionRow(
              `sort-${item.mode}`,
              item.label,
              sortMode === item.mode,
              () => onSelectSort(item.mode),
            ))}
          </AccordionSection>

          <AccordionSection
            canClear={groupMode !== 'none'}
            expanded={groupExpanded}
            onClear={() => onClearSection('group')}
            onToggle={() => setGroupExpanded((current) => !current)}
            subtitle={TODO_GROUP_LABELS[groupMode]}
            title="Group"
          >
            {TODO_GROUP_OPTIONS.map((item) => renderOptionRow(
              `group-${item.mode}`,
              item.label,
              groupMode === item.mode,
              () => onSelectGroup(item.mode),
            ))}
          </AccordionSection>

          <AccordionSection
            expanded={metaTagsExpanded}
            onToggle={() => setMetaTagsExpanded((current) => !current)}
            subtitle={formatMetaTagVisibilitySummary(metaTagVisibility)}
            title="Meta tags"
          >
            {META_TAG_KEYS.map((key) => renderOptionRow(
              `meta-${key}`,
              META_TAG_LABELS[key],
              metaTagVisibility[key],
              () => onToggleMetaTag(key),
            ))}
          </AccordionSection>

          <Pressable
            accessibilityRole="button"
            onPress={onClearFilters}
            style={({ pressed }) => [
              styles.clearAllRow,
              pressed && styles.sectionHeaderPressed,
            ]}
          >
            <Text style={styles.clearAllText}>Clear all filters</Text>
          </Pressable>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={onShowResults}
            style={({ pressed }) => [
              styles.showResultsButton,
              pressed && styles.showResultsButtonPressed,
            ]}
          >
            <Text style={styles.showResultsButtonText}>{resultsLabel}</Text>
          </Pressable>
        </View>
      </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: THEME_BG,
    flex: 1,
  },
  modal: {
    flex: 1,
    backgroundColor: THEME_BG,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 12 : 8,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: THEME_TEXT,
    fontSize: 24,
    fontWeight: FONT_SEMIBOLD,
    letterSpacing: 0,
    lineHeight: 30,
  },
  subtitle: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 14,
    fontWeight: FONT_REGULAR,
    letterSpacing: 0.1,
    lineHeight: 18,
    marginTop: 2,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#F3EEE7',
    borderColor: '#E8E2DA',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  closeButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
  closeIcon: {
    color: '#2A2520',
    fontSize: 24,
    fontWeight: FONT_REGULAR,
    lineHeight: 24,
    marginTop: -2,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: 24,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  section: {
    marginBottom: 14,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  sectionHeaderMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  sectionHeaderPressed: {
    opacity: 0.72,
  },
  sectionHeaderTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    color: THEME_TEXT,
    fontSize: 17,
    fontWeight: FONT_SEMIBOLD,
    letterSpacing: 0,
    lineHeight: 22,
  },
  sectionSubtitle: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 13,
    fontWeight: FONT_REGULAR,
    letterSpacing: 0.1,
    lineHeight: 17,
    marginTop: 2,
  },
  sectionChevron: {
    color: '#9B9289',
    fontSize: 22,
    fontWeight: FONT_REGULAR,
    lineHeight: 22,
    transform: [{ rotate: '0deg' }],
  },
  sectionChevronExpanded: {
    transform: [{ rotate: '90deg' }],
  },
  sectionClearButton: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  sectionClearButtonPressed: {
    opacity: 0.72,
  },
  sectionClearButtonText: {
    color: '#8F877F',
    fontSize: 22,
    fontWeight: FONT_REGULAR,
    lineHeight: 22,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8E2DA',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingVertical: 4,
  },
  optionRow: {
    alignItems: 'center',
    borderBottomColor: '#F2EBE3',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: OPTION_ROW_HEIGHT,
    paddingHorizontal: 14,
  },
  optionRowIndented: {
    paddingLeft: 24,
  },
  optionRowSelected: {
    backgroundColor: THEME_ACCENT_SOFT,
  },
  optionRowContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  optionLabel: {
    color: '#2A2520',
    fontSize: 15,
    fontWeight: FONT_REGULAR,
    letterSpacing: 0.1,
    lineHeight: 20,
  },
  optionLabelSubsection: {
    color: '#5C554E',
    fontSize: 14,
  },
  optionCheck: {
    color: THEME_ACCENT,
    fontSize: 16,
    fontWeight: FONT_MEDIUM,
    lineHeight: 20,
    marginLeft: 12,
  },
  subsectionMarker: {
    color: '#B4AAA0',
    fontSize: 14,
    lineHeight: 18,
    width: 16,
  },
  colorDot: {
    borderRadius: 5,
    flexShrink: 0,
    height: 9,
    width: 9,
  },
  colorDotNoColor: {
    backgroundColor: 'transparent',
    borderColor: '#A79F96',
    borderWidth: StyleSheet.hairlineWidth,
  },
  dateDisplayModeRow: {
    alignItems: 'center',
    borderBottomColor: '#F2EBE3',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: OPTION_ROW_HEIGHT,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dateDisplayModeTextWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  dateDisplayModeSubtitle: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: FONT_REGULAR,
    letterSpacing: 0.1,
    lineHeight: 16,
    marginTop: 2,
  },
  dateDisplayModeValue: {
    color: THEME_ACCENT,
    fontSize: 13,
    fontWeight: FONT_MEDIUM,
    lineHeight: 18,
  },
  selectableRow: {
    position: 'relative',
  },
  rowClearButton: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: 10,
    top: (OPTION_ROW_HEIGHT - 34) / 2,
    width: 34,
  },
  rowClearButtonText: {
    color: '#8F877F',
    fontSize: 22,
    fontWeight: FONT_REGULAR,
    lineHeight: 22,
  },
  presetRowWrap: {
    position: 'relative',
  },
  presetRow: {
    alignItems: 'center',
    borderBottomColor: '#F2EBE3',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: OPTION_ROW_HEIGHT,
    paddingHorizontal: 14,
    paddingRight: 48,
  },
  presetTextWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  presetSummary: {
    color: THEME_TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: FONT_REGULAR,
    letterSpacing: 0.1,
    lineHeight: 16,
    marginTop: 2,
  },
  presetAction: {
    color: THEME_ACCENT,
    fontSize: 13,
    fontWeight: FONT_MEDIUM,
    lineHeight: 18,
  },
  presetDeleteButton: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    top: (OPTION_ROW_HEIGHT - 34) / 2,
    width: 34,
  },
  presetDeleteText: {
    color: '#8F4D46',
    fontSize: 22,
    fontWeight: FONT_REGULAR,
    lineHeight: 22,
  },
  savePresetRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: OPTION_ROW_HEIGHT,
    paddingHorizontal: 14,
  },
  clearAllRow: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: 8,
  },
  clearAllText: {
    color: '#8F4D46',
    fontSize: 15,
    fontWeight: FONT_MEDIUM,
    letterSpacing: 0.1,
    lineHeight: 20,
  },
  footer: {
    borderTopColor: '#E8E2DA',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  showResultsButton: {
    alignItems: 'center',
    backgroundColor: THEME_ACCENT,
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  showResultsButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  showResultsButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: FONT_MEDIUM,
    letterSpacing: 0.1,
    lineHeight: 20,
  },
});
