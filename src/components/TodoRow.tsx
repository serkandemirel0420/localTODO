import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  type GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  type LayoutChangeEvent,
  View,
} from 'react-native';
import {
  LongPressGestureHandler,
  Swipeable,
  State,
  TouchableOpacity as GestureTouchableOpacity,
  type LongPressGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';

import { TodoMetaTags } from './TodoMetaTags';
import {
  getDateFilterSortRank,
  type DateLabelDisplayMode,
} from '../dates';
import {
  getFilterColorTheme,
  type FilterColorSettings,
} from '../filterColors';
import {
  applyHiddenMetaTagKinds,
  type HiddenMetaTagKind,
  type MetaTagVisibility,
} from '../metaTags';
import {
  getBestOrderedFilterLabel,
  PRIORITY_MENU_ITEMS,
} from '../todoOptions';
import { TODO_ROW_TITLE_MAX_CHARS, type Todo } from '../todos';

const THEME_CARD = '#FFFFFF';
const THEME_BORDER = '#E5E5EA';
const THEME_TEXT = '#1C1C1E';
const THEME_TEXT_SECONDARY = '#8E8E93';
const THEME_ACCENT = '#4C78FF';
const THEME_ACCENT_SOFT = '#E8EEFF';
const THEME_ACCENT_SELECTION_BORDER = 'rgba(76, 120, 255, 0.36)';
const THEME_MENU_TARGET_BORDER = 'rgba(76, 120, 255, 0.28)';
const SWIPE_DONE = '#4168E8';
const SWIPE_DELETE = '#D14A42';
const SWIPE_MENU = '#EA8D35';
const FONT_REGULAR = '400';
const ROW_BORDER_RADIUS = 10;
const SWIPE_ACTION_BUTTON_WIDTH = 48;
const SWIPE_ACTION_EDGE_PADDING = 10;
const SWIPE_ACTION_GAP = 6;
const SWIPE_ACTION_ICON_SIZE = 24;
const LEFT_SWIPE_ACTION_WIDTH =
  (SWIPE_ACTION_BUTTON_WIDTH * 2) + SWIPE_ACTION_GAP + (SWIPE_ACTION_EDGE_PADDING * 2);
const RIGHT_SWIPE_ACTION_WIDTH = SWIPE_ACTION_BUTTON_WIDTH + (SWIPE_ACTION_EDGE_PADDING * 2);
const LEFT_SWIPE_OPEN_DISTANCE = 66;
const RIGHT_SWIPE_OPEN_DISTANCE = 38;
const TODO_ROW_CONTENT_PREVIEW_MAX_LENGTH = TODO_ROW_TITLE_MAX_CHARS;
const TODO_ROW_PREVIEW_ELLIPSIS = '...';
const TODO_ROW_TEXT_RIGHT_INSET = 36;
const TODO_ROW_GROUPED_TEXT_RIGHT_INSET = 44;
const COMBINING_MARKS_PATTERN = /[\u0300-\u036f]/g;
const SEARCH_TERM_PATTERN = /[\p{L}\p{N}_]+/gu;

type SearchHighlightRange = {
  end: number;
  start: number;
};

type SwipeActionAnimation = ReturnType<Animated.Value['interpolate']>;

let openTodoSwipeable: Swipeable | null = null;

const getTodoRowTextPreview = (text: string, maxLength: number) => {
  const compactText = text.trim().replace(/\s+/g, ' ');
  const compactChars = Array.from(compactText);

  if (compactChars.length <= maxLength) {
    return compactText;
  }

  return `${compactChars
    .slice(0, maxLength - TODO_ROW_PREVIEW_ELLIPSIS.length)
    .join('')
    .trimEnd()}${TODO_ROW_PREVIEW_ELLIPSIS}`;
};

const getBestTodoDateLabel = (dateLabels: string[], createdAt: number): string => {
  const now = new Date();
  let bestLabel = '';
  let bestRank = getDateFilterSortRank('', now, createdAt);

  dateLabels.forEach((label, index) => {
    const rank = getDateFilterSortRank(label, now, createdAt);

    if (rank < bestRank || (rank === bestRank && !bestLabel && index === 0)) {
      bestLabel = label;
      bestRank = rank;
    }
  });

  return bestLabel;
};

const normalizeSearchText = (text: string) =>
  text
    .normalize('NFD')
    .replace(COMBINING_MARKS_PATTERN, '')
    .toLocaleLowerCase();

const getSearchHighlightTerms = (query: string) => {
  const normalizedQuery = normalizeSearchText(query).trim();
  const terms = normalizedQuery.match(SEARCH_TERM_PATTERN) ?? [];
  const seenTerms = new Set<string>();

  return terms.filter((term) => {
    if (seenTerms.has(term)) {
      return false;
    }

    seenTerms.add(term);
    return true;
  });
};

const getNormalizedTextMap = (text: string) => {
  const chars = Array.from(text);
  const originalIndexByNormalizedIndex: number[] = [];
  let normalizedText = '';

  chars.forEach((char, originalIndex) => {
    const normalizedChar = normalizeSearchText(char);
    normalizedText += normalizedChar;

    for (let index = 0; index < normalizedChar.length; index += 1) {
      originalIndexByNormalizedIndex.push(originalIndex);
    }
  });

  return { chars, normalizedText, originalIndexByNormalizedIndex };
};

const getSearchHighlightRanges = (
  text: string,
  terms: string[],
): { chars: string[]; ranges: SearchHighlightRange[] } => {
  const {
    chars,
    normalizedText,
    originalIndexByNormalizedIndex,
  } = getNormalizedTextMap(text);

  if (!normalizedText || terms.length === 0) {
    return { chars, ranges: [] };
  }

  const ranges: SearchHighlightRange[] = [];

  terms.forEach((term) => {
    let searchIndex = 0;

    while (searchIndex < normalizedText.length) {
      const matchIndex = normalizedText.indexOf(term, searchIndex);

      if (matchIndex < 0) {
        break;
      }

      const matchEndIndex = matchIndex + term.length - 1;
      const start = originalIndexByNormalizedIndex[matchIndex];
      const end = originalIndexByNormalizedIndex[matchEndIndex] + 1;

      if (Number.isFinite(start) && Number.isFinite(end)) {
        ranges.push({ start, end });
      }

      searchIndex = matchIndex + Math.max(term.length, 1);
    }
  });

  ranges.sort((first, second) => (
    first.start - second.start || second.end - first.end
  ));

  const mergedRanges = ranges.reduce<SearchHighlightRange[]>((merged, range) => {
    const previousRange = merged[merged.length - 1];

    if (!previousRange || range.start > previousRange.end) {
      merged.push({ ...range });
      return merged;
    }

    previousRange.end = Math.max(previousRange.end, range.end);
    return merged;
  }, []);

  return { chars, ranges: mergedRanges };
};

const renderHighlightedPreview = (
  text: string,
  searchTerms: string[],
): React.ReactNode => {
  const { chars, ranges } = getSearchHighlightRanges(text, searchTerms);

  if (ranges.length === 0) {
    return text;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  ranges.forEach((range, index) => {
    if (range.start > cursor) {
      parts.push(chars.slice(cursor, range.start).join(''));
    }

    parts.push(
      <Text key={`search-highlight-${index}`} style={styles.searchHighlight}>
        {chars.slice(range.start, range.end).join('')}
      </Text>,
    );
    cursor = range.end;
  });

  if (cursor < chars.length) {
    parts.push(chars.slice(cursor).join(''));
  }

  return parts;
};

export type TodoRowProps = {
  dateLabelDisplayMode?: DateLabelDisplayMode;
  filterColors: FilterColorSettings;
  hiddenMetaTagKinds?: HiddenMetaTagKind[];
  isSelected?: boolean;
  item: Todo;
  isMenuTarget: boolean;
  isMenuTargetHighlighted?: boolean;
  isNewlyCreated?: boolean;
  isRecentlyEdited?: boolean;
  isPendingDelete?: boolean;
  layout?: 'standalone' | 'grouped';
  metaTagVisibility: MetaTagVisibility;
  onDelete: (id: string) => void;
  onEnterSelectMode?: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onOpenMenu: (id: string) => void;
  onSetDone: (id: string, done: boolean) => void;
  onTouchStart?: (event: GestureResponderEvent) => void;
  onToggleSelect?: (id: string) => void;
  searchHighlightQuery?: string;
  sectionLabel?: string;
  selectMode?: boolean;
  showOverdueMetaTags?: boolean;
};

function TodoRowComponent({
  dateLabelDisplayMode = 'exact',
  filterColors,
  hiddenMetaTagKinds = [],
  isSelected = false,
  item,
  isMenuTarget,
  isMenuTargetHighlighted = false,
  isNewlyCreated = false,
  isRecentlyEdited = false,
  isPendingDelete = false,
  layout = 'standalone',
  metaTagVisibility,
  onDelete,
  onEnterSelectMode,
  onOpenDetail,
  onOpenMenu,
  onSetDone,
  onTouchStart,
  onToggleSelect,
  searchHighlightQuery = '',
  selectMode = false,
  showOverdueMetaTags = true,
}: TodoRowProps) {
  const swipeableRef = useRef<Swipeable | null>(null);
  const lastSelectLongPressAtRef = useRef(0);
  const [isSwipeOpen, setIsSwipeOpen] = useState(false);
  const [rowHeight, setRowHeight] = useState<number | null>(null);
  const isGroupedLayout = layout === 'grouped';
  const fallbackRowHeight = isGroupedLayout ? 52 : 56;
  const swipeActionAreaHeight = isGroupedLayout ? fallbackRowHeight : rowHeight ?? fallbackRowHeight;
  const swipeActionInset = isGroupedLayout ? 2 : 0;
  const rawDateStatusLabel = getBestTodoDateLabel(item.filters.date, item.createdAt);
  const listStatusLabel = item.filters.list[0] ?? '';
  const priorityStatusLabel = getBestOrderedFilterLabel(
    item.filters.priority,
    PRIORITY_MENU_ITEMS,
    '',
  );
  const itemBackgroundTheme = listStatusLabel
    ? getFilterColorTheme(filterColors, 'list', listStatusLabel)
    : null;
  const priorityRailTheme = priorityStatusLabel && priorityStatusLabel !== 'None'
    ? getFilterColorTheme(filterColors, 'priorityBorder', priorityStatusLabel)
    : null;
  const effectiveMetaTagVisibility = applyHiddenMetaTagKinds(
    metaTagVisibility,
    hiddenMetaTagKinds,
  );
  const content = item.content.trim();
  const contentPreview = getTodoRowTextPreview(content, TODO_ROW_CONTENT_PREVIEW_MAX_LENGTH);
  const displayTitle = useMemo(
    () => item.text.trim().replace(/\s+/g, ' '),
    [item.text],
  );
  const searchHighlightTerms = useMemo(
    () => getSearchHighlightTerms(searchHighlightQuery),
    [searchHighlightQuery],
  );
  const highlightedTitlePreview = useMemo(
    () => renderHighlightedPreview(displayTitle, searchHighlightTerms),
    [displayTitle, searchHighlightTerms],
  );
  const highlightedContentPreview = useMemo(
    () => renderHighlightedPreview(contentPreview, searchHighlightTerms),
    [contentPreview, searchHighlightTerms],
  );
  const isHighlightedForMenu = isMenuTargetHighlighted;
  const suppressChangeFill = isMenuTarget;
  const isHighlightedForCreate = isNewlyCreated && !suppressChangeFill;
  const isHighlightedForEdit =
    (isRecentlyEdited || isHighlightedForCreate) && !suppressChangeFill;
  const isHighlightedForSelection = selectMode && isSelected;
  const swipeEnabled = !isPendingDelete && !isMenuTarget && !selectMode;
  const useStaticRowContainer = selectMode;

  useEffect(() => {
    if (!isMenuTarget) {
      return;
    }

    swipeableRef.current?.close();
    setIsSwipeOpen(false);
  }, [isMenuTarget]);

  const handleRowLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height);

    if (nextHeight <= 0) {
      return;
    }

    setRowHeight((currentHeight) => (
      currentHeight === nextHeight ? currentHeight : nextHeight
    ));
  }, []);

  const closeSwipeable = useCallback(() => {
    swipeableRef.current?.close();
    setIsSwipeOpen(false);
  }, []);

  const closeOtherOpenSwipeable = useCallback(() => {
    const currentSwipeable = swipeableRef.current;

    if (openTodoSwipeable && openTodoSwipeable !== currentSwipeable) {
      openTodoSwipeable.close();
      return true;
    }

    return false;
  }, []);

  const toggleSelection = useCallback(() => {
    if (isPendingDelete) {
      return;
    }

    closeOtherOpenSwipeable();
    onToggleSelect?.(item.id);
    Haptics.selectionAsync().catch(() => undefined);
  }, [closeOtherOpenSwipeable, isPendingDelete, item.id, onToggleSelect]);

  const toggleDoneFromCheckbox = useCallback(() => {
    if (isPendingDelete) {
      return;
    }

    if (selectMode) {
      toggleSelection();
      return;
    }

    closeOtherOpenSwipeable();
    onSetDone(item.id, !item.done);
    Haptics.selectionAsync().catch(() => undefined);
  }, [
    closeOtherOpenSwipeable,
    isPendingDelete,
    item.done,
    item.id,
    onSetDone,
    selectMode,
    toggleSelection,
  ]);

  const toggleDoneFromSwipe = useCallback(() => {
    if (isPendingDelete) {
      return;
    }

    onSetDone(item.id, !item.done);
    Haptics.selectionAsync().catch(() => undefined);
    requestAnimationFrame(() => {
      closeSwipeable();
    });
  }, [closeSwipeable, isPendingDelete, item.done, item.id, onSetDone]);

  const openTodoMenu = useCallback(() => {
    if (isPendingDelete) {
      return;
    }

    closeOtherOpenSwipeable();
    onOpenMenu(item.id);
    closeSwipeable();
  }, [closeOtherOpenSwipeable, closeSwipeable, isPendingDelete, item.id, onOpenMenu]);

  const deleteTodoFromSwipe = useCallback(() => {
    if (isPendingDelete) {
      return;
    }

    closeSwipeable();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    requestAnimationFrame(() => onDelete(item.id));
  }, [closeSwipeable, isPendingDelete, item.id, onDelete]);

  const handleTodoPress = useCallback(() => {
    if (isPendingDelete) {
      return;
    }

    if (selectMode) {
      toggleSelection();
      return;
    }

    if (isSwipeOpen) {
      closeSwipeable();
      return;
    }

    if (closeOtherOpenSwipeable()) {
      return;
    }

    onOpenDetail(item.id);
  }, [
    closeOtherOpenSwipeable,
    closeSwipeable,
    isPendingDelete,
    isSwipeOpen,
    item.id,
    onOpenDetail,
    selectMode,
    toggleSelection,
  ]);

  const enterSelectMode = useCallback(() => {
    if (isPendingDelete) {
      return;
    }

    const now = Date.now();
    if (now - lastSelectLongPressAtRef.current < 240) {
      return;
    }
    lastSelectLongPressAtRef.current = now;

    closeOtherOpenSwipeable();

    if (selectMode) {
      toggleSelection();
      return;
    }

    onEnterSelectMode?.(item.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  }, [
    closeOtherOpenSwipeable,
    isPendingDelete,
    item.id,
    onEnterSelectMode,
    selectMode,
    toggleSelection,
  ]);

  const handleRowLongPressStateChange = useCallback((
    event: LongPressGestureHandlerStateChangeEvent,
  ) => {
    if (event.nativeEvent.state !== State.ACTIVE) {
      return;
    }

    enterSelectMode();
  }, [enterSelectMode]);

  const handleSwipeableWillOpen = useCallback(
    (direction: 'left' | 'right') => {
      if (isPendingDelete) {
        closeSwipeable();
        return;
      }

      setIsSwipeOpen(true);
      closeOtherOpenSwipeable();

      if (direction === 'right') {
        openTodoMenu();
        return;
      }

      Haptics.selectionAsync().catch(() => undefined);
    },
    [closeOtherOpenSwipeable, closeSwipeable, isPendingDelete, openTodoMenu],
  );

  const handleSwipeableOpenStartDrag = useCallback((_direction: 'left' | 'right') => {
    if (isPendingDelete) {
      return;
    }

    closeOtherOpenSwipeable();
  }, [closeOtherOpenSwipeable, isPendingDelete]);

  const handleSwipeableOpen = useCallback(
    (_direction: 'left' | 'right', swipeable: Swipeable) => {
      if (openTodoSwipeable && openTodoSwipeable !== swipeable) {
        openTodoSwipeable.close();
      }

      openTodoSwipeable = swipeable;
    },
    [],
  );

  const handleSwipeableClose = useCallback(
    (_direction: 'left' | 'right', swipeable: Swipeable) => {
      if (openTodoSwipeable === swipeable) {
        openTodoSwipeable = null;
      }

      setIsSwipeOpen(false);
    },
    [],
  );

  useEffect(
    () => () => {
      if (openTodoSwipeable === swipeableRef.current) {
        openTodoSwipeable = null;
      }
    },
    [],
  );

  const renderLeftActions = useCallback(
    (progress: SwipeActionAnimation) => {
      if (isPendingDelete) {
        return null;
      }

      const trackRevealStyle = {
        opacity: progress.interpolate({
          inputRange: [0, 0.35, 1],
          outputRange: [0, 0.85, 1],
          extrapolate: 'clamp',
        }),
      };
      const deleteRevealStyle = {
        transform: [
          {
            translateX: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [-10, 0],
              extrapolate: 'clamp',
            }),
          },
          {
            scale: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0.92, 1],
              extrapolate: 'clamp',
            }),
          },
        ],
      };
      const doneRevealStyle = {
        transform: [
          {
            translateX: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [-18, 0],
              extrapolate: 'clamp',
            }),
          },
          {
            scale: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0.88, 1],
              extrapolate: 'clamp',
            }),
          },
        ],
      };

      return (
        <View
          style={[
            styles.swipeActionsRoot,
            styles.swipeActionsRootLeft,
            swipeActionInset > 0 && {
              marginBottom: swipeActionInset,
              marginTop: swipeActionInset,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.swipeActionsRow,
              trackRevealStyle,
            ]}
          >
          <Animated.View style={[styles.swipeActionSlot, deleteRevealStyle]}>
            <GestureTouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Delete todo"
              activeOpacity={0.84}
              onPress={deleteTodoFromSwipe}
              style={styles.swipeActionButton}
            >
              <Ionicons
                color={SWIPE_DELETE}
                name="trash-outline"
                size={SWIPE_ACTION_ICON_SIZE}
              />
            </GestureTouchableOpacity>
          </Animated.View>
          <Animated.View style={[styles.swipeActionSlot, doneRevealStyle]}>
            <GestureTouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={item.done ? 'Mark todo active' : 'Mark todo done'}
              activeOpacity={0.84}
              onPress={toggleDoneFromSwipe}
              style={styles.swipeActionButton}
            >
              <Ionicons
                color={SWIPE_DONE}
                name={item.done ? 'arrow-undo' : 'checkmark'}
                size={SWIPE_ACTION_ICON_SIZE}
              />
            </GestureTouchableOpacity>
          </Animated.View>
          </Animated.View>
        </View>
      );
    },
    [
      deleteTodoFromSwipe,
      isPendingDelete,
      item.done,
      swipeActionInset,
      toggleDoneFromSwipe,
    ],
  );

  const renderRightActions = useCallback(
    (progress: SwipeActionAnimation) => {
      if (isPendingDelete) {
        return null;
      }

      const trackRevealStyle = {
        opacity: progress.interpolate({
          inputRange: [0, 0.35, 1],
          outputRange: [0, 0.85, 1],
          extrapolate: 'clamp',
        }),
      };
      const menuRevealStyle = {
        transform: [
          {
            translateX: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [12, 0],
              extrapolate: 'clamp',
            }),
          },
          {
            scale: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0.9, 1],
              extrapolate: 'clamp',
            }),
          },
        ],
      };

      return (
        <View
          style={[
            styles.swipeActionsRoot,
            styles.swipeActionsRootRight,
            swipeActionInset > 0 && {
              marginBottom: swipeActionInset,
              marginTop: swipeActionInset,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.swipeActionsRow,
              styles.swipeActionsRowRight,
              trackRevealStyle,
            ]}
          >
          <Animated.View style={[styles.swipeActionSlot, menuRevealStyle]}>
            <GestureTouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Open todo menu"
              activeOpacity={0.84}
              onPress={openTodoMenu}
              style={styles.swipeActionButton}
            >
              <Ionicons
                color={SWIPE_MENU}
                name="menu"
                size={SWIPE_ACTION_ICON_SIZE}
              />
            </GestureTouchableOpacity>
          </Animated.View>
          </Animated.View>
        </View>
      );
    },
    [
      isPendingDelete,
      openTodoMenu,
      swipeActionInset,
    ],
  );

  const rowContent = (
    <LongPressGestureHandler
      enabled={!isPendingDelete}
      minDurationMs={280}
      onHandlerStateChange={handleRowLongPressStateChange}
    >
      <View
        collapsable={false}
        onLayout={isGroupedLayout ? undefined : handleRowLayout}
        style={[
          styles.row,
          isGroupedLayout && styles.rowGrouped,
          itemBackgroundTheme && !item.done && !isPendingDelete && {
            backgroundColor: itemBackgroundTheme.tint,
            borderColor: itemBackgroundTheme.border,
            shadowColor: itemBackgroundTheme.accent,
          },
          item.pinned && !item.done && !isPendingDelete && (
            isGroupedLayout ? styles.rowPinnedGrouped : styles.rowPinned
          ),
          isPendingDelete && styles.rowPendingDelete,
          isHighlightedForMenu && (
            isGroupedLayout ? styles.rowMenuTargetGrouped : styles.rowMenuTarget
          ),
          isHighlightedForEdit && (
            isGroupedLayout ? styles.rowRecentlyEditedGrouped : styles.rowRecentlyEdited
          ),
          isHighlightedForSelection && (
            isGroupedLayout ? styles.rowSelectedGrouped : styles.rowSelected
          ),
        ]}
      >
        {priorityRailTheme ? (
          <View
            style={[
              styles.colorRail,
              isGroupedLayout && styles.colorRailGrouped,
              { backgroundColor: priorityRailTheme.accent },
              item.done && styles.colorRailDone,
            ]}
          />
        ) : null}
        <GestureTouchableOpacity
          accessibilityRole={selectMode ? 'button' : 'checkbox'}
          accessibilityState={selectMode ? { selected: isSelected } : { checked: item.done }}
          accessibilityLabel={
            selectMode
              ? (isSelected ? 'Deselect todo' : 'Select todo')
              : (item.done ? 'Mark todo active' : 'Mark todo done')
          }
          activeOpacity={0.72}
          disabled={isPendingDelete}
          onPress={toggleDoneFromCheckbox}
          style={styles.checkboxPressable}
        >
          <View
            style={[
              styles.checkbox,
              selectMode
                ? [
                    styles.checkboxSelectMode,
                    isSelected && styles.checkboxSelectModeSelected,
                  ]
                : (item.done && styles.checkboxChecked),
            ]}
          >
            {selectMode ? (
              isSelected ? <View style={styles.checkboxSelectModeDot} /> : null
            ) : item.done ? (
              <Ionicons color={THEME_CARD} name="checkmark" size={14} />
            ) : null}
          </View>
        </GestureTouchableOpacity>
        <GestureTouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={
            isPendingDelete
              ? `Deleting todo: ${item.text}`
              : selectMode
                ? (isSelected ? `Deselect todo: ${item.text}` : `Select todo: ${item.text}`)
                : `Open todo details: ${item.text}`
          }
          activeOpacity={1}
          delayLongPress={280}
          disabled={isPendingDelete}
          onLongPress={enterSelectMode}
          onPress={handleTodoPress}
          style={styles.textPressable}
        >
          <View
            style={[
              styles.contentColumn,
              isGroupedLayout && styles.contentColumnGrouped,
            ]}
          >
            <View
              style={[
                styles.titleBlock,
                item.pinned && styles.titleBlockPinned,
              ]}
            >
              <Text
                ellipsizeMode="tail"
                numberOfLines={2}
                style={[
                  styles.text,
                  item.done && styles.textDone,
                  isPendingDelete && styles.textPendingDelete,
                ]}
              >
                {highlightedTitlePreview}
              </Text>
              {item.pinned ? (
                <Ionicons
                  color={item.done || isPendingDelete ? THEME_TEXT_SECONDARY : THEME_ACCENT}
                  name="pin"
                  size={14}
                  style={styles.pinnedIcon}
                />
              ) : null}
            </View>
            {contentPreview ? (
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                style={[
                  styles.content,
                  item.done && styles.contentDone,
                  isPendingDelete && styles.contentPendingDelete,
                ]}
              >
                {highlightedContentPreview}
              </Text>
            ) : null}
            {isPendingDelete ? (
              <Text style={styles.pendingDeleteText}>Deleting...</Text>
            ) : (
              <TodoMetaTags
                createdAt={item.createdAt}
                dateLabel={rawDateStatusLabel || undefined}
                dateLabelAnchor={item.createdAt}
                dateLabelDisplayMode={dateLabelDisplayMode}
                done={item.done}
                filterColors={filterColors}
                listLabel={listStatusLabel || undefined}
                priorityLabel={
                  priorityStatusLabel && priorityStatusLabel !== 'None'
                    ? priorityStatusLabel
                    : undefined
                }
                reminderValues={item.filters.reminder}
                showOverdueMetaTags={showOverdueMetaTags}
                visibility={effectiveMetaTagVisibility}
              />
            )}
          </View>
        </GestureTouchableOpacity>
      </View>
    </LongPressGestureHandler>
  );

  return (
    <View
      onTouchStart={onTouchStart}
      style={[
        styles.shell,
        isGroupedLayout && styles.shellGrouped,
        isHighlightedForMenu && styles.shellMenuTarget,
      ]}
    >
      {useStaticRowContainer ? (
        <View
          pointerEvents={selectMode ? 'none' : 'auto'}
          style={[
            styles.swipeableContainer,
            isGroupedLayout && styles.swipeableContainerGrouped,
            { minHeight: swipeActionAreaHeight },
          ]}
        >
          <View
            style={[
              styles.swipeableChildren,
              isGroupedLayout && styles.swipeableChildrenGrouped,
              isHighlightedForSelection &&
                isGroupedLayout &&
                styles.swipeableChildrenGroupedSelected,
              isHighlightedForEdit &&
                isGroupedLayout &&
                styles.swipeableChildrenGroupedRecentlyEdited,
            ]}
          >
            {rowContent}
          </View>
        </View>
      ) : (
        <Swipeable
          key={isMenuTarget ? `${item.id}-menu` : item.id}
          ref={swipeableRef}
          animationOptions={{ bounciness: 2, speed: 18 }}
          childrenContainerStyle={[
            styles.swipeableChildren,
            isGroupedLayout && styles.swipeableChildrenGrouped,
            isHighlightedForSelection &&
              isGroupedLayout &&
              styles.swipeableChildrenGroupedSelected,
            isHighlightedForEdit &&
              isGroupedLayout &&
              styles.swipeableChildrenGroupedRecentlyEdited,
          ]}
          containerStyle={[
            styles.swipeableContainer,
            isGroupedLayout && styles.swipeableContainerGrouped,
            { minHeight: swipeActionAreaHeight },
          ]}
          dragOffsetFromLeftEdge={12}
          dragOffsetFromRightEdge={12}
          enabled={swipeEnabled}
          friction={1.35}
          leftThreshold={LEFT_SWIPE_OPEN_DISTANCE}
          onSwipeableClose={handleSwipeableClose}
          onSwipeableOpen={handleSwipeableOpen}
          onSwipeableOpenStartDrag={handleSwipeableOpenStartDrag}
          onSwipeableWillOpen={handleSwipeableWillOpen}
          overshootLeft={false}
          overshootRight={false}
          renderLeftActions={swipeEnabled ? renderLeftActions : undefined}
          renderRightActions={swipeEnabled ? renderRightActions : undefined}
          rightThreshold={RIGHT_SWIPE_OPEN_DISTANCE}
        >
          {rowContent}
        </Swipeable>
      )}
      {selectMode ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
          accessibilityLabel={isSelected ? `Deselect todo: ${item.text}` : `Select todo: ${item.text}`}
          disabled={isPendingDelete}
          onPress={toggleSelection}
          style={styles.selectModeRowPressable}
        />
      ) : null}
      {isHighlightedForMenu ? (
        <View
          pointerEvents="none"
          style={[
            styles.selectionFrame,
            isGroupedLayout && styles.selectionFrameGrouped,
          ]}
        />
      ) : null}
    </View>
  );
}

