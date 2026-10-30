import type { ScrollViewInstance } from 'react-native';
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps, type ViewStyle } from 'react-native';
import { RefreshSpotlight } from './RefreshSpotlight';
import { useRefreshFeedback } from './useRefreshFeedback';
import { REFRESH_LOADING_OFFSET, REFRESH_PULL_THRESHOLD, refreshPullIntent, refreshPullOffset } from './refreshGesture';

export type RefreshScrollViewProps = Omit<ScrollViewProps, 'refreshControl'> & {
  refreshing?: boolean;
  onRefresh?: () => void | Promise<unknown>;
};

type Pull = { kind: 'touch' | 'mouse'; id: number; x: number; y: number; claimed: boolean; distance: number };

function canStartAt(target: EventTarget | null, scroller: HTMLElement): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return false;
  for (let node = target; node && node !== scroller; node = node.parentElement!) {
    if (node instanceof HTMLElement && node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(node).overflowY)) return false;
  }
  return true;
}

/** RN Web's RefreshControl is a no-op. Claim only a downward pull that begins at the top. */
export const RefreshScrollView = forwardRef<ScrollViewInstance, RefreshScrollViewProps>(function RefreshScrollView(
  { refreshing = false, onRefresh, contentContainerStyle, children, testID, ...props }, ref,
) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  useImperativeHandle(ref, () => scrollRef.current!, []);
  const current = useRef({ refreshing, onRefresh });
  current.current = { refreshing, onRefresh };
  const feedback = useRefreshFeedback(refreshing, onRefresh);
  const pendingRef = feedback.locked;
  const [pull, setPull] = useState({ offset: 0, distance: 0, dragging: false });
  const resetGesture = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    const scroller = scrollRef.current?.getScrollableNode() as HTMLElement | undefined;
    if (!scroller) return;
    let gesture: Pull | undefined;
    let suppressClick = false;
    let alive = true;

    // Keep pull progress while the light fades; retract only after it extinguishes.
    const reset = () => { gesture = undefined; if (alive) setPull(previous => ({ ...previous, offset: 0, dragging: false })); };
    resetGesture.current = reset;
    const start = (kind: Pull['kind'], id: number, x: number, y: number, target: EventTarget | null) => {
      reset();
      suppressClick = false;
      if (!current.current.onRefresh || current.current.refreshing || pendingRef.current || props.horizontal || props.scrollEnabled === false || scroller.scrollTop > 1 || !canStartAt(target, scroller)) return;
      gesture = { kind, id, x, y, claimed: false, distance: 0 };
    };
    const move = (x: number, y: number, event: Event) => {
      if (!gesture) return;
      const dy = y - gesture.y;
      if (!gesture.claimed) {
        const intent = refreshPullIntent(x - gesture.x, dy);
        if (intent === 'scroll' || scroller.scrollTop > 1) { reset(); return; }
        if (intent !== 'pull') return;
        // A noncancelable move means the browser already owns this gesture.
        if (!event.cancelable) { reset(); return; }
        gesture.claimed = true;
        suppressClick = true;
      }
      // Keep ownership through a reversal; returning to the origin must not turn a drag into a tap.
      if (event.cancelable) event.preventDefault();
      gesture.distance = Math.max(0, dy);
      setPull({ offset: refreshPullOffset(gesture.distance), distance: gesture.distance, dragging: true });
    };
    const finish = (cancelled: boolean, event: Event) => {
      const finished = gesture;
      reset();
      if (!finished?.claimed) return;
      if (event.cancelable) event.preventDefault();
      if (cancelled || finished.distance < REFRESH_PULL_THRESHOLD || current.current.refreshing || pendingRef.current) return;
      const refresh = current.current.onRefresh;
      if (!refresh) return;
      feedback.run();
    };
    const touchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) { reset(); return; }
      const touch = event.touches[0]!;
      start('touch', touch.identifier, touch.clientX, touch.clientY, event.target);
    };
    const touchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) { reset(); return; }
      if (gesture?.kind !== 'touch') return;
      const touch = Array.from(event.touches).find(item => item.identifier === gesture?.id);
      if (touch) move(touch.clientX, touch.clientY, event);
    };
    const touchEnd = (event: TouchEvent) => {
      if (gesture?.kind !== 'touch') return;
      if (Array.from(event.changedTouches).some(item => item.identifier === gesture?.id)) finish(event.type === 'touchcancel', event);
    };
    const mouseDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button === 0 && event.isPrimary) start('mouse', event.pointerId, event.clientX, event.clientY, event.target);
    };
    const mouseMove = (event: PointerEvent) => {
      if (gesture?.kind === 'mouse' && gesture.id === event.pointerId) move(event.clientX, event.clientY, event);
    };
    const mouseUp = (event: PointerEvent) => {
      if (gesture?.kind === 'mouse' && gesture.id === event.pointerId) finish(event.type === 'pointercancel', event);
    };
    const click = (event: MouseEvent) => {
      if (!suppressClick || event.detail === 0) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    };
    const dragStart = (event: DragEvent) => {
      if (gesture?.claimed) event.preventDefault();
    };
    const blur = () => reset();
    scroller.addEventListener('touchstart', touchStart, { capture: true, passive: true });
    scroller.addEventListener('touchmove', touchMove, { capture: true, passive: false });
    window.addEventListener('touchend', touchEnd, { capture: true, passive: false });
    window.addEventListener('touchcancel', touchEnd, { capture: true, passive: false });
    scroller.addEventListener('pointerdown', mouseDown, true);
    window.addEventListener('pointermove', mouseMove, true);
    window.addEventListener('pointerup', mouseUp, true);
    window.addEventListener('pointercancel', mouseUp, true);
    scroller.addEventListener('click', click, true);
    scroller.addEventListener('dragstart', dragStart, true);
    window.addEventListener('blur', blur);
    return () => {
      alive = false;
      resetGesture.current = undefined;
      scroller.removeEventListener('touchstart', touchStart, true);
      scroller.removeEventListener('touchmove', touchMove, true);
      window.removeEventListener('touchend', touchEnd, true);
      window.removeEventListener('touchcancel', touchEnd, true);
      scroller.removeEventListener('pointerdown', mouseDown, true);
      window.removeEventListener('pointermove', mouseMove, true);
      window.removeEventListener('pointerup', mouseUp, true);
      window.removeEventListener('pointercancel', mouseUp, true);
      scroller.removeEventListener('click', click, true);
      scroller.removeEventListener('dragstart', dragStart, true);
      window.removeEventListener('blur', blur);
    };
  }, [props.horizontal, props.scrollEnabled, feedback.run, pendingRef]);

  const refreshEnabled = Boolean(onRefresh);
  // Only availability/loading changes matter; callback identity does not.
  useEffect(() => { if (!refreshEnabled || refreshing) resetGesture.current?.(); }, [refreshEnabled, refreshing]);

  const { busy, holding } = feedback;
  const offset = holding ? REFRESH_LOADING_OFFSET : pull.offset;
  const baseTransform = StyleSheet.flatten(contentContainerStyle)?.transform;
  const transform: ViewStyle['transform'] = typeof baseTransform === 'string'
    ? `${baseTransform} translateY(${offset}px)`
    : [...(baseTransform ?? []), { translateY: offset }];
  const movement = { transform, transitionProperty: 'transform', transitionDuration: pull.dragging ? '0ms' : '240ms', transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' } as ViewStyle;
  return <ScrollView {...props} ref={scrollRef} testID={testID} contentContainerStyle={[contentContainerStyle, movement]}>
    {onRefresh && <View pointerEvents="none" aria-hidden testID={testID ? `${testID}-refresh-indicator` : undefined} style={{ position: 'absolute', top: -64, left: 0, right: 0, height: 60, alignItems: 'center', justifyContent: 'center' } as ViewStyle}>
      <RefreshSpotlight progress={holding ? 1 : pull.distance / REFRESH_PULL_THRESHOLD} active={busy || pull.dragging} visible={busy || pull.dragging} />
    </View>}
    {children}
  </ScrollView>;
});
