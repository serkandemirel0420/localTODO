import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
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

const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);
const MERIDIEMS = ['AM', 'PM'] as const;

const pad2 = (value: number) => String(value).padStart(2, '0');

const to12Hour = (time: ReminderTime) => {
  const hours24 = time.hours;
  const meridiem: (typeof MERIDIEMS)[number] = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;

  return { hours12, minutes: time.minutes, meridiem };
};

const to24Hour = (
  hours12: number,
  minutes: number,
  meridiem: (typeof MERIDIEMS)[number],
): ReminderTime => {
  let hours24 = hours12 % 12;
  if (meridiem === 'PM') {
    hours24 += 12;
  }

  return { hours: hours24, minutes };
};

type WheelColumnProps = {
  labels: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  width?: number;
};

function WheelColumn({ labels, selectedIndex, onSelect, width }: WheelColumnProps) {
  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(false);
  const selectedIndexRef = useRef(selectedIndex);
  const emittedIndexRef = useRef<number | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  const scrollToIndex = useCallback((index: number, animated: boolean) => {
    scrollRef.current?.scrollTo({
      animated,
      y: index * ITEM_HEIGHT,
    });
  }, []);

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  const settleToOffset = useCallback((offsetY: number) => {
    const index = Math.max(0, Math.min(labels.length - 1, Math.round(offsetY / ITEM_HEIGHT)));

    setActiveIndex(index);
    scrollToIndex(index, false);

    if (index !== selectedIndexRef.current) {
      emittedIndexRef.current = index;
      selectedIndexRef.current = index;
      onSelect(index);
    }
  }, [labels.length, onSelect, scrollToIndex]);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
    const emittedFromThisColumn = emittedIndexRef.current === selectedIndex;
    emittedIndexRef.current = null;

    setActiveIndex(selectedIndex);
    if (emittedFromThisColumn) {
      return undefined;
    }

    const frame = requestAnimationFrame(() => {
      scrollToIndex(selectedIndex, mountedRef.current);
      mountedRef.current = true;
    });

    return () => cancelAnimationFrame(frame);
  }, [scrollToIndex, selectedIndex]);

  useEffect(() => clearSettleTimer, [clearSettleTimer]);

  const handleScrollEndDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;

    clearSettleTimer();
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      settleToOffset(offsetY);
    }, 80);
  };

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    clearSettleTimer();
    settleToOffset(event.nativeEvent.contentOffset.y);
  };

  return (
    <View style={[styles.column, width ? { width } : null]}>
      <ScrollView
        ref={scrollRef}
        bounces={false}
        decelerationRate="fast"
        nestedScrollEnabled
        onMomentumScrollBegin={clearSettleTimer}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onScrollBeginDrag={clearSettleTimer}
        onScrollEndDrag={handleScrollEndDrag}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        style={styles.scroll}
      >
        {Array.from({ length: PAD_ROWS }, (_, index) => (
          <View key={`pad-top-${index}`} style={styles.padRow} />
        ))}
        {labels.map((label, index) => {
          const selected = index === activeIndex;

          return (
            <View key={`${label}-${index}`} style={styles.itemRow}>
              <Text style={[styles.itemText, selected && styles.itemTextSelected]}>
                {label}
              </Text>
            </View>
          );
        })}
        {Array.from({ length: PAD_ROWS }, (_, index) => (
          <View key={`pad-bottom-${index}`} style={styles.padRow} />
        ))}
      </ScrollView>
    </View>
  );
}

type InlineTimePickerProps = {
  value: ReminderTime | null;
  onChange: (time: ReminderTime) => void;
};

export function InlineTimePicker({ value, onChange }: InlineTimePickerProps) {
  const time = value ?? DEFAULT_REMINDER_TIME;
  const parts = useMemo(() => to12Hour(time), [time]);

  const hourIndex = parts.hours12 - 1;
  const minuteIndex = parts.minutes;
  const meridiemIndex = parts.meridiem === 'PM' ? 1 : 0;

  const minuteLabels = useMemo(
    () => MINUTES.map((minute) => pad2(minute)),
    [],
  );

  const emitChange = useCallback((
    nextHourIndex: number,
    nextMinuteIndex: number,
    nextMeridiemIndex: number,
  ) => {
    onChange(to24Hour(
      HOURS[nextHourIndex] ?? 12,
      MINUTES[nextMinuteIndex] ?? 0,
      MERIDIEMS[nextMeridiemIndex] ?? 'AM',
    ));
  }, [onChange]);

  return (
    <View style={styles.root}>
      <View style={styles.columns}>
        <WheelColumn
          labels={HOURS.map(String)}
          onSelect={(index) => emitChange(index, minuteIndex, meridiemIndex)}
          selectedIndex={hourIndex}
        />
        <Text style={styles.separator}>:</Text>
        <WheelColumn
          labels={minuteLabels}
          onSelect={(index) => emitChange(hourIndex, index, meridiemIndex)}
          selectedIndex={minuteIndex}
          width={56}
        />
        <WheelColumn
          labels={[...MERIDIEMS]}
          onSelect={(index) => emitChange(hourIndex, minuteIndex, index)}
          selectedIndex={meridiemIndex}
          width={52}
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
  padRow: {
    height: ITEM_HEIGHT,
  },
  itemRow: {
    alignItems: 'center',
    height: ITEM_HEIGHT,
    justifyContent: 'center',
  },
  itemText: {
    color: '#B5ADA5',
    fontSize: 18,
    fontWeight: '400',
  },
  itemTextSelected: {
    color: ACCENT,
    fontSize: 22,
    fontWeight: '700',
  },
  separator: {
    color: '#1F1B17',
    fontSize: 22,
    fontWeight: '700',
    marginHorizontal: 2,
    marginTop: -2,
  },
});