const areTodoRowPropsEqual = (prev: TodoRowProps, next: TodoRowProps) => (
  prev.isNewlyCreated === next.isNewlyCreated &&
  prev.isRecentlyEdited === next.isRecentlyEdited &&
  prev.isMenuTargetHighlighted === next.isMenuTargetHighlighted &&
  prev.isMenuTarget === next.isMenuTarget &&
  prev.isSelected === next.isSelected &&
  prev.isPendingDelete === next.isPendingDelete &&
  prev.selectMode === next.selectMode &&
  prev.layout === next.layout &&
  prev.sectionLabel === next.sectionLabel &&
  prev.dateLabelDisplayMode === next.dateLabelDisplayMode &&
  prev.showOverdueMetaTags === next.showOverdueMetaTags &&
  prev.item === next.item &&
  prev.filterColors === next.filterColors &&
  prev.metaTagVisibility === next.metaTagVisibility &&
  prev.hiddenMetaTagKinds === next.hiddenMetaTagKinds &&
  prev.onDelete === next.onDelete &&
  prev.onOpenDetail === next.onOpenDetail &&
  prev.onOpenMenu === next.onOpenMenu &&
  prev.onSetDone === next.onSetDone &&
  prev.searchHighlightQuery === next.searchHighlightQuery &&
  prev.onEnterSelectMode === next.onEnterSelectMode &&
  prev.onTouchStart === next.onTouchStart &&
  prev.onToggleSelect === next.onToggleSelect
);

