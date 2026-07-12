import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  type GestureResponderEvent,
  PanResponder,
  Platform,
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
import { triggerSubtleHaptic } from '../haptics';
import {
  getBestOrderedFilterLabel,
  PRIORITY_MENU_ITEMS,
} from '../todoOptions';
import { getEffectiveTodoDateLabels } from '../todoDates';
import {
  TODO_ROW_TITLE_MAX_CHARS,
  type Todo,
} from '../todos';

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
const ROW_BORDER_RADIUS = 14;
const GROUPED_ROW_MIN_HEIGHT = 52;
const SWIPE_ACTION_BUTTON_WIDTH = 48;
const SWIPE_ACTION_EDGE_PADDING = 10;
const SWIPE_ACTION_GAP = 6;
const SWIPE_ACTION_ICON_SIZE = 24;
const LEFT_SWIPE_ACTION_WIDTH =
  (SWIPE_ACTION_BUTTON_WIDTH * 2) + SWIPE_ACTION_GAP + (SWIPE_ACTION_EDGE_PADDING * 2);
const RIGHT_SWIPE_ACTION_WIDTH = SWIPE_ACTION_BUTTON_WIDTH + (SWIPE_ACTION_EDGE_PADDING * 2);
const LEFT_SWIPE_OPEN_DISTANCE = 44;
const RIGHT_SWIPE_OPEN_DISTANCE = 38;
const SWIPE_DRAG_START_DISTANCE = 8;
const GROUPED_SWIPE_DRAG_START_DISTANCE = 6;
const GROUPED_SWIPE_DIRECTION_RATIO = 1.1;
const TODO_ROW_CONTENT_PREVIEW_MAX_LENGTH = TODO_ROW_TITLE_MAX_CHARS;
const TODO_ROW_PREVIEW_ELLIPSIS = '...';
const TODO_ROW_MOBILE_TITLE_WRAP_COLUMN = 28;
const TODO_ROW_MOBILE_MAX_WIDTH = 480;
const TODO_ROW_TEXT_RIGHT_INSET = 0;
const TODO_ROW_GROUPED_TEXT_RIGHT_INSET = 0;
const TODO_ROW_CHECKBOX_LONG_PRESS_WIDTH = 56;
const TODO_ROW_GROUPED_CHECKBOX_LONG_PRESS_WIDTH = 52;
const TODO_ROW_PRIORITY_RAIL_LONG_PRESS_OFFSET = 17;
const TODO_ROW_GROUPED_PRIORITY_RAIL_LONG_PRESS_OFFSET = 14;
const COMBINING_MARKS_PATTERN = /[\u0300-\u036f]/g;
const SEARCH_TERM_PATTERN = /[\p{L}\p{N}_]+/gu;
const ZERO_WIDTH_SPACER_PATTERN = /[\u200B\uFEFF]/g;

type SearchHighlightRange = {
  end: number;
  start: number;
};

type SwipeActionAnimation = ReturnType<Animated.Value['interpolate']>;

const isCheckboxLongPress = (
  event: LongPressGestureHandlerStateChangeEvent,
  options: {
    grouped: boolean;
    hasPriorityRail: boolean;
  },
) => {
  const localX = event.nativeEvent.x;

  if (!Number.isFinite(localX)) {
    return false;
  }

  const baseWidth = options.grouped
    ? TODO_ROW_GROUPED_CHECKBOX_LONG_PRESS_WIDTH
    : TODO_ROW_CHECKBOX_LONG_PRESS_WIDTH;
  const railOffset = options.hasPriorityRail
    ? options.grouped
      ? TODO_ROW_GROUPED_PRIORITY_RAIL_LONG_PRESS_OFFSET
      : TODO_ROW_PRIORITY_RAIL_LONG_PRESS_OFFSET
    : 0;

  return localX <= baseWidth + railOffset;
};

type TodoSwipeController = {
  close: () => void;
};

