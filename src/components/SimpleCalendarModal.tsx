import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  State,
  type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';

import {
  buildCalendarMonthGrid,
  formatCalendarMonthTitle,
  getISOWeekNumber,
  isSameCalendarDay,
  startOfDay,
} from '../dates';

const ACCENT = '#4C78FF';
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CARD_HORIZONTAL_PADDING = 16;
const SWIPE_DISTANCE_THRESHOLD = 44;
const SWIPE_VELOCITY_THRESHOLD = 360;
const MONTH_SLIDE_MS = 130;

type SimpleCalendarModalProps = {
  visible: boolean;
  value: Date;
  onClose: () => void;
  onClear?: () => void;
  onSelectDate: (date: Date) => void;
};

const startOfCalendarMonth = (date: Date) => {
  const next = startOfDay(date);
  next.setDate(1);
  return next;
};

const addCalendarMonths = (date: Date, delta: number) => {
  const next = startOfCalendarMonth(date);
  next.setMonth(next.getMonth() + delta);
  return startOfCalendarMonth(next);
};

type CalendarMonthPaneProps = {
  month: Date;
  onSelectDay: (date: Date) => void;
  selectedDate: Date;
  today: Date;
  width: number;
};

const CalendarMonthPane = React.memo(function CalendarMonthPane({
  month,
  onSelectDay,
  selectedDate,
  today,
  width,
}: CalendarMonthPaneProps) {
  const calendarWeeks = useMemo(
    () => buildCalendarMonthGrid(month),
    [month],
  );

  return (
    <View style={[styles.monthPane, { width }]}>
      {calendarWeeks.map((week, weekIndex) => {
        const weekNumber = getISOWeekNumber(week[0]?.date ?? month);

        return (
          <View
            key={`${month.getFullYear()}-${month.getMonth()}-${weekIndex}`}
            style={styles.weekRow}
          >
            {week.map((cell, dayIndex) => {
              const selected = isSameCalendarDay(cell.date, selectedDate);
              const isToday = isSameCalendarDay(cell.date, today);
              const showWeekLabel = dayIndex === 0;

              return (
                <View key={cell.date.toISOString()} style={styles.dayColumn}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => onSelectDay(cell.date)}
                    style={styles.dayPressable}
                  >
                    <View
                      style={[
                        styles.dayInner,
                        selected && styles.dayInnerSelected,
                        !selected && isToday && styles.dayInnerToday,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          !cell.inCurrentMonth && styles.dayTextMuted,
                          selected && styles.dayTextSelected,
                        ]}
                      >
                        {cell.date.getDate()}
                      </Text>
                    </View>
                  </Pressable>
                  {showWeekLabel ? (
                    <Text style={styles.weekNumber}>W{weekNumber}</Text>
                  ) : (
                    <View style={styles.weekNumberSpacer} />
                  )}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
});

export function SimpleCalendarModal({
  visible,
  value,
  onClose,
  onClear,
  onSelectDate,
}: SimpleCalendarModalProps) {
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.min(windowWidth - 48, 360);
  const gridWidth = Math.max(cardWidth - CARD_HORIZONTAL_PADDING * 2, 0);

  const [visibleMonth, setVisibleMonth] = useState(() => startOfCalendarMonth(value));
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(value));
  const [settlingMonth, setSettlingMonth] = useState<Date | null>(null);
  const panX = useRef(new Animated.Value(0)).current;
  const isTransitioning = useRef(false);
  const visibleMonthRef = useRef(visibleMonth);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const next = startOfDay(value);
    const nextMonth = startOfCalendarMonth(next);
    visibleMonthRef.current = nextMonth;
    setVisibleMonth(nextMonth);
    setSelectedDate(next);
    setSettlingMonth(null);
    panX.setValue(0);
    isTransitioning.current = false;
  }, [panX, value, visible]);

  useEffect(() => {
    visibleMonthRef.current = visibleMonth;
  }, [visibleMonth]);

  const today = useMemo(() => startOfDay(new Date()), [visible]);

  const visibleMonths = useMemo(
    () => [
      addCalendarMonths(visibleMonth, -1),
      visibleMonth,
      addCalendarMonths(visibleMonth, 1),
    ],
    [visibleMonth],
  );

  const runMonthTransition = useCallback((delta: number, duration = MONTH_SLIDE_MS) => {
    const direction = delta > 0 ? 1 : -1;
    const width = gridWidth;

    if (isTransitioning.current) {
      return;
    }

    if (width <= 0) {
      const nextMonth = addCalendarMonths(visibleMonthRef.current, direction);
      visibleMonthRef.current = nextMonth;
      setVisibleMonth(nextMonth);
      return;
    }

    isTransitioning.current = true;
    const targetOffset = direction > 0 ? -width : width;

    Animated.timing(panX, {
      duration,
      easing: Easing.out(Easing.cubic),
      toValue: targetOffset,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        const nextMonth = addCalendarMonths(visibleMonthRef.current, direction);
        setSettlingMonth(nextMonth);

        requestAnimationFrame(() => {
          visibleMonthRef.current = nextMonth;
          setVisibleMonth(nextMonth);
          panX.setValue(0);

          requestAnimationFrame(() => {
            setSettlingMonth(null);
            isTransitioning.current = false;
          });
        });
        return;
      }

      panX.setValue(0);
      isTransitioning.current = false;
    });
  }, [gridWidth, panX]);

  const onGestureEvent = useMemo(
    () => Animated.event(
      [{ nativeEvent: { translationX: panX } }],
      { useNativeDriver: true },
    ),
    [panX],
  );

  const handleSwipeStateChange = useCallback((event: PanGestureHandlerStateChangeEvent) => {
    const { state, translationX: dx, velocityX: vx } = event.nativeEvent;

    if (state === State.BEGAN) {
      if (isTransitioning.current) {
        return;
      }
      panX.stopAnimation();
      return;
    }

    if (state !== State.END && state !== State.CANCELLED && state !== State.FAILED) {
      return;
    }

    if (isTransitioning.current) {
      return;
    }

    const width = gridWidth;
    if (width <= 0) {
      panX.setValue(0);
      return;
    }

    const swipedNext = dx <= -SWIPE_DISTANCE_THRESHOLD || vx <= -SWIPE_VELOCITY_THRESHOLD;
    const swipedPrev = dx >= SWIPE_DISTANCE_THRESHOLD || vx >= SWIPE_VELOCITY_THRESHOLD;

    if (swipedNext) {
      runMonthTransition(1);
      return;
    }

    if (swipedPrev) {
      runMonthTransition(-1);
      return;
    }

    Animated.spring(panX, {
      friction: 9,
      tension: 80,
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [gridWidth, panX, runMonthTransition]);

  const handleSelectDay = useCallback((date: Date) => {
    const next = startOfDay(date);
    setSelectedDate(next);
    onSelectDate(next);
  }, [onSelectDate]);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <GestureHandlerRootView style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss calendar"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View style={[styles.card, { width: cardWidth }]}>
          <View style={styles.header}>
            <Text style={styles.monthTitle}>{formatCalendarMonthTitle(visibleMonth)}</Text>
            <View style={styles.monthNav}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                hitSlop={6}
                onPress={() => runMonthTransition(-1)}
                style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
              >
                <Ionicons color="#B5ADA5" name="chevron-back" size={20} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next month"
                hitSlop={6}
                onPress={() => runMonthTransition(1)}
                style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
              >
                <Ionicons color="#B5ADA5" name="chevron-forward" size={20} />
              </Pressable>
              {onClear ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear date"
                  hitSlop={6}
                  onPress={onClear}
                  style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
                >
                  <Ionicons color="#8C847C" name="close" size={20} />
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label) => (
              <View key={label} style={styles.dayColumn}>
                <Text style={styles.weekdayLabel}>{label}</Text>
              </View>
            ))}
          </View>

          <PanGestureHandler
            activeOffsetX={[-12, 12]}
            failOffsetY={[-16, 16]}
            onGestureEvent={onGestureEvent}
            onHandlerStateChange={handleSwipeStateChange}
          >
            <Animated.View
              collapsable={false}
              style={styles.calendarViewport}
            >
              <Animated.View
                style={[
                  styles.calendarStrip,
                  {
                    marginLeft: -gridWidth,
                    width: gridWidth * 3,
                    transform: [{ translateX: panX }],
                  },
                ]}
              >
                {visibleMonths.map((month) => (
                  <CalendarMonthPane
                    key={`${month.getFullYear()}-${month.getMonth()}`}
                    month={month}
                    onSelectDay={handleSelectDay}
                    selectedDate={selectedDate}
                    today={today}
                    width={gridWidth}
                  />
                ))}
              </Animated.View>
              {settlingMonth ? (
                <View pointerEvents="none" style={styles.settlingMonthOverlay}>
                  <CalendarMonthPane
                    month={settlingMonth}
                    onSelectDay={handleSelectDay}
                    selectedDate={selectedDate}
                    today={today}
                    width={gridWidth}
                  />
                </View>
              ) : null}
            </Animated.View>
          </PanGestureHandler>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    elevation: 10,
    overflow: 'hidden',
    paddingBottom: 20,
    paddingHorizontal: 16,
    paddingTop: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  monthTitle: {
    color: '#1F1B17',
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  monthNav: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  navButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  pressed: {
    opacity: 0.6,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayLabel: {
    color: '#9A928A',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  calendarViewport: {
    overflow: 'hidden',
    position: 'relative',
  },
  calendarStrip: {
    flexDirection: 'row',
  },
  settlingMonthOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
  },
  monthPane: {
    flexShrink: 0,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayColumn: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  dayPressable: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    width: '100%',
  },
  dayInner: {
    alignItems: 'center',
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  dayInnerSelected: {
    backgroundColor: ACCENT,
  },
  dayInnerToday: {
    borderColor: ACCENT,
    borderWidth: 1.5,
  },
  dayText: {
    color: '#1F1B17',
    fontSize: 15,
    fontWeight: '500',
  },
  dayTextMuted: {
    color: '#D4CCC4',
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  weekNumber: {
    color: '#C4BCB4',
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 12,
    marginTop: 2,
    textAlign: 'center',
  },
  weekNumberSpacer: {
    height: 14,
  },
});
