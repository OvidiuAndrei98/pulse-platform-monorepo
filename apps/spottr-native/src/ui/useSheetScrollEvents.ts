import { useCallback } from 'react';
import { State } from 'react-native-gesture-handler';
import { scrollTo } from 'react-native-reanimated';
import { SCROLLABLE_STATUS, SHEET_STATE, useBottomSheetInternal, useScrollEventsHandlersDefault, type ScrollEventsHandlersHookType, type ScrollEventHandlerCallbackType } from '@gorhom/bottom-sheet';

/** Native-only fixes around Gorhom 5.2.14's scroll lock. Pan stays library-owned. */
export const useSheetScrollEvents: ScrollEventsHandlersHookType = (ref, offset) => {
  const original = useScrollEventsHandlersDefault(ref, offset);
  const { animatedScrollableStatus, animatedSheetState, animatedHandleGestureState } = useBottomSheetInternal();
  type Handler = ScrollEventHandlerCallbackType<Record<string, unknown>>;
  const lock = useCallback((y: number, context: Record<string, unknown>) => {
    'worklet';
    if (animatedScrollableStatus.value !== SCROLLABLE_STATUS.LOCKED) return false;
    const position = context.shouldLockInitialPosition && typeof context.initialContentOffsetY === 'number' ? context.initialContentOffsetY : 0;
    offset.value = position;
    // On Fabric, scrollTo can synchronously emit another onScroll. Repeating
    // the same command at the locked offset causes a recursive event loop.
    // Native pixel rounding also needs tolerance, not exact float equality.
    if (Math.abs(y - position) > 0.5) scrollTo(ref as Parameters<typeof scrollTo>[0], 0, position, false);
    return true;
  }, [animatedScrollableStatus, offset, ref]);
  const handleOnScroll: Handler = useCallback((event, context) => {
    'worklet';
    if (animatedSheetState.value === SHEET_STATE.EXTENDED || animatedSheetState.value === SHEET_STATE.FILL_PARENT) context.shouldLockInitialPosition = false;
    if (animatedHandleGestureState.value === State.ACTIVE) {
      context.shouldLockInitialPosition = true;
      context.initialContentOffsetY = event.contentOffset.y;
    }
    if (!lock(event.contentOffset.y, context)) (original.handleOnScroll as Handler | undefined)?.(event, context);
  }, [animatedSheetState, animatedHandleGestureState, lock, original.handleOnScroll]);
  const handleOnEndDrag: Handler = useCallback((event, context) => {
    'worklet';
    if (!lock(event.contentOffset.y, context)) (original.handleOnEndDrag as Handler | undefined)?.(event, context);
  }, [lock, original.handleOnEndDrag]);
  const handleOnMomentumEnd: Handler = useCallback((event, context) => {
    'worklet';
    // The original locked branch stores zero even when lockPosition > 0.
    // Keep the real offset so refocus/next drag does not jump back to the top.
    if (!lock(event.contentOffset.y, context)) (original.handleOnMomentumEnd as Handler | undefined)?.(event, context);
  }, [lock, original.handleOnMomentumEnd]);
  return { ...original, handleOnScroll, handleOnEndDrag, handleOnMomentumEnd };
};
