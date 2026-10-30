import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { Platform, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { withSpring, type SharedValue } from 'react-native-reanimated';
import { tabCapsulePickupSpring } from './tabCapsuleSpring';

export const navbarCompactScale = 0.83;
export type NavbarScrollController = {
  compact: SharedValue<number>;
  touchRevision: { current: number };
  onTouch: () => void;
};
export const NavbarScrollContext = createContext<NavbarScrollController | null>(null);
type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

function scrollOffset({ nativeEvent: event }: ScrollEvent) {
  const top = event.contentInset?.top ?? 0;
  const maximum = Math.max(0, event.contentSize.height - event.layoutMeasurement.height + top + (event.contentInset?.bottom ?? 0));
  return Math.min(maximum, Math.max(0, event.contentOffset.y + top));
}

/** Observe only the screen's vertical root scroll, never its rails or sheets. */
export function useNavbarScroll(enabled = true) {
  const controller = useContext(NavbarScrollContext);
  const navigation = useNavigation();
  const focused = useRef(false);
  const compact = controller?.compact, revision = controller?.touchRevision;
  const session = useRef({ y: 0, travel: 0, target: 0, active: false, started: false, revision: 0 });

  useEffect(() => {
    // Focus only controls scroll bookkeeping. Subscribing without React state
    // avoids rebuilding Home's rails and profile forms on every tab switch.
    const reset = () => {
      session.current = { y: 0, travel: 0, target: 0, active: false, started: false, revision: revision?.current ?? 0 };
    };
    const onFocus = () => {
      focused.current = true;
      reset();
      if (Platform.OS === 'ios' && compact) compact.value = withSpring(0, tabCapsulePickupSpring);
    };
    const onBlur = () => { focused.current = false; reset(); };
    if (navigation.isFocused()) onFocus(); else onBlur();
    const removeFocus = navigation.addListener('focus', onFocus);
    const removeBlur = navigation.addListener('blur', onBlur);
    return () => { removeFocus(); removeBlur(); };
  }, [navigation, enabled, compact, revision]);

  const onScrollBeginDrag = useCallback((event: ScrollEvent) => {
    if (Platform.OS !== 'ios' || !focused.current || !enabled || !compact || !revision) return;
    const current = session.current;
    if (current.revision !== revision.current) current.target = 0;
    current.y = scrollOffset(event); current.travel = 0;
    current.revision = revision.current; current.active = true; current.started = true;
  }, [enabled, compact, revision]);

  const onScroll = useCallback((event: ScrollEvent) => {
    const current = session.current;
    if (Platform.OS !== 'ios' || !focused.current || !enabled || !compact || !revision || !current.active) return;
    // A touch on the navbar keeps it expanded through the old scroll's inertia.
    if (current.revision !== revision.current) { current.active = false; current.started = false; current.target = 0; return; }
    const y = scrollOffset(event), delta = y - current.y;
    current.y = y;
    if (!delta && y > 4) return;
    current.travel = Math.sign(delta) === Math.sign(current.travel) ? current.travel + delta : delta;
    const target = y <= 4 || current.travel <= -12 ? 0 : current.travel >= 18 ? 1 : current.target;
    if (target !== current.target) {
      current.target = target; current.travel = 0;
      // Scroll events only choose a state. The spring runs on the UI thread.
      compact.value = withSpring(target, tabCapsulePickupSpring);
    }
  }, [enabled, compact, revision]);

  const onScrollEndDrag = useCallback(() => { session.current.active = false; }, []);
  const onMomentumScrollBegin = useCallback(() => {
    const current = session.current;
    current.active = Platform.OS === 'ios' && focused.current && enabled && !!compact && current.started && current.revision === revision?.current;
  }, [enabled, compact, revision]);
  const onMomentumScrollEnd = useCallback(() => {
    session.current.active = false; session.current.started = false;
  }, []);

  return { onScroll, onScrollBeginDrag, onScrollEndDrag, onMomentumScrollBegin, onMomentumScrollEnd, scrollEventThrottle: 16 };
}
