import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform } from "react-native";

export type TabIndicatorMotion = {
  position: Animated.Value;
  itemWidth: number;
  measure: (width: number) => void;
};

/** One animation can drive navbar views in different native stack screens. */
export function useTabIndicator(
  activeIndex: number,
  itemWidth: number,
  enabled = true,
) {
  const position = useRef(new Animated.Value(0)).current;
  const measured = useRef(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    if (!enabled) return;
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
  useEffect(() => {
    if (!enabled || !itemWidth) return;
    if (!measured.current) {
      measured.current = true;
      position.setValue(activeIndex * itemWidth);
      return;
    }
    if (reduceMotion) {
      position.setValue(activeIndex * itemWidth);
      return;
    }
    const animation = Animated.timing(position, {
      toValue: activeIndex * itemWidth,
      duration: 320,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [activeIndex, itemWidth, position, reduceMotion, enabled]);
  return position;
}
