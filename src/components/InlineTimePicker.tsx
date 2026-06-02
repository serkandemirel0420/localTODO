import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  DEFAULT_REMINDER_TIME,
  type ReminderTime,
} from '../reminders';

const ACCENT = '#4C78FF';
const ITEM_HEIGHT = 44;
const VISIBLE_ROWS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
const PAD_ROWS = Math.floor(VISIBLE_ROWS / 2);
const LOOP_CYCLES = 101;
const CENTER_CYCLE = Math.floor(LOOP_CYCLES / 2);
const RECENTER_EDGE_CYCLES = 8;
const SNAP_OFFSET_EPSILON = 0.5;

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);

const pad2 = (value: number) => String(value).padStart(2, '0');

const positiveModulo = (value: number, size: number) => ((value % size) + size) % size;

const getCenteredLoopIndex = (itemIndex: number, itemCount: number) => (
  CENTER_CYCLE * itemCount + itemIndex
);

const timeToParts = (time: ReminderTime) => {
  return { hours: time.hours, minutes: time.minutes };
};

type WheelColumnProps = {
  labels: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  width?: number;
};

function WheelColumn({ labels, selectedIndex, onSelect, width }: WheelColumnProps) {
  const listRef = useRef<FlatList<number>>(null);
  const draggingRef = useRef(false);
  const latestOffsetRef = useRef(0);
  const momentumActiveRef = useRef(false);
  const selectedIndexRef = useRef(selectedIndex);
  const emittedIndexRef = useRef<number | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemCount = labels.length;
  const loopedItemCount = itemCount * LOOP_CYCLES;
  const loopItems = useMemo(
    () => Array.from({ length: loopedItemCount }, (_, index) => index),
    [loopedItemCount],
  );

  const scrollToLoopIndex = useCallback((index: number, animated: boolean) => {
    listRef.current?.scrollToOffset({
      animated,
      offset: index * ITEM_HEIGHT,
    });
  }, []);

  const scrollToCenteredIndex = useCallback((index: number, animated: boolean) => {
    scrollToLoopIndex(getCenteredLoopIndex(index, itemCount), animated);
  }, [itemCount, scrollToLoopIndex]);

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  const settleToOffset = useCallback((offsetY: number) => {
    const rawLoopIndex = Math.round(offsetY / ITEM_HEIGHT);
    const loopIndex = Math.max(0, Math.min(loopedItemCount - 1, rawLoopIndex));
    const index = positiveModulo(loopIndex, itemCount);
    const currentCycle = Math.floor(loopIndex / itemCount);
    const shouldRecenter = (
      currentCycle < RECENTER_EDGE_CYCLES ||
      currentCycle >= LOOP_CYCLES - RECENTER_EDGE_CYCLES
    );
    const targetLoopIndex = shouldRecenter
      ? getCenteredLoopIndex(index, itemCount)
      : loopIndex;
    const targetOffset = targetLoopIndex * ITEM_HEIGHT;

    if (Math.abs(targetOffset - offsetY) > SNAP_OFFSET_EPSILON) {
      scrollToLoopIndex(targetLoopIndex, !shouldRecenter);
    }

    if (index !== selectedIndexRef.current) {
      emittedIndexRef.current = index;
      selectedIndexRef.current = index;
      onSelect(index);
    }
  }, [itemCount, loopedItemCount, onSelect, scrollToLoopIndex]);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
    const emittedFromThisColumn = emittedIndexRef.current === selectedIndex;
    emittedIndexRef.current = null;

    if (emittedFromThisColumn) {
      return undefined;
    }

    const frame = requestAnimationFrame(() => {
      scrollToCenteredIndex(selectedIndex, false);
    });

    return () => cancelAnimationFrame(frame);
  }, [scrollToCenteredIndex, selectedIndex]);

  useEffect(() => clearSettleTimer, [clearSettleTimer]);

  const scheduleSettle = useCallback((delay: number) => {
    clearSettleTimer();
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      if (draggingRef.current || momentumActiveRef.current) {
        return;
      }

      settleToOffset(latestOffsetRef.current);
    }, delay);
  }, [clearSettleTimer, settleToOffset]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    latestOffsetRef.current = event.nativeEvent.contentOffset.y;
    if (!draggingRef.current && !momentumActiveRef.current) {
      scheduleSettle(90);
    }
  };

  const handleScrollEndDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    draggingRef.current = false;
    latestOffsetRef.current = event.nativeEvent.contentOffset.y;
    scheduleSettle(90);
  };

  const handleMomentumScrollBegin = () => {
    draggingRef.current = false;
    momentumActiveRef.current = true;
    clearSettleTimer();
  };

  const handleScrollBeginDrag = () => {
    draggingRef.current = true;
    momentumActiveRef.current = false;
    clearSettleTimer();
  };

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    momentumActiveRef.current = false;
    clearSettleTimer();
    latestOffsetRef.current = event.nativeEvent.contentOffset.y;
    settleToOffset(event.nativeEvent.contentOffset.y);
  };

  const renderItem = useCallback(({ item: loopIndex }: { item: number }) => {
    const itemIndex = positiveModulo(loopIndex, itemCount);
    const label = labels[itemIndex] ?? '';

    return (
      <View style={styles.itemRow}>
        <Text style={styles.itemText}>{label}</Text>
      </View>
    );
  }, [itemCount, labels]);

  return (
    <View style={[styles.column, width ? { width } : null]}>
      <FlatList
        ref={listRef}
        bounces={false}
        contentContainerStyle={styles.scrollContent}
        data={loopItems}
        decelerationRate="normal"
        getItemLayout={(_, index) => ({
          index,
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
        })}
        initialNumToRender={VISIBLE_ROWS + 4}
        initialScrollIndex={getCenteredLoopIndex(selectedIndex, itemCount)}
        keyExtractor={(item) => String(item)}
        maxToRenderPerBatch={VISIBLE_ROWS + 4}
        nestedScrollEnabled
        onMomentumScrollBegin={handleMomentumScrollBegin}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onScrollToIndexFailed={({ index }) => {
          requestAnimationFrame(() => scrollToLoopIndex(index, false));
        }}
        removeClippedSubviews
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        style={styles.scroll}
        windowSize={5}
      />
    </View>
  );
}

