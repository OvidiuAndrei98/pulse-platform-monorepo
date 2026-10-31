import React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import type { TabIndicatorTimelineRef } from "./tabIndicatorTimeline";

export type TabIndicatorProps = {
  position: SharedValue<number>;
  target: number;
  timeline: TabIndicatorTimelineRef;
  style: StyleProp<ViewStyle>;
};

export function TabIndicator({ position, style }: TabIndicatorProps) {
  const motion = useAnimatedStyle(() => ({ transform: [{ translateX: position.value }] }));
  return <Animated.View testID="tab-indicator" pointerEvents="none" style={[style, motion]} />;
}
