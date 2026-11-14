import React, { useRef } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import { useRememberedScroll } from '../useRememberedScroll';

type Props = ScrollViewProps & { memoryKey: string };
export function RememberedScrollView({ memoryKey, ...props }: Props) {
  const ref = useRef<ScrollView>(null);
  const memory = useRememberedScroll(memoryKey, ref);
  return <ScrollView {...props} ref={ref} {...memory} scrollEventThrottle={16}
    onScroll={event => { memory.onScroll(event); props.onScroll?.(event); }} />;
}
export function RememberedGestureScrollView({ memoryKey, ...props }: Props) {
  const ref = useRef<GestureScrollView>(null);
  const memory = useRememberedScroll(memoryKey, ref);
  return <GestureScrollView {...props} ref={ref} {...memory} scrollEventThrottle={16}
    onScroll={event => { memory.onScroll(event); props.onScroll?.(event); }} />;
}