export const TodoRow = React.memo(TodoRowComponent, areTodoRowPropsEqual);

const styles = StyleSheet.create({
  shell: {
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    minHeight: 56,
    position: 'relative',
    width: '100%',
  },
  shellGrouped: {
    minHeight: 52,
  },
  shellMenuTarget: {
    zIndex: 2,
    shadowColor: THEME_ACCENT,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  selectionFrame: {
    borderColor: THEME_MENU_TARGET_BORDER,
    borderRadius: 3,
    borderWidth: 1,
    bottom: -3,
    left: -3,
    position: 'absolute',
    right: -3,
    top: -3,
    zIndex: 3,
  },
  selectionFrameGrouped: {
    bottom: 1,
    left: -7,
    right: -7,
    top: 1,
  },
  selectionFrameSelected: {
    borderRadius: ROW_BORDER_RADIUS,
    bottom: 3,
    left: -6,
    right: -6,
    top: 3,
  },
  selectionFrameSelectedGrouped: {
    bottom: 4,
    left: -10,
    right: -10,
    top: 4,
  },
  swipeableContainer: {
    alignSelf: 'stretch',
    borderRadius: ROW_BORDER_RADIUS,
    minHeight: 56,
    overflow: 'hidden',
    width: '100%',
  },
  swipeableContainerGrouped: {
    alignSelf: 'stretch',
    borderRadius: 0,
    minHeight: 52,
    overflow: 'visible',
    width: '100%',
  },
  swipeableChildren: {
    alignSelf: 'stretch',
    borderRadius: ROW_BORDER_RADIUS,
    flex: 1,
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    width: '100%',
  },
  swipeableChildrenGrouped: {
    backgroundColor: THEME_CARD,
    borderRadius: 0,
    flex: 1,
    flexGrow: 1,
    minWidth: 0,
    overflow: 'visible',
    width: '100%',
  },
  swipeableChildrenGroupedRecentlyEdited: {
    backgroundColor: 'transparent',
  },
  swipeableChildrenGroupedSelected: {
    backgroundColor: 'transparent',
  },
  swipeActionsRoot: {
    alignSelf: 'stretch',
  },
  swipeActionsRootLeft: {
    width: LEFT_SWIPE_ACTION_WIDTH,
  },
  swipeActionsRootRight: {
    width: RIGHT_SWIPE_ACTION_WIDTH,
  },
  swipeActionsRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SWIPE_ACTION_GAP,
    justifyContent: 'center',
    paddingHorizontal: SWIPE_ACTION_EDGE_PADDING,
  },
  swipeActionsRowRight: {
    justifyContent: 'flex-end',
  },
  swipeActionSlot: {
    alignItems: 'center',
    height: SWIPE_ACTION_BUTTON_WIDTH,
    justifyContent: 'center',
    width: SWIPE_ACTION_BUTTON_WIDTH,
  },
  swipeActionButton: {
    alignItems: 'center',
    borderRadius: SWIPE_ACTION_BUTTON_WIDTH / 2,
    height: SWIPE_ACTION_BUTTON_WIDTH,
    justifyContent: 'center',
    width: SWIPE_ACTION_BUTTON_WIDTH,
  },
  row: {
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    backgroundColor: THEME_CARD,
    borderColor: THEME_BORDER,
    borderRadius: ROW_BORDER_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 1,
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    width: '100%',
  },
  rowGrouped: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    elevation: 0,
    minHeight: 52,
    paddingHorizontal: 0,
    paddingVertical: 12,
    shadowOpacity: 0,
    width: '100%',
  },
  rowPendingDelete: {
    backgroundColor: '#F6F7F9',
    borderColor: '#E0E2E7',
    opacity: 0.68,
    shadowOpacity: 0,
    elevation: 0,
  },
  rowPinned: {
    backgroundColor: '#F7F9FF',
    borderColor: 'rgba(76, 120, 255, 0.2)',
    shadowColor: THEME_ACCENT,
    shadowOpacity: 0.05,
  },
  rowPinnedGrouped: {
    backgroundColor: 'rgba(76, 120, 255, 0.04)',
  },
  rowMenuTarget: {
    borderColor: THEME_MENU_TARGET_BORDER,
    elevation: 0,
    shadowOpacity: 0,
  },
  rowMenuTargetGrouped: {
    backgroundColor: 'transparent',
  },
  rowRecentlyEdited: {
    backgroundColor: THEME_ACCENT_SOFT,
  },
  rowRecentlyEditedGrouped: {
    backgroundColor: 'transparent',
  },
  rowSelected: {
    backgroundColor: THEME_ACCENT_SOFT,
    borderColor: THEME_ACCENT_SELECTION_BORDER,
    elevation: 0,
    shadowOpacity: 0,
  },
  rowSelectedGrouped: {
    backgroundColor: THEME_ACCENT_SOFT,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  selectModeRowPressable: {
    bottom: 0,
    elevation: 3,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  colorRail: {
    alignSelf: 'stretch',
    borderRadius: 2,
    marginRight: 12,
    marginVertical: 2,
    width: 5,
  },
  colorRailGrouped: {
    marginRight: 10,
    marginVertical: 0,
    width: 4,
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
  checkboxSelectMode: {
    backgroundColor: THEME_CARD,
    borderColor: 'rgba(76, 120, 255, 0.52)',
    borderRadius: 11,
  },
  checkboxSelectModeSelected: {
    borderColor: THEME_ACCENT,
  },
  checkboxSelectModeDot: {
    backgroundColor: THEME_ACCENT,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  textPressable: {
    alignSelf: 'stretch',
    flex: 1,
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    width: '100%',
  },
  contentColumn: {
    alignItems: 'stretch',
    alignSelf: 'stretch',
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingRight: TODO_ROW_TEXT_RIGHT_INSET,
    width: '100%',
  },
  contentColumnGrouped: {
    paddingRight: TODO_ROW_GROUPED_TEXT_RIGHT_INSET,
  },
  titleBlock: {
    alignSelf: 'stretch',
    minWidth: 0,
    position: 'relative',
    width: '100%',
  },
  titleBlockPinned: {
    paddingRight: 22,
  },
  text: {
    color: THEME_TEXT,
    fontSize: 16,
    fontWeight: FONT_REGULAR,
    includeFontPadding: false,
    lineHeight: 21,
  },
  textDone: {
    color: THEME_TEXT_SECONDARY,
    textDecorationLine: 'line-through',
  },
  content: {
    alignSelf: 'stretch',
    color: '#5F5B57',
    flexShrink: 1,
    fontSize: 14,
    fontWeight: FONT_REGULAR,
    lineHeight: 19,
    marginTop: 3,
    minWidth: 0,
  },
  contentDone: {
    color: THEME_TEXT_SECONDARY,
    textDecorationLine: 'line-through',
  },
  pinnedIcon: {
    position: 'absolute',
    right: 0,
    top: 3,
  },
  searchHighlight: {
    backgroundColor: 'rgba(255, 211, 87, 0.55)',
  },
  textPendingDelete: {
    color: THEME_TEXT_SECONDARY,
    textDecorationLine: 'line-through',
  },
  contentPendingDelete: {
    color: THEME_TEXT_SECONDARY,
  },
  pendingDeleteText: {
    color: SWIPE_DELETE,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    marginTop: 6,
  },
});
