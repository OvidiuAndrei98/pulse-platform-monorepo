import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import {
  RefreshSpotlightBeam,
  type RefreshSpotlightProps,
} from "./RefreshSpotlightBeam";
import { REFRESH_LIGHT_FADE_MS } from "./useRefreshFeedback";

export function RefreshSpotlight({
  progress,
  active,
  visible,
}: RefreshSpotlightProps) {
  const sweep = useRef(new Animated.Value(-1)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const fraction = Math.min(1, Math.max(0, progress));
  useEffect(() => {
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
  }, []);
  useEffect(() => {
    if (!active || reduceMotion) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, {
          toValue: 1,
          duration: 1700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(sweep, {
          toValue: -1,
          duration: 1700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
      { resetBeforeIteration: false },
    );
    animation.start();
    return () => animation.stop();
  }, [active, reduceMotion, sweep]);
  useEffect(() => {
    const animation = Animated.timing(opacity, {
      toValue: visible ? Math.min(1, fraction * 1.8) : 0,
      duration: visible ? 80 : REFRESH_LIGHT_FADE_MS,
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [visible, fraction, opacity]);
  return (
    <Animated.View
      testID="refresh-light"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: 104, height: 60, opacity }}
    >
      <Animated.View
        testID="refresh-light-sweep"
        style={{
          width: 104,
          height: 60,
          transformOrigin: [52, 5, 0],
          transform: [
            {
              rotate: reduceMotion
                ? "0deg"
                : sweep.interpolate({
                    inputRange: [-1, 1],
                    outputRange: ["-12deg", "12deg"],
                  }),
            },
          ],
        }}
      >
        <View
          style={{
            transformOrigin: "top",
            transform: [{ scaleY: 0.35 + fraction * 0.65 }],
          }}
        >
          <RefreshSpotlightBeam />
        </View>
      </Animated.View>
    </Animated.View>
  );
}
