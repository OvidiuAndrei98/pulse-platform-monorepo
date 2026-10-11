import { useCallback } from 'react';
import { State } from 'react-native-gesture-handler';
import { scrollTo } from 'react-native-reanimated';
import { ANIMATION_STATUS, SCROLLABLE_STATUS, SHEET_STATE, useBottomSheetInternal, useScrollEventsHandlersDefault, type ScrollEventsHandlersHookType, type ScrollEventHandlerCallbackType } from '@gorhom/bottom-sheet';

/** Native-only fixes around Gorhom 5.2.14's scroll lock. Pan stays library-owned. */
export const useSheetScrollEvents: ScrollEventsHandlersHookType = (ref, offset) => {
  const original = useScrollEventsHandlersDefault(ref, offset);
  const { animatedScrollableStatus, animatedScrollableState, animatedAnimationState, animatedSheetState, animatedHandleGestureState, animatedPosition, animatedDetentsState } = useBottomSheetInternal();
  type Handler = ScrollEventHandlerCallbackType<Record<string, unknown>>;
  const isAtOpenPosition = useCallback(() => {
    'worklet';
    const highest = animatedDetentsState.get().highestDetentPosition;
    // Gorhom's derived EXTENDED state uses exact coordinate equality. Native
    // layout/animation rounding must not turn an expanded sheet into a scroll
    // lock. Keyboard-raised positions are also above this snap. The grabber
    // still owns its lock while it is actively moving the sheet.
    return highest !== undefined && animatedHandleGestureState.value !== State.ACTIVE
      && animatedPosition.value <= highest + 0.5;
  }, [animatedDetentsState, animatedHandleGestureState, animatedPosition]);
  const lock = useCallback((event: Parameters<Handler>[0], context: Record<string, unknown>) => {
    'worklet';
    if (animatedScrollableStatus.value !== SCROLLABLE_STATUS.LOCKED || isAtOpenPosition()) return false;
    const y = event.contentOffset.y;
    const position = context.shouldLockInitialPosition && typeof context.initialContentOffsetY === 'number' ? context.initialContentOffsetY : 0;
    offset.value = position;
    // On Fabric, scrollTo can synchronously emit another onScroll. Repeating
    // the same command at the locked offset causes a recursive event loop.
    // Native pixel rounding also needs tolerance, not exact float equality.
    if (Math.abs(y - position) > 0.5) {
      scrollTo(ref as Parameters<typeof scrollTo>[0], 0, position, false);
    }
    return true;
  }, [animatedScrollableStatus, isAtOpenPosition, offset, ref]);
  const handleOnBeginDrag: Handler = useCallback((event, context) => {
    'worklet';
    (original.handleOnBeginDrag as Handler | undefined)?.(event, context);
    if (isAtOpenPosition()) context.shouldLockInitialPosition = false;
  }, [isAtOpenPosition, original.handleOnBeginDrag]);
  const handleOnScroll: Handler = useCallback((event, context) => {
    'worklet';
    if (isAtOpenPosition() || animatedSheetState.value === SHEET_STATE.EXTENDED || animatedSheetState.value === SHEET_STATE.FILL_PARENT) context.shouldLockInitialPosition = false;
    if (animatedHandleGestureState.value === State.ACTIVE) {
      context.shouldLockInitialPosition = true;
      context.initialContentOffsetY = event.contentOffset.y;
    }
    // Keep the scroll view's own offset current, including momentum and focus
    // changes. Do not update the pan recognizer's offset here: it combines the
    // start offset with cumulative translation until the gesture ends.
    if (!lock(event, context)) offset.value = event.contentOffset.y;
  }, [isAtOpenPosition, animatedSheetState, animatedHandleGestureState, lock, offset]);
  const handleOnFinish: Handler = useCallback((event, context) => {
    'worklet';
    if (lock(event, context)) return;
    offset.value = event.contentOffset.y;
    // A slow release may have no momentum-end event. Save it now even if an
    // opening/keyboard animation is settling at the open snap; otherwise the
    // next gesture or focus registration can restore the initial zero.
    if (isAtOpenPosition() || animatedAnimationState.get().status !== ANIMATION_STATUS.RUNNING) {
      animatedScrollableState.set(state => ({ ...state, contentOffsetY: event.contentOffset.y }));
    }
  }, [lock, offset, isAtOpenPosition, animatedAnimationState, animatedScrollableState]);
  return { ...original, handleOnBeginDrag, handleOnScroll, handleOnEndDrag: handleOnFinish, handleOnMomentumEnd: handleOnFinish };
};
