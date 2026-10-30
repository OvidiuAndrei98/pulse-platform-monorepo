import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import type { View as ViewInstance } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { GESTURE_SOURCE, useBottomSheetInternal, useGestureEventsHandlersDefault, type GestureEventHandlerCallbackType, type GestureEventsHandlersHookType } from '@gorhom/bottom-sheet';
import { splitSheetDrag } from './sheetScrollMath';

type Bridge = { target: HTMLElement | null; pointerOriginY: number | null; frame: number | null };
const Context = createContext<React.RefObject<Bridge> | null>(null);
function stopMomentum(bridge: Bridge) {
  if (bridge.frame !== null) cancelAnimationFrame(bridge.frame);
  bridge.frame = null;
}
export function SheetScrollProvider({ children }: React.PropsWithChildren) {
  const bridge = useRef<Bridge>({ target: null, pointerOriginY: null, frame: null });
  useEffect(() => {
    // RNGH's NativeViewGestureHandler resets inline touch-action to auto. Scope
    // this rule to our own sheet scrollers instead of patching the dependency.
    const style = document.createElement('style');
    style.textContent = '[data-spottr-sheet-scroll] { touch-action: pan-x pinch-zoom !important; overscroll-behavior-y: contain; }';
    document.head.appendChild(style);
    return () => { style.remove(); stopMomentum(bridge.current); };
  }, []);
  return <Context.Provider value={bridge}>{children}</Context.Provider>;
}
function useBridge() {
  const bridge = useContext(Context);
  if (!bridge) throw new Error('Sheet scroll bridge needs its provider');
  return bridge;
}

export function useSheetScrollSurface(surface: React.RefObject<ViewInstance | null>) {
  const bridge = useBridge();
  const { animatedContentGestureState, animatedHandleGestureState } = useBottomSheetInternal();
  useEffect(() => {
    const element = surface.current as unknown as HTMLElement | null;
    if (!element) return;
    const previous = element.style.touchAction;
    // Otherwise browser scrolling emits pointercancel, and the sheet cannot
    // receive the remainder of that touch when the content reaches its top.
    // Wheel, keyboard, horizontal scrolling and pinch zoom stay browser-owned.
    element.style.touchAction = 'pan-x pinch-zoom';
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      stopMomentum(bridge.current);
      bridge.current.target = null;
      bridge.current.pointerOriginY = event.clientY;
      for (let node = event.target as HTMLElement | null; node && node !== element; node = node.parentElement) {
        const overflow = getComputedStyle(node).overflowY;
        if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight + 1) {
          bridge.current.target = node;
          break;
        }
      }
    };
    const interrupt = () => stopMomentum(bridge.current);
    let touchOrigin: { x: number; y: number } | null = null;
    let verticalClaimed = false;
    const touchStart = (event: TouchEvent) => {
      const touch = event.touches.length === 1 ? event.touches[0] : undefined;
      touchOrigin = touch ? { x: touch.clientX, y: touch.clientY } : null;
      verticalClaimed = false;
    };
    const touchMove = (event: TouchEvent) => {
      if (!touchOrigin || event.touches.length !== 1 || !event.cancelable) return;
      const touch = event.touches[0];
      if (!touch) return;
      const content = animatedContentGestureState.get(), handle = animatedHandleGestureState.get();
      if (!verticalClaimed && Math.abs(touch.clientY - touchOrigin.y) > Math.abs(touch.clientX - touchOrigin.x)) {
        verticalClaimed = content === State.BEGAN || content === State.ACTIVE || handle === State.BEGAN || handle === State.ACTIVE;
      }
      // Once claimed, the whole touch belongs to Pan, including a reversal back
      // to its origin. Releasing browser ownership mid-drag can consume its next tap.
      if (verticalClaimed) event.preventDefault();
    };
    const touchFinish = () => { touchOrigin = null; verticalClaimed = false; };
    element.addEventListener('pointerdown', down, true);
    element.addEventListener('touchstart', touchStart, { capture: true, passive: true });
    element.addEventListener('touchmove', touchMove, { capture: true, passive: false });
    element.addEventListener('touchend', touchFinish, true);
    element.addEventListener('touchcancel', touchFinish, true);
    element.addEventListener('wheel', interrupt, { passive: true, capture: true });
    element.addEventListener('keydown', interrupt, true);
    return () => {
      element.style.touchAction = previous;
      element.removeEventListener('pointerdown', down, true);
      element.removeEventListener('touchstart', touchStart, true);
      element.removeEventListener('touchmove', touchMove, true);
      element.removeEventListener('touchend', touchFinish, true);
      element.removeEventListener('touchcancel', touchFinish, true);
      element.removeEventListener('wheel', interrupt, true);
      element.removeEventListener('keydown', interrupt, true);
      stopMomentum(bridge.current);
    };
  }, [animatedContentGestureState, animatedHandleGestureState, bridge, surface]);
}

