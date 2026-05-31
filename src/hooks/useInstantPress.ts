import { useCallback, useEffect, useRef } from 'react';
import { type GestureResponderEvent } from 'react-native';

export type InstantPressHandlers = {
  onPress: (event: GestureResponderEvent) => void;
  onPressIn: (event: GestureResponderEvent) => void;
  onPressOut: (event: GestureResponderEvent) => void;
};

type InstantPressOptions = {
  stopPropagation?: boolean;
};

export const useInstantPress = (clearDelayMs = 300) => {
  const instantPressKeyRef = useRef<string | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  const runPressIn = useCallback((key: string, action: () => void) => {
    clearTimer();
    instantPressKeyRef.current = key;
    action();
  }, [clearTimer]);

  const runPress = useCallback((key: string, action: () => void) => {
    if (instantPressKeyRef.current === key) {
      instantPressKeyRef.current = null;
      clearTimer();
      return;
    }

    action();
  }, [clearTimer]);

  const clearSoon = useCallback((key: string) => {
    clearTimer();
    clearTimerRef.current = setTimeout(() => {
      if (instantPressKeyRef.current === key) {
        instantPressKeyRef.current = null;
      }
      clearTimerRef.current = null;
    }, clearDelayMs);
  }, [clearDelayMs, clearTimer]);

  const getInstantPressHandlers = useCallback(
    (
      key: string,
      action: () => void,
      options: InstantPressOptions = {},
    ): InstantPressHandlers => {
      const stopIfNeeded = (event: GestureResponderEvent) => {
        if (options.stopPropagation) {
          event.stopPropagation();
        }
      };

      return {
        onPress: (event) => {
          stopIfNeeded(event);
          runPress(key, action);
        },
        onPressIn: (event) => {
          stopIfNeeded(event);
          runPressIn(key, action);
        },
        onPressOut: (event) => {
          stopIfNeeded(event);
          clearSoon(key);
        },
      };
    },
    [clearSoon, runPress, runPressIn],
  );

  useEffect(
    () => () => {
      clearTimer();
    },
    [clearTimer],
  );

  return getInstantPressHandlers;
};
