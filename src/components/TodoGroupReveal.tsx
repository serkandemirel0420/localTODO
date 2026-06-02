import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  type StyleProp,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';

export const TODO_GROUP_REVEAL_ANIMATION_MS = 280;

type TodoGroupRevealProps = {
  children: React.ReactNode;
  reveal: boolean;
};

type AnimatedTodoSectionChevronProps = {
  color: string;
  expanded: boolean;
  size: number;
  style?: StyleProp<ViewStyle>;
};

export function AnimatedTodoSectionChevron({
  color,
  expanded,
  size,
  style,
}: AnimatedTodoSectionChevronProps) {
  const rotation = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(rotation, {
      toValue: expanded ? 1 : 0,
      duration: TODO_GROUP_REVEAL_ANIMATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [expanded, rotation]);

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            {
              rotate: rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '180deg'],
              }),
            },
          ],
        },
      ]}
    >
      <Ionicons color={color} name="chevron-down" size={size} />
    </Animated.View>
  );
}

export function TodoGroupReveal({ children, reveal }: TodoGroupRevealProps) {
  const progress = useRef(new Animated.Value(reveal ? 0 : 1)).current;
  const [layoutHeight, setLayoutHeight] = useState(0);

  useEffect(() => {
    if (layoutHeight <= 0) {
      return;
    }

    progress.setValue(reveal ? 0 : 1);
    Animated.timing(progress, {
      toValue: reveal ? 1 : 0,
      duration: TODO_GROUP_REVEAL_ANIMATION_MS,
      easing: reveal ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [layoutHeight, progress, reveal]);

  const animatedStyle =
    layoutHeight > 0
      ? {
          maxHeight: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, layoutHeight],
          }),
          opacity: progress,
          overflow: 'hidden' as const,
        }
      : { opacity: 0, overflow: 'hidden' as const };

  return (
    <Animated.View style={animatedStyle}>
      <View
        onLayout={(event: LayoutChangeEvent) => {
          const nextHeight = Math.ceil(event.nativeEvent.layout.height);

          if (nextHeight > 0 && nextHeight !== layoutHeight) {
            setLayoutHeight(nextHeight);
          }
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}
