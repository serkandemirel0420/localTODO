import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  type LayoutChangeEvent,
  View,
} from 'react-native';
import {
  Swipeable,
  TouchableOpacity as GestureTouchableOpacity,
} from 'react-native-gesture-handler';

import { TodoMetaTags } from './TodoMetaTags';
import { type DateLabelDisplayMode } from '../dates';
import {
  getTodoPrimaryColorTheme,
  type FilterColorSettings,
} from '../filterColors';
import {
  applyHiddenMetaTagKinds,
  type HiddenMetaTagKind,
  type MetaTagVisibility,
} from '../metaTags';
import {
  DATE_MENU_ITEMS,
  getBestOrderedFilterLabel,
  PRIORITY_MENU_ITEMS,
} from '../todoOptions';
import { type Todo } from '../todos';

const THEME_CARD = '#FFFFFF';
const THEME_BORDER = '#E5E5EA';
const THEME_TEXT = '#1C1C1E';
const THEME_TEXT_SECONDARY = '#8E8E93';
const THEME_ACCENT = '#4C78FF';
const THEME_ACCENT_SELECTION_BORDER = 'rgba(76, 120, 255, 0.36)';
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
const TODO_ROW_TITLE_PREVIEW_MAX_LENGTH = 60;
const TODO_ROW_CONTENT_PREVIEW_MAX_LENGTH = 60;
const TODO_ROW_PREVIEW_ELLIPSIS = '...';
const TODO_ROW_TEXT_RIGHT_INSET = 36;
const TODO_ROW_GROUPED_TEXT_RIGHT_INSET = 44;
const NEW_TODO_HIGHLIGHT_PULSE_MS = 520;
const NEW_TODO_HIGHLIGHT_PULSE_COUNT = 3;

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

export type TodoRowProps = {
  dateLabelDisplayMode?: DateLabelDisplayMode;
  deferSwipeable?: boolean;
  filterColors: FilterColorSettings;
  hiddenMetaTagKinds?: HiddenMetaTagKind[];
  isSelected?: boolean;
  item: Todo;
  isMenuTarget: boolean;
  isMenuTargetHighlighted?: boolean;
  isNewlyCreated?: boolean;
  isPendingDelete?: boolean;
  layout?: 'standalone' | 'grouped';
  metaTagVisibility: MetaTagVisibility;
  onDelete: (id: string) => void;
  onEnterSelectMode?: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onOpenMenu: (id: string) => void;
  onSetDone: (id: string, done: boolean) => void;
  onToggleSelect?: (id: string) => void;
  sectionLabel?: string;
  selectMode?: boolean;
};