type InlineTimePickerProps = {
  value: ReminderTime | null;
  onChange: (time: ReminderTime) => void;
};

export function InlineTimePicker({ value, onChange }: InlineTimePickerProps) {
  const time = value ?? DEFAULT_REMINDER_TIME;
  const parts = useMemo(() => timeToParts(time), [time]);

  const hourIndex = parts.hours;
  const minuteIndex = parts.minutes;

  const hourLabels = useMemo(
    () => HOURS.map((hour) => pad2(hour)),
    [],
  );
  const minuteLabels = useMemo(
    () => MINUTES.map((minute) => pad2(minute)),
    [],
  );

  const emitChange = useCallback((
    nextHourIndex: number,
    nextMinuteIndex: number,
  ) => {
    onChange({
      hours: HOURS[nextHourIndex] ?? DEFAULT_REMINDER_TIME.hours,
      minutes: MINUTES[nextMinuteIndex] ?? DEFAULT_REMINDER_TIME.minutes,
    });
  }, [onChange]);

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.selectionBand} />
      <View style={styles.columns}>
        <WheelColumn
          labels={hourLabels}
          onSelect={(index) => emitChange(index, minuteIndex)}
          selectedIndex={hourIndex}
          width={56}
        />
        <Text style={styles.separator}>:</Text>
        <WheelColumn
          labels={minuteLabels}
          onSelect={(index) => emitChange(hourIndex, index)}
          selectedIndex={minuteIndex}
          width={56}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#FAF8F5',
    borderRadius: 12,
    marginBottom: 4,
    marginHorizontal: 12,
    marginTop: 4,
    overflow: 'hidden',
  },
  selectionBand: {
    backgroundColor: '#EAF0FF',
    borderRadius: 12,
    height: ITEM_HEIGHT,
    left: 34,
    position: 'absolute',
    right: 34,
    top: ITEM_HEIGHT * PAD_ROWS,
  },
  columns: {
    alignItems: 'center',
    flexDirection: 'row',
    height: PICKER_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  column: {
    flex: 1,
    height: PICKER_HEIGHT,
    maxWidth: 72,
  },
  scroll: {
    height: PICKER_HEIGHT,
  },
  scrollContent: {
    paddingVertical: ITEM_HEIGHT * PAD_ROWS,
  },
  itemRow: {
    alignItems: 'center',
    height: ITEM_HEIGHT,
    justifyContent: 'center',
  },
  itemText: {
    color: '#2A2520',
    fontSize: 20,
    fontWeight: '600',
  },
  separator: {
    color: ACCENT,
    fontSize: 22,
    fontWeight: '700',
    marginHorizontal: 2,
    marginTop: -2,
  },
});
