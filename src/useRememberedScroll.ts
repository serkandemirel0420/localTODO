import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { uiMemoryStore } from './storage/uiMemoryStore';

type ScrollTarget = { scrollToOffset?: (options: { offset: number; animated: boolean }) => void;
  scrollTo?: (options: { y: number; animated: boolean }) => void };

export function useRememberedScroll(key: string, target: RefObject<ScrollTarget | null>,
  options: { active?: boolean; fallback?: number; onRestore?: (offset: number) => void } = {}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const active = options.active !== false;
  const state = useRef({ key, active, pending: true, tracking: false, height: 0, content: 0, loaded: false });
  if (state.current.key !== key || state.current.active !== active)
    state.current = { ...state.current, key, active, pending: true, tracking: false, content: 0 };
  const restore = useCallback(() => {
    const s = state.current;
    if (!s.pending || !s.loaded || optionsRef.current.active === false || !target.current) return;
    const wanted = uiMemoryStore.offset(key) ?? optionsRef.current.fallback ?? 0;
    const offset = s.height && s.content ? Math.min(wanted, Math.max(0, s.content - s.height)) : wanted;
    target.current.scrollToOffset?.({ offset, animated: false });
    target.current.scrollTo?.({ y: offset, animated: false });
    optionsRef.current.onRestore?.(offset);
    // Keep the saved position while virtualized/async content is still growing.
    if (s.height > 0 && s.content > 0 && s.content - s.height >= wanted) s.pending = false;
  }, [key, target]);
  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    void uiMemoryStore.ready().then(() => {
      if (cancelled) return;
      state.current.loaded = true;
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => { if (!cancelled) restore(); });
      });
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [key, options.active, restore]);
  return {
    onLayout: (event: LayoutChangeEvent) => { state.current.height = event.nativeEvent.layout.height; restore(); },
    onContentSizeChange: (_width: number, height: number) => { state.current.content = height; restore(); },
    onScrollBeginDrag: () => { state.current.pending = false; state.current.tracking = true; },
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (state.current.loaded && state.current.tracking && !state.current.pending && optionsRef.current.active !== false)
        uiMemoryStore.rememberOffset(key, Math.max(0, event.nativeEvent.contentOffset.y));
    },
  };
}
