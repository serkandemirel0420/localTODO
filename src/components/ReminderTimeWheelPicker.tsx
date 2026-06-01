import React, { useCallback, useEffect, useMemo, useRef } from 'react';
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
const ITEM_HEIGHT = 42;
const VISIBLE_ROWS = 5;
const WHEEL_PADDING = ITEM_HEIGHT * Math.floor(VISIBLE_ROWS / 2);

const HOURS_12 = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);
const PERIODS = ['AM', 'PM'] as const;

type Period = (typeof PERIODS)[number];

const to12HourParts = (time: ReminderTime) => {
  const period: Period = time.hours >= 12 ? 'PM' : 'AM';
  const hours12 = time.hours % 12 || 12;

  return {
    hours12,
    minutes: time.minutes,
    period,
  };
};

const from12HourParts = (hours12: number, minutes: number, period: Period): ReminderTime => {
  const normalizedHour = hours12 % 12;
  const hours = period === 'PM' ? normalizedHour + 12 : normalizedHour;

  return {
    hours: hours === 24 ? 12 : hours,
    minutes,
  };
};

type WheelColumnProps = {
  items: string[];
  selectedIndex: number;
  onIndexChange: (index: number) => void;
  width: number;
};

function WheelColumn({
  items,
  selectedIndex,
  onIndexChange,
  width,
}: WheelColumnProps) {
  const scrollRef = useRef<ScrollView>(null);
  const isUserScroll = useRef(false);

  useEffect(() => {
    if (isUserScroll.current) {
      return;
    }

    scrollRef.current?.scrollTo({
      y: selectedIndex * ITEM_HEIGHT,
      animated: false,
    });
  }, [selectedIndex]);

  const handleScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    isUserScroll.current = false;
    const offsetY = event.nativeEvent.contentOffset.y;
    const index = Math.max(0, Math.min(items.length - 1, Math.round(offsetY / ITEM_HEIGHT)));

    if (index !== selectedIndex) {
      onIndexChange(index);
    }

    scrollRef.current?.scrollTo({
      y: index * ITEM_HEIGHT,
      animated: true,
    });
  }, [items.length, onIndexChange, selectedIndex]);

  return (
    <View style={[styles.column, { width }]}>
      <ScrollView
        ref={scrollRef}
        bounces={false}
        decelerationRate="fast"
        nestedScrollEnabled
        onMomentumScrollEnd={handleScrollEnd}
        onScrollBeginDrag={() => {
          isUserScroll.current = true;
        }}
        showsVerticalScrollIndicator={false}
        snapToAlignment="start"
        snapToInterval={ITEM_HEIGHT}
        contentContainerStyle={{ paddingVertical: WHEEL_PADDING }}
      >
        {items.map((label, index) => {
          const selected = index === selectedIndex;

          return (
            <View key={`${label}-${index}`} style={styles.item}>
              <Text style={[styles.itemText, selected && styles.itemTextSelected]}>
                {label}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

type ReminderTimeWheelPickerProps = {
  value: ReminderTime | null;
  onChange: (value: ReminderTime) => void;
};

export function ReminderTimeWheelPicker({
  value,
  onChange,
}: ReminderTimeWheelPickerProps) {
  const parts = useMemo(
    () => to12HourParts(value ?? DEFAULT_REMINDER_TIME),
    [value],
  );

  const hourIndex = parts.hours12 - 1;
  const minuteIndex = parts.minutes;
  const periodIndex = parts.period === 'PM' ? 1 : 0;

  const minuteLabels = useMemo(
    () => MINUTES.map((minute) => String(minute).padStart(2, '0')),
    [],
  );

  const emitChange = useCallback((nextHourIndex: number, nextMinuteIndex: number, nextPeriodIndex: number) => {
    onChange(from12HourParts(
      nextHourIndex + 1,
      nextMinuteIndex,
      PERIODS[nextPeriodIndex] ?? 'AM',
    ));
  }, [onChange]);

  return (
    <View style={styles.root}>
      <WheelColumn
        items={HOURS_12.map(String)}
        onIndexChange={(index) => emitChange(index, minuteIndex, periodIndex)}
        selectedIndex={hourIndex}
        width={72}
      />
      <WheelColumn
        items={minuteLabels}
        onIndexChange={(index) => emitChange(hourIndex, index, periodIndex)}
        selectedIndex={minuteIndex}
        width={72}
      />
      <WheelColumn
        items={[...PERIODS]}
        onIndexChange={(index) => emitChange(hourIndex, minuteIndex, index)}
        selectedIndex={periodIndex}
        width={64}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flexDirection: 'row',
    height: ITEM_HEIGHT * VISIBLE_ROWS,
    justifyContent: 'center',
    marginVertical: 4,
  },
  column: {
    height: ITEM_HEIGHT * VISIBLE_ROWS,
    overflow: 'hidden',
  },
  item: {
    alignItems: 'center',
    height: ITEM_HEIGHT,
    justifyContent: 'center',
  },
  itemText: {
    color: '#C8C0B8',
    fontSize: 17,
    fontWeight: '400',
  },
  itemTextSelected: {
    color: ACCENT,
    fontSize: 22,
    fontWeight: '700',
  },
});