type GroupedTodoSwipeContainerProps = {
  children: React.ReactNode;
  enabled: boolean;
  isDone: boolean;
  onClose: (controller: TodoSwipeController) => void;
  onDelete: () => void;
  onDone: () => void;
  onMenu: () => void;
  onOpen: (controller: TodoSwipeController) => void;
  onStart: () => void;
};

let openTodoSwipeable: TodoSwipeController | null = null;

const GroupedTodoSwipeContainer = React.forwardRef<
  TodoSwipeController,
  GroupedTodoSwipeContainerProps
>(function GroupedTodoSwipeContainer({
  children,
  enabled,
  isDone,
  onClose,
  onDelete,
  onDone,
  onMenu,
  onOpen,
  onStart,
}, forwardedRef) {
  const translateX = useRef(new Animated.Value(0)).current;
  const controllerRef = useRef<TodoSwipeController | null>(null);
  const isOpenRef = useRef(false);
  const swipeAnimationRunRef = useRef(0);
  const [actionsVisible, setActionsVisible] = useState(false);

  const close = useCallback(() => {
    const runId = swipeAnimationRunRef.current + 1;
    swipeAnimationRunRef.current = runId;
    Animated.spring(translateX, {
      bounciness: 0,
      speed: 24,
      toValue: 0,
      useNativeDriver: true,
    }).start(() => {
      if (swipeAnimationRunRef.current !== runId) {
        return;
      }

      if (isOpenRef.current && controllerRef.current) {
        isOpenRef.current = false;
        onClose(controllerRef.current);
      }
      setActionsVisible(false);
    });
  }, [onClose, translateX]);

  const controller = useMemo<TodoSwipeController>(() => ({ close }), [close]);
  controllerRef.current = controller;
  React.useImperativeHandle(forwardedRef, () => controller, [controller]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, gesture) => (
      enabled &&
      Math.abs(gesture.dx) > GROUPED_SWIPE_DRAG_START_DISTANCE &&
      Math.abs(gesture.dx) > Math.abs(gesture.dy) * GROUPED_SWIPE_DIRECTION_RATIO
    ),
    onPanResponderGrant: () => {
      swipeAnimationRunRef.current += 1;
      translateX.stopAnimation();
      onStart();
      setActionsVisible(true);
    },
    onPanResponderMove: (_event, gesture) => {
      translateX.setValue(Math.max(
        -RIGHT_SWIPE_ACTION_WIDTH,
        Math.min(LEFT_SWIPE_ACTION_WIDTH, gesture.dx),
      ));
    },
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dx > LEFT_SWIPE_OPEN_DISTANCE) {
        swipeAnimationRunRef.current += 1;
        setActionsVisible(true);
        Animated.spring(translateX, {
          bounciness: 2,
          speed: 18,
          toValue: LEFT_SWIPE_ACTION_WIDTH,
          useNativeDriver: true,
        }).start();
        isOpenRef.current = true;
        onOpen(controller);
        return;
      }

      if (gesture.dx < -RIGHT_SWIPE_OPEN_DISTANCE) {
        const runId = swipeAnimationRunRef.current + 1;
        swipeAnimationRunRef.current = runId;
        Animated.timing(translateX, {
          duration: 90,
          toValue: 0,
          useNativeDriver: true,
        }).start(() => {
          if (swipeAnimationRunRef.current !== runId) {
            return;
          }

          setActionsVisible(false);
          onMenu();
        });
        return;
      }

      close();
    },
    onPanResponderTerminate: close,
    onPanResponderTerminationRequest: () => false,
  }), [close, controller, enabled, onMenu, onOpen, onStart, translateX]);

  useEffect(() => () => {
    if (isOpenRef.current && controllerRef.current) {
      onClose(controllerRef.current);
    }
  }, [onClose]);

  const shouldRenderActions = actionsVisible || isOpenRef.current;

  return (
    <View style={styles.lightweightSwipeContainer}>
      {shouldRenderActions ? (
        <>
          <View style={styles.lightweightSwipeActionsLeft}>
            <GestureTouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Delete todo"
              activeOpacity={0.84}
              onPress={onDelete}
              style={styles.swipeActionButton}
            >
              <Ionicons
                color={SWIPE_DELETE}
                name="trash-outline"
                size={SWIPE_ACTION_ICON_SIZE}
              />
            </GestureTouchableOpacity>
            <GestureTouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={isDone ? 'Mark todo active' : 'Mark todo done'}
              activeOpacity={0.84}
              onPress={onDone}
              style={styles.swipeActionButton}
            >
              <Ionicons
                color={SWIPE_DONE}
                name={isDone ? 'arrow-undo' : 'checkmark'}
                size={SWIPE_ACTION_ICON_SIZE}
              />
            </GestureTouchableOpacity>
          </View>
          <View style={styles.lightweightSwipeActionsRight}>
            <GestureTouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Open todo menu"
              activeOpacity={0.84}
              onPress={onMenu}
              style={styles.swipeActionButton}
            >
              <Ionicons
                color={SWIPE_MENU}
                name="menu"
                size={SWIPE_ACTION_ICON_SIZE}
              />
            </GestureTouchableOpacity>
          </View>
        </>
      ) : null}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.lightweightSwipeSurface,
          { transform: [{ translateX }] },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
});

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