type Drag = { element: HTMLElement; pointerOriginY: number; scroll: number; gap: number; sheetTranslation: number };
export const sheetGestureHandlersHook: GestureEventsHandlersHookType = function useWebSheetGestures() {
  const original = useGestureEventsHandlersDefault();
  const { animatedScrollableState, animatedPosition, animatedDetentsState } = useBottomSheetInternal();
  const bridge = useBridge(), drag = useRef<Drag | null>(null);
  const movement = useRef({ at: 0, y: 0 });
  const setScroll = useCallback((element: HTMLElement, offset: number) => {
    const value = Math.max(0, Math.min(element.scrollHeight - element.clientHeight, offset));
    element.scrollTop = value;
    animatedScrollableState.set(state => ({ ...state, contentOffsetY: value }));
  }, [animatedScrollableState]);
  const handleOnStart: GestureEventHandlerCallbackType = useCallback((source, event) => {
    movement.current = { at: performance.now(), y: event.translationY };
    stopMomentum(bridge.current);
    const element = source === GESTURE_SOURCE.CONTENT ? bridge.current.target : null;
    const highest = animatedDetentsState.get().highestDetentPosition;
    drag.current = element && highest !== undefined ? {
      element, pointerOriginY: bridge.current.pointerOriginY ?? event.absoluteY - event.translationY, scroll: element.scrollTop,
      gap: Math.max(0, animatedPosition.get() - highest), sheetTranslation: 0,
    } : null;
    original.handleOnStart(source, drag.current ? { ...event, translationY: 0 } : event);
  }, [bridge, animatedDetentsState, animatedPosition, original.handleOnStart]);
  const handleOnChange: GestureEventHandlerCallbackType = useCallback((source, event) => {
    if (Math.abs(event.translationY - movement.current.y) > 0.5) movement.current = { at: performance.now(), y: event.translationY };
    const current = drag.current;
    if (!current || source !== GESTURE_SOURCE.CONTENT) { original.handleOnChange(source, event); return; }
    // RNGH resets translationY when Pan activates. Use the original pointer
    // position so returning to it does not introduce an activation-slop scroll.
    const next = splitSheetDrag(event.absoluteY - current.pointerOriginY, current.scroll, current.gap, current.element.scrollHeight - current.element.clientHeight);
    current.sheetTranslation = next.sheetTranslation;
    setScroll(current.element, next.scroll);
    original.handleOnChange(source, { ...event, translationY: next.sheetTranslation });
  }, [original.handleOnChange, setScroll]);
  const handleOnEnd: GestureEventHandlerCallbackType = useCallback((source, event) => {
    // RNGH may retain the last moving sample's velocity after a stationary hold.
    // Releasing a held finger must not turn into a fling or dismiss the sheet.
    const velocityY = performance.now() - movement.current.at <= 100 ? event.velocityY : 0;
    const current = drag.current;
    if (!current || source !== GESTURE_SOURCE.CONTENT) { original.handleOnEnd(source, { ...event, velocityY }); return; }
    // Only motion actually allocated to the sheet can choose its closing snap.
    const sheetMoved = current.gap + current.sheetTranslation > 1;
    original.handleOnEnd(source, { ...event, translationY: current.sheetTranslation, velocityY: sheetMoved ? velocityY : 0 });
    drag.current = null;
    if (sheetMoved) return;
    let speed = Math.max(-4000, Math.min(4000, -velocityY));
    let last = performance.now();
    let position = current.element.scrollTop;
    const tick = (now: number) => {
      const elapsed = Math.max(0, Math.min(32, now - last)) / 1000; last = now;
      speed *= Math.exp(-5 * elapsed);
      const limit = Math.max(0, current.element.scrollHeight - current.element.clientHeight);
      // Keep subpixel motion between frames. A near-zero first RAF delta or
      // rounded DOM scrollTop must not stop a moving fling immediately.
      position = Math.max(0, Math.min(limit, position + speed * elapsed));
      setScroll(current.element, position);
      if (Math.abs(speed) < 15 || (position <= 0 && speed < 0) || (position >= limit && speed > 0) || !current.element.isConnected) {
        bridge.current.frame = null;
        return;
      }
      bridge.current.frame = requestAnimationFrame(tick);
    };
    if (Math.abs(speed) >= 15) bridge.current.frame = requestAnimationFrame(tick);
  }, [bridge, original.handleOnEnd, setScroll]);
  const handleOnFinalize: GestureEventHandlerCallbackType = useCallback((source, event) => {
    drag.current = null;
    original.handleOnFinalize(source, event);
  }, [original.handleOnFinalize]);
  return { handleOnStart, handleOnChange, handleOnEnd, handleOnFinalize };
};
