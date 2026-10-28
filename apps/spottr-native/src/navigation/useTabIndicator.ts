import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import type { TabIndicatorTimelineRef } from "./tabIndicatorTimeline";
import {
  cancelAnimation,
  Easing,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

export type TabIndicatorMotion = {
  position: SharedValue<number>;
  itemWidth: number;
  measure: (width: number) => void;
  timeline: TabIndicatorTimelineRef;
};

/** One animation can drive navbar views in different native stack screens. */
export function useTabIndicator(
  activeIndex: number,
  itemWidth: number,
  enabled = true,
) {
  const position = useSharedValue(0);
  const measured = useRef(false);
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
  useLayoutEffect(() => {
    if (!enabled || !itemWidth || Platform.OS === "web") return;
    const target = activeIndex * itemWidth;
    if (!measured.current || reduceMotion) {
      measured.current = true;
      position.value = target;
      return;
    }
    // Run each frame on Reanimated's UI runtime (also used by our sheets).
    // Retarget the current shared position, including across stack scenes,
    // without reading it back onto JS or restarting at a tab's old position.
    position.value = withTiming(target, {
      duration: 320,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
    return () => cancelAnimation(position);
  }, [activeIndex, itemWidth, position, reduceMotion, enabled]);
  return position;
}