function TodoRowComponent({
  dateLabelDisplayMode = 'exact',
  deferSwipeable = false,
  filterColors,
  hiddenMetaTagKinds = [],
  isSelected = false,
  item,
  isMenuTarget,
  isMenuTargetHighlighted = false,
  isNewlyCreated = false,
  isPendingDelete = false,
  layout = 'standalone',
  metaTagVisibility,
  onDelete,
  onEnterSelectMode,
  onOpenDetail,
  onOpenMenu,
  onSetDone,
  onToggleSelect,
  selectMode = false,
}: TodoRowProps) {
  const swipeableRef = useRef<Swipeable | null>(null);
  const createHighlightPulse = useRef(new Animated.Value(0)).current;
  const [isSwipeOpen, setIsSwipeOpen] = useState(false);
  const [rowHeight, setRowHeight] = useState<number | null>(null);
  const isGroupedLayout = layout === 'grouped';
  const fallbackRowHeight = isGroupedLayout ? 52 : 56;
  const swipeActionAreaHeight = isGroupedLayout ? fallbackRowHeight : rowHeight ?? fallbackRowHeight;
  const swipeActionInset = isGroupedLayout ? 2 : 0;
  const todoColorTheme = getTodoPrimaryColorTheme(item.filters, filterColors);
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
  const content = item.content.trim();
  const contentPreview = getTodoRowTextPreview(content, TODO_ROW_CONTENT_PREVIEW_MAX_LENGTH);
  const titlePreview = getTodoRowTextPreview(item.text, TODO_ROW_TITLE_PREVIEW_MAX_LENGTH);
  const isHighlightedForMenu = isMenuTargetHighlighted;
  const isHighlightedForCreate = isNewlyCreated && !isMenuTargetHighlighted;
  const isHighlightedForSelection = selectMode && isSelected;
  const showRowHighlight =
    isHighlightedForMenu || isHighlightedForCreate || isHighlightedForSelection;
  const swipeEnabled = !deferSwipeable && !isPendingDelete && !isMenuTarget && !selectMode;

  useEffect(() => {
    if (!isMenuTarget) {
      return;
    }

    swipeableRef.current?.close();
    setIsSwipeOpen(false);
  }, [isMenuTarget]);

  useEffect(() => {
    if (!isNewlyCreated) {
      createHighlightPulse.setValue(0);
      return;
    }

    createHighlightPulse.setValue(1);
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(createHighlightPulse, {
          toValue: 0.45,
          duration: NEW_TODO_HIGHLIGHT_PULSE_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(createHighlightPulse, {
          toValue: 1,
          duration: NEW_TODO_HIGHLIGHT_PULSE_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ]),
      { iterations: NEW_TODO_HIGHLIGHT_PULSE_COUNT },
    );

    pulse.start();

    return () => {
      pulse.stop();
      createHighlightPulse.setValue(0);
    };
  }, [createHighlightPulse, isNewlyCreated, item.id]);

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
    <View
      onLayout={isGroupedLayout ? undefined : handleRowLayout}
      style={[
        styles.row,
        isGroupedLayout && styles.rowGrouped,
        !isGroupedLayout && todoColorTheme && !item.done && {
          backgroundColor: todoColorTheme.tint,
          borderColor: todoColorTheme.border,
          shadowColor: todoColorTheme.accent,
        },
        isPendingDelete && styles.rowPendingDelete,
        showRowHighlight && (
          isGroupedLayout ? styles.rowMenuTargetGrouped : styles.rowMenuTarget
        ),
        isHighlightedForCreate && (
          isGroupedLayout ? styles.rowNewlyCreatedGrouped : styles.rowNewlyCreated
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
      <GestureTouchableOpacity
        accessibilityRole="checkbox"
        accessibilityState={{
          checked: selectMode ? isSelected : item.done,
        }}
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
              ? (isSelected ? styles.checkboxChecked : styles.checkboxSelectMode)
              : (item.done && styles.checkboxChecked),
          ]}
        >
          {selectMode ? (
            isSelected ? (
              <Ionicons color={THEME_CARD} name="checkmark" size={14} />
            ) : null
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
          <Text
            ellipsizeMode="tail"
            numberOfLines={2}
            style={[
              styles.text,
              item.done && styles.textDone,
              isPendingDelete && styles.textPendingDelete,
            ]}
          >
            {titlePreview}
          </Text>
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
              {contentPreview}
            </Text>
          ) : null}
          {isPendingDelete ? (
            <Text style={styles.pendingDeleteText}>Deleting...</Text>
          ) : (
            <TodoMetaTags
              createdAt={item.createdAt}
              dateLabel={rawDateStatusLabel || undefined}
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
              visibility={effectiveMetaTagVisibility}
            />
          )}
        </View>
      </GestureTouchableOpacity>
    </View>
  );

  return (
    <View
      style={[
        styles.shell,
        isGroupedLayout && styles.shellGrouped,
        showRowHighlight && styles.shellMenuTarget,
        showRowHighlight && isGroupedLayout && styles.shellMenuTargetGrouped,
      ]}
    >
      {deferSwipeable ? (
        <View
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
      {showRowHighlight ? (
        <View
          pointerEvents="none"
          style={[
            styles.selectionFrame,
            isGroupedLayout && styles.selectionFrameGrouped,
            isHighlightedForCreate && styles.selectionFrameNewlyCreated,
          ]}
        />
      ) : null}
      {isHighlightedForCreate ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.newlyCreatedOverlay,
            isGroupedLayout && styles.newlyCreatedOverlayGrouped,
            {
              backgroundColor: createHighlightPulse.interpolate({
                inputRange: [0.45, 1],
                outputRange: ['rgba(76, 120, 255, 0.2)', 'rgba(76, 120, 255, 0.38)'],
              }),
              borderColor: createHighlightPulse.interpolate({
                inputRange: [0.45, 1],
                outputRange: ['rgba(76, 120, 255, 0.55)', 'rgba(76, 120, 255, 0.9)'],
              }),
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const areTodoRowPropsEqual = (prev: TodoRowProps, next: TodoRowProps) => (
  prev.isNewlyCreated === next.isNewlyCreated &&
  prev.isMenuTargetHighlighted === next.isMenuTargetHighlighted &&
  prev.isMenuTarget === next.isMenuTarget &&
  prev.isSelected === next.isSelected &&
  prev.isPendingDelete === next.isPendingDelete &&
  prev.selectMode === next.selectMode &&
  prev.deferSwipeable === next.deferSwipeable &&
  prev.layout === next.layout &&
  prev.sectionLabel === next.sectionLabel &&
  prev.dateLabelDisplayMode === next.dateLabelDisplayMode &&
  prev.item === next.item &&
  prev.filterColors === next.filterColors &&
  prev.metaTagVisibility === next.metaTagVisibility &&
  prev.hiddenMetaTagKinds === next.hiddenMetaTagKinds &&
  prev.onDelete === next.onDelete &&
  prev.onOpenDetail === next.onOpenDetail &&
  prev.onOpenMenu === next.onOpenMenu &&
  prev.onSetDone === next.onSetDone &&
  prev.onEnterSelectMode === next.onEnterSelectMode &&
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
  shellMenuTargetGrouped: {
    marginVertical: 2,
  },
  selectionFrame: {
    borderColor: THEME_ACCENT_SELECTION_BORDER,
    borderRadius: 3,
    borderWidth: 1.5,
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
    flexGrow: 1,
    overflow: 'hidden',
    width: '100%',
  },
  swipeableChildrenGrouped: {
    backgroundColor: THEME_CARD,
    borderRadius: 0,
    flexGrow: 1,
    overflow: 'visible',
    width: '100%',
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
    flex: 1,
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
  rowMenuTarget: {
    borderColor: THEME_ACCENT_SELECTION_BORDER,
    elevation: 0,
    shadowOpacity: 0,
  },
  rowMenuTargetGrouped: {
    backgroundColor: 'transparent',
  },
  rowNewlyCreated: {
    backgroundColor: 'rgba(76, 120, 255, 0.16)',
  },
  rowNewlyCreatedGrouped: {
    backgroundColor: 'rgba(76, 120, 255, 0.14)',
  },
  selectionFrameNewlyCreated: {
    borderColor: 'rgba(76, 120, 255, 0.72)',
    borderWidth: 2,
  },
  newlyCreatedOverlay: {
    borderRadius: ROW_BORDER_RADIUS,
    borderWidth: 2,
    bottom: -2,
    left: -2,
    position: 'absolute',
    right: -2,
    top: -2,
    zIndex: 4,
  },
  newlyCreatedOverlayGrouped: {
    borderRadius: 0,
    bottom: 0,
    left: -6,
    right: -6,
    top: 0,
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
  checkboxSelectMode: {
    borderColor: THEME_ACCENT,
  },
  textPressable: {
    alignSelf: 'stretch',
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  contentColumn: {
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingRight: TODO_ROW_TEXT_RIGHT_INSET,
  },
  contentColumnGrouped: {
    paddingRight: TODO_ROW_GROUPED_TEXT_RIGHT_INSET,
  },
  text: {
    alignSelf: 'stretch',
    color: THEME_TEXT,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: FONT_REGULAR,
    lineHeight: 21,
    minWidth: 0,
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
