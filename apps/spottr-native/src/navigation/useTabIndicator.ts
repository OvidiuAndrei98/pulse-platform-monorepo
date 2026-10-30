import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import type { TabIndicatorTimelineRef } from "./tabIndicatorTimeline";
import {
  cancelAnimation,
  runOnUI,
  Easing,
  useSharedValue,
  withTiming,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { tabCapsuleSpring } from './tabCapsuleSpring';

export type TabIndicatorMotion = {
  position: SharedValue<number>;
  itemWidth: number;
  measure: (width: number) => void;
  timeline: TabIndicatorTimelineRef;
  interaction?: SharedValue<number>;
  edgeResponse?: SharedValue<number>;
  edgeDirection?: SharedValue<number>;
  gestureCommand?: SharedValue<TabGestureCommand>;
};

export type TabGestureCommand = { id: number; index: number; pending: boolean; acknowledgedId: number };

/** One animation can drive navbar views in different native stack screens. */
export function useTabIndicator(
  activeIndex: number,
  itemWidth: number,
  enabled = true,
  gesture?: { command: SharedValue<TabGestureCommand>; acknowledged: number },
) {
  const position = useSharedValue(0);
  const measured = useRef(false);
  const previousWidth = useRef(itemWidth);
  const command = gesture?.command, acknowledged = gesture?.acknowledged ?? 0;
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    if (!enabled || Platform.OS === "web") return;
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setReduceMotion(value);
      })
      .catch(() => {});
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      alive = false;
      listener.remove();
    };
  }, [enabled]);
  useEffect(() => () => cancelAnimation(position), [position]);
  useLayoutEffect(() => {
    if (Platform.OS === "web") return;
    if (!enabled || !itemWidth) {
      cancelAnimation(position);
      return;
    }
    const target = activeIndex * itemWidth;
    const snap = !measured.current || reduceMotion;
    const resized = previousWidth.current !== itemWidth;
    measured.current = true;
    previousWidth.current = itemWidth;
    if (Platform.OS === 'ios' && command) {
      runOnUI(() => {
        const request = command.value;
        // A route can acknowledge an older touch after a newer UI spring began.
        // Never replay that route over the capsule's latest destination.
        if (request.pending && (request.id > acknowledged || request.index !== activeIndex)) return;
        const fromGesture = request.id > request.acknowledgedId;
        if (fromGesture) command.value = { ...request, pending: false, acknowledgedId: request.id };
        if (snap) position.value = target;
        else if (!fromGesture || resized) position.value = withSpring(target, tabCapsuleSpring);
      })();
      return;
    }
    if (snap) {
      position.value = target;
      return;
    }
    // Run each frame on Reanimated's UI runtime (also used by our sheets).
    // Retarget the current shared position, including across stack scenes,
    // without reading it back onto JS or restarting at a tab's old position.
    position.value = Platform.OS === 'ios' ? withSpring(target, tabCapsuleSpring) : withTiming(target, {
      duration: 320,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
    // Retargeting keeps the current spring velocity. Cancelling in this effect's
    // cleanup made the route acknowledgement interrupt the finger's release.
  }, [activeIndex, itemWidth, position, reduceMotion, enabled, command, acknowledged]);
  return position;
}