const wrapTextAtWordBoundaries = (text: string, maxLineLength: number) => {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (currentLine && nextLine.length > maxLineLength) {
      lines.push(currentLine);
      currentLine = word;
      return;
    }

    currentLine = nextLine;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join('\n');
};

const getBestTodoDateLabel = (todo: Todo): string => {
  const now = new Date();
  let bestLabel = '';
  let bestRank = getDateFilterSortRank('', now, todo.createdAt);

  getEffectiveTodoDateLabels(todo, now).forEach((label, index) => {
    const rank = getDateFilterSortRank(label, now, todo.createdAt);

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
  if (searchTerms.length === 0) {
    return text;
  }

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
  dateStatusKey: string;
  dateLabelDisplayMode?: DateLabelDisplayMode;
  filterColors: FilterColorSettings;
  hiddenMetaTagKinds?: HiddenMetaTagKind[];
  isSelected?: boolean;
  item: Todo;
  isCompletionFeedback?: boolean;
  isMenuTarget: boolean;
  isMenuTargetHighlighted?: boolean;
  isNewlyCreated?: boolean;
  isRecentlyEdited?: boolean;
  isPendingDelete?: boolean;
  layout?: 'standalone' | 'grouped';
  metaTagVisibility: MetaTagVisibility;
  onDelete: (id: string) => void;
  onCreateFromSettings?: (todo: Todo) => void;
  onCreateFromSettingsHoldEnd?: () => void;
  onCreateFromSettingsHoldStart?: () => void;
  onEnterSelectMode?: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onOpenMenu: (id: string) => void;
  onSetDone: (id: string, done: boolean) => void;
  onTouchStart?: (event: GestureResponderEvent) => void;
  onToggleSelect?: (id: string) => void;
  searchHighlightQuery?: string;
  searchHighlightContent?: boolean;
  sectionLabel?: string;
  selectMode?: boolean;
  showOverdueMetaTags?: boolean;
  showPriorityRail?: boolean;
  swipeDisabled?: boolean;
  viewportWidth: number;
};

function TodoRowComponent({
  dateStatusKey,
  dateLabelDisplayMode = 'exact',
  filterColors,
  hiddenMetaTagKinds = [],
  isCompletionFeedback = false,
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
  onCreateFromSettings,
  onCreateFromSettingsHoldEnd,
  onCreateFromSettingsHoldStart,
  onEnterSelectMode,
  onOpenDetail,
  onOpenMenu,
  onSetDone,
  onTouchStart,
  onToggleSelect,
  searchHighlightQuery = '',
  searchHighlightContent = true,
  selectMode = false,
  showOverdueMetaTags = true,
  showPriorityRail = true,
  swipeDisabled = false,
  viewportWidth,
}: TodoRowProps) {
  const swipeableRef = useRef<Swipeable | null>(null);
  const groupedSwipeableRef = useRef<TodoSwipeController | null>(null);
  const createFromSettingsLongPressActiveRef = useRef(false);
  const [isSwipeOpen, setIsSwipeOpen] = useState(false);
  const [rowHeight, setRowHeight] = useState<number | null>(null);
  const isGroupedLayout = layout === 'grouped';
  const fallbackRowHeight = isGroupedLayout ? GROUPED_ROW_MIN_HEIGHT : 56;
  const swipeActionAreaHeight = isGroupedLayout ? fallbackRowHeight : rowHeight ?? fallbackRowHeight;
  const swipeActionInset = isGroupedLayout ? 2 : 0;
  const effectiveMetaTagVisibility = applyHiddenMetaTagKinds(
    metaTagVisibility,
    hiddenMetaTagKinds,
  );
  const rawDateStatusLabel = effectiveMetaTagVisibility.date
    ? getBestTodoDateLabel(item)
    : '';
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
    ? (
        getFilterColorTheme(filterColors, 'priorityBorder', priorityStatusLabel) ??
        getFilterColorTheme(filterColors, 'priority', priorityStatusLabel)
      )
    : null;
  const content = item.content.replace(ZERO_WIDTH_SPACER_PATTERN, '').trim();
  const contentPreview = getTodoRowTextPreview(content, TODO_ROW_CONTENT_PREVIEW_MAX_LENGTH);
  const displayTitle = useMemo(
    () => item.text.trim().replace(/\s+/g, ' '),
    [item.text],
  );
  const wrappedDisplayTitle = useMemo(
    () => (
      isGroupedLayout && viewportWidth <= TODO_ROW_MOBILE_MAX_WIDTH
        ? wrapTextAtWordBoundaries(displayTitle, TODO_ROW_MOBILE_TITLE_WRAP_COLUMN)
        : displayTitle
    ),
    [displayTitle, isGroupedLayout, viewportWidth],
  );
  const searchHighlightTerms = useMemo(
    () => getSearchHighlightTerms(searchHighlightQuery),
    [searchHighlightQuery],
  );
  const highlightedTitlePreview = useMemo(
    () => renderHighlightedPreview(wrappedDisplayTitle, searchHighlightTerms),
    [searchHighlightTerms, wrappedDisplayTitle],
  );
  const highlightedContentPreview = useMemo(
    () => (
      searchHighlightContent
        ? renderHighlightedPreview(contentPreview, searchHighlightTerms)
        : contentPreview
    ),
    [contentPreview, searchHighlightContent, searchHighlightTerms],
  );
  const isHighlightedForMenu = isMenuTargetHighlighted;
  const suppressChangeFill = isMenuTarget;
  const isHighlightedForCreate = isNewlyCreated && !suppressChangeFill;
  const isHighlightedForEdit =
    (isRecentlyEdited || isHighlightedForCreate || isCompletionFeedback) && !suppressChangeFill;
  const isHighlightedForSelection = selectMode && isSelected;
  const isVisuallyDone = item.done || isCompletionFeedback;
  const swipeEnabled = !swipeDisabled && !isPendingDelete && !isMenuTarget && !selectMode;
  const useStaticRowContainer = selectMode;
  const hasDisplayTitle = displayTitle.replace(ZERO_WIDTH_SPACER_PATTERN, '').trim().length > 0;
  const canCreateFromSettings =
    !selectMode &&
    !isPendingDelete &&
    !isCompletionFeedback &&
    Boolean(onCreateFromSettings);

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
    groupedSwipeableRef.current?.close();
    setIsSwipeOpen(false);
  }, []);

  const closeOtherOpenSwipeable = useCallback(() => {
    const currentSwipeable = isGroupedLayout
      ? groupedSwipeableRef.current
      : swipeableRef.current;

    if (openTodoSwipeable && openTodoSwipeable !== currentSwipeable) {
      openTodoSwipeable.close();
      return true;
    }

    return false;
  }, [isGroupedLayout]);

  const toggleSelection = useCallback(() => {
    if (isPendingDelete || isCompletionFeedback) {
      return;
    }

    closeOtherOpenSwipeable();
    onToggleSelect?.(item.id);
    triggerSubtleHaptic();
  }, [closeOtherOpenSwipeable, isPendingDelete, item.id, onToggleSelect]);

  const openCreateFromTodoSettings = useCallback(() => {
    if (!canCreateFromSettings) {
      return;
    }

    closeOtherOpenSwipeable();
    onCreateFromSettings?.(item);
  }, [
    canCreateFromSettings,
    closeOtherOpenSwipeable,
    item,
    onCreateFromSettings,
  ]);

  const toggleDoneFromSwipe = useCallback(() => {
    if (isPendingDelete || isCompletionFeedback) {
      return;
    }

    onSetDone(item.id, !isVisuallyDone);
    triggerSubtleHaptic();
    requestAnimationFrame(() => {
      closeSwipeable();
    });
  }, [
    closeSwipeable,
    isCompletionFeedback,
    isPendingDelete,
    item.id,
    isVisuallyDone,
    onSetDone,
  ]);

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
    triggerSubtleHaptic();
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

    closeOtherOpenSwipeable();

    if (selectMode) {
      toggleSelection();
      return;
    }

    onEnterSelectMode?.(item.id);
    triggerSubtleHaptic();
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
    const createHoldTarget =
      canCreateFromSettings &&
      isCheckboxLongPress(event, {
        grouped: isGroupedLayout,
        hasPriorityRail: Boolean(priorityRailTheme),
      });

    if (event.nativeEvent.state === State.BEGAN) {
      createFromSettingsLongPressActiveRef.current = false;
      return;
    }

    if (
      event.nativeEvent.state === State.END ||
      event.nativeEvent.state === State.CANCELLED ||
      event.nativeEvent.state === State.FAILED
    ) {
      const shouldOpenCreateFromSettings =
        createFromSettingsLongPressActiveRef.current &&
        event.nativeEvent.state === State.END;

      createFromSettingsLongPressActiveRef.current = false;
      onCreateFromSettingsHoldEnd?.();

      if (shouldOpenCreateFromSettings) {
        openCreateFromTodoSettings();
      }

      return;
    }

    if (event.nativeEvent.state !== State.ACTIVE) {
      return;
    }

    if (createHoldTarget) {
      createFromSettingsLongPressActiveRef.current = true;
      onCreateFromSettingsHoldStart?.();
      return;
    }

    createFromSettingsLongPressActiveRef.current = false;
    onCreateFromSettingsHoldEnd?.();
    enterSelectMode();
  }, [
    canCreateFromSettings,
    enterSelectMode,
    isGroupedLayout,
    onCreateFromSettingsHoldEnd,
    onCreateFromSettingsHoldStart,
    openCreateFromTodoSettings,
    priorityRailTheme,
  ]);

  const handleSwipeableWillOpen = useCallback(
    (direction: 'left' | 'right') => {
      if (isPendingDelete) {
        closeSwipeable();
        return;
      }

      if (direction === 'right') {
        return;
      }

      setIsSwipeOpen(true);
      closeOtherOpenSwipeable();
      triggerSubtleHaptic();
    },
    [closeOtherOpenSwipeable, closeSwipeable, isPendingDelete],
  );

  const handleSwipeableOpenStartDrag = useCallback((direction: 'left' | 'right') => {
    if (isPendingDelete) {
      return;
    }

    if (direction === 'right') {
      openTodoMenu();
      return;
    }

    closeOtherOpenSwipeable();
  }, [closeOtherOpenSwipeable, isPendingDelete, openTodoMenu]);

  const handleSwipeableOpen = useCallback(
    (_direction: 'left' | 'right', swipeable: TodoSwipeController) => {
      if (openTodoSwipeable && openTodoSwipeable !== swipeable) {
        openTodoSwipeable.close();
      }

      openTodoSwipeable = swipeable;
    },
    [],
  );

  const handleSwipeableClose = useCallback(
    (_direction: 'left' | 'right', swipeable: TodoSwipeController) => {
      if (openTodoSwipeable === swipeable) {
        openTodoSwipeable = null;
      }

      setIsSwipeOpen(false);
    },
    [],
  );

  const handleGroupedSwipeableClose = useCallback(
    (swipeable: TodoSwipeController) => {
      handleSwipeableClose('left', swipeable);
    },
    [handleSwipeableClose],
  );

  const handleGroupedSwipeableOpen = useCallback(
    (swipeable: TodoSwipeController) => {
      handleSwipeableWillOpen('left');
      handleSwipeableOpen('left', swipeable);
    },
    [handleSwipeableOpen, handleSwipeableWillOpen],
  );

  useEffect(
    () => () => {
      if (
        openTodoSwipeable === swipeableRef.current ||
        openTodoSwipeable === groupedSwipeableRef.current
      ) {
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
          inputRange: [0, 0.18, 1],
          outputRange: [0, 1, 1],
          extrapolate: 'clamp',
        }),
      };
      const deleteRevealStyle = {
        transform: [
          {
            translateX: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [-6, 0],
              extrapolate: 'clamp',
            }),
          },
          {
            scale: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0.96, 1],
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
              outputRange: [-8, 0],
              extrapolate: 'clamp',
            }),
          },
          {
            scale: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0.96, 1],
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
              accessibilityLabel={isVisuallyDone ? 'Mark todo active' : 'Mark todo done'}
              activeOpacity={0.84}
              onPress={toggleDoneFromSwipe}
              style={styles.swipeActionButton}
            >
              <Ionicons
                color={SWIPE_DONE}
                name={isVisuallyDone ? 'arrow-undo' : 'checkmark'}
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
      isVisuallyDone,
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
          inputRange: [0, 0.18, 1],
          outputRange: [0, 1, 1],
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
          itemBackgroundTheme && !isVisuallyDone && !isPendingDelete && {
            backgroundColor: itemBackgroundTheme.tint,
            borderColor: itemBackgroundTheme.border,
            shadowColor: itemBackgroundTheme.accent,
          },
          item.pinned && !isVisuallyDone && !isPendingDelete && (
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
        {showPriorityRail && priorityRailTheme ? (
          <View
            style={[
              styles.colorRail,
              isGroupedLayout && styles.colorRailGrouped,
              { backgroundColor: priorityRailTheme.accent },
              isVisuallyDone && styles.colorRailDone,
            ]}
          />
        ) : null}
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
          disabled={isPendingDelete}
          onPress={handleTodoPress}
          style={[
            styles.textPressable,
            isGroupedLayout && styles.textPressableGrouped,
          ]}
        >
          <View
            style={[
              styles.contentColumn,
              isGroupedLayout && styles.contentColumnGrouped,
            ]}
          >
            {hasDisplayTitle ? (
              <View style={styles.titleBlock}>
                <Text
                  numberOfLines={0}
                  style={[
                    styles.text,
                    isVisuallyDone && styles.textDone,
                    isPendingDelete && styles.textPendingDelete,
                  ]}
                >
                  {highlightedTitlePreview}
                </Text>
              </View>
            ) : null}
            {contentPreview ? (
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                style={[
                  styles.content,
                  isVisuallyDone && styles.contentDone,
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
                dateStatusKey={dateStatusKey}
                done={isVisuallyDone}
                filterColors={filterColors}
                listLabel={listStatusLabel || undefined}
                pinned={item.pinned}
                  priorityLabel={
                    priorityStatusLabel && priorityStatusLabel !== 'None'
                      ? priorityStatusLabel
                      : undefined
                  }
                  reminderValues={item.filters.reminder}
                  showOverdueMetaTags={showOverdueMetaTags}
                  tagLabels={item.tags}
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
      ) : isGroupedLayout ? (
        <GroupedTodoSwipeContainer
          ref={groupedSwipeableRef}
          enabled={swipeEnabled}
          isDone={isVisuallyDone}
          onClose={handleGroupedSwipeableClose}
          onDelete={deleteTodoFromSwipe}
          onDone={toggleDoneFromSwipe}
          onMenu={openTodoMenu}
          onOpen={handleGroupedSwipeableOpen}
          onStart={closeOtherOpenSwipeable}
        >
          <View
            style={[
              styles.swipeableChildren,
              styles.swipeableChildrenGrouped,
              isHighlightedForSelection &&
                styles.swipeableChildrenGroupedSelected,
              isHighlightedForEdit &&
                styles.swipeableChildrenGroupedRecentlyEdited,
            ]}
          >
            {rowContent}
          </View>
        </GroupedTodoSwipeContainer>
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
          dragOffsetFromLeftEdge={SWIPE_DRAG_START_DISTANCE}
          dragOffsetFromRightEdge={SWIPE_DRAG_START_DISTANCE}
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
  prev.dateStatusKey === next.dateStatusKey &&
  prev.isNewlyCreated === next.isNewlyCreated &&
  prev.isRecentlyEdited === next.isRecentlyEdited &&
  prev.isCompletionFeedback === next.isCompletionFeedback &&
  prev.isMenuTargetHighlighted === next.isMenuTargetHighlighted &&
  prev.isMenuTarget === next.isMenuTarget &&
  prev.isSelected === next.isSelected &&
  prev.isPendingDelete === next.isPendingDelete &&
  prev.selectMode === next.selectMode &&
  prev.swipeDisabled === next.swipeDisabled &&
  prev.layout === next.layout &&
  prev.sectionLabel === next.sectionLabel &&
  prev.dateLabelDisplayMode === next.dateLabelDisplayMode &&
  prev.showOverdueMetaTags === next.showOverdueMetaTags &&
  prev.item === next.item &&
  prev.filterColors === next.filterColors &&
  prev.metaTagVisibility === next.metaTagVisibility &&
  prev.hiddenMetaTagKinds === next.hiddenMetaTagKinds &&
  prev.onDelete === next.onDelete &&
  prev.onCreateFromSettings === next.onCreateFromSettings &&
  prev.onCreateFromSettingsHoldEnd === next.onCreateFromSettingsHoldEnd &&
  prev.onCreateFromSettingsHoldStart === next.onCreateFromSettingsHoldStart &&
  prev.onOpenDetail === next.onOpenDetail &&
  prev.onOpenMenu === next.onOpenMenu &&
  prev.onSetDone === next.onSetDone &&
  prev.searchHighlightQuery === next.searchHighlightQuery &&
  prev.searchHighlightContent === next.searchHighlightContent &&
  prev.viewportWidth === next.viewportWidth &&
  prev.onEnterSelectMode === next.onEnterSelectMode &&
  prev.onTouchStart === next.onTouchStart &&
  prev.onToggleSelect === next.onToggleSelect
);

export const TodoRow = React.memo(TodoRowComponent, areTodoRowPropsEqual);

const styles = StyleSheet.create({
  shell: {
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    minHeight: 62,
    position: 'relative',
    width: '100%',
  },
  shellGrouped: {
    minHeight: GROUPED_ROW_MIN_HEIGHT,
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
    backgroundColor: THEME_CARD,
    borderRadius: ROW_BORDER_RADIUS,
    minHeight: 62,
    overflow: 'hidden',
    width: '100%',
  },
  swipeableContainerGrouped: {
    alignSelf: 'stretch',
    borderRadius: 0,
    minHeight: GROUPED_ROW_MIN_HEIGHT,
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
    flex: 0,
    flexGrow: 0,
    minWidth: 0,
    overflow: 'visible',
    width: '100%',
  },
  swipeableChildrenGroupedRecentlyEdited: {
    backgroundColor: THEME_ACCENT_SOFT,
  },
  swipeableChildrenGroupedSelected: {
    backgroundColor: THEME_ACCENT_SOFT,
  },
  lightweightSwipeContainer: {
    alignSelf: 'stretch',
    backgroundColor: THEME_CARD,
    minHeight: GROUPED_ROW_MIN_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  lightweightSwipeSurface: {
    alignSelf: 'stretch',
    backgroundColor: THEME_CARD,
    minHeight: GROUPED_ROW_MIN_HEIGHT,
    overflow: 'hidden',
    width: '100%',
  },
  lightweightSwipeActionsLeft: {
    alignItems: 'center',
    backgroundColor: THEME_CARD,
    bottom: 0,
    flexDirection: 'row',
    gap: SWIPE_ACTION_GAP,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    top: 0,
    width: LEFT_SWIPE_ACTION_WIDTH,
  },
  lightweightSwipeActionsRight: {
    alignItems: 'center',
    backgroundColor: THEME_CARD,
    bottom: 0,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    top: 0,
    width: RIGHT_SWIPE_ACTION_WIDTH,
  },
  swipeActionsRoot: {
    alignSelf: 'stretch',
    backgroundColor: THEME_CARD,
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
    minHeight: 62,
    paddingHorizontal: 14,
    paddingVertical: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.045,
    shadowRadius: 10,
    width: '100%',
  },
  rowGrouped: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    elevation: 0,
    minHeight: GROUPED_ROW_MIN_HEIGHT,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: 'relative',
    shadowOpacity: 0,
    width: 'auto',
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
    backgroundColor: THEME_ACCENT_SOFT,
  },
  rowSelected: {
    backgroundColor: THEME_ACCENT_SOFT,
    borderColor: THEME_ACCENT_SELECTION_BORDER,
    elevation: 0,
    shadowOpacity: 0,
  },
  rowSelectedGrouped: {
    backgroundColor: THEME_ACCENT_SOFT,
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
    borderRadius: 3,
    marginRight: 12,
    marginVertical: 1,
    width: 4,
  },
  colorRailGrouped: {
    bottom: 8,
    left: 0,
    marginRight: 0,
    marginVertical: 0,
    position: 'absolute',
    top: 8,
    width: 4,
  },
  colorRailDone: {
    opacity: 0.45,
  },
  textPressable: {
    alignSelf: 'flex-start',
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  textPressableGrouped: {
    flexBasis: 'auto',
  },
  contentColumn: {
    alignItems: 'stretch',
    alignSelf: 'stretch',
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingRight: TODO_ROW_TEXT_RIGHT_INSET,
  },
  contentColumnGrouped: {
    paddingRight: TODO_ROW_GROUPED_TEXT_RIGHT_INSET,
  },
  titleBlock: {
    alignSelf: 'stretch',
    minWidth: 0,
    position: 'relative',
  },
  text: {
    alignSelf: 'stretch',
    color: THEME_TEXT,
    flexShrink: 1,
    fontSize: 17,
    fontWeight: FONT_REGULAR,
    includeFontPadding: false,
    lineHeight: 23,
    minWidth: 0,
  },
  textDone: {
    color: THEME_TEXT_SECONDARY,
    textDecorationLine: 'line-through',
  },
  content: {
    alignSelf: 'stretch',
    color: 'rgba(95, 91, 87, 0.68)',
    flexShrink: 1,
    fontSize: 14,
    fontWeight: FONT_REGULAR,
    lineHeight: 20,
    marginTop: 5,
    minWidth: 0,
  },
  contentDone: {
    color: THEME_TEXT_SECONDARY,
    textDecorationLine: 'line-through',
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
