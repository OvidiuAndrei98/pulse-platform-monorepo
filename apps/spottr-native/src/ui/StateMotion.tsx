import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { type PressableProps, type TextProps, type ViewProps } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { MotionPressable } from './MotionPressable';
import { Text } from './Text';

function useStateColors(background: string, border: string) {
  const backgroundColor = useSharedValue(background), borderColor = useSharedValue(border);
  useEffect(() => {
    const config = { duration: 180, easing: Easing.out(Easing.cubic) };
    backgroundColor.value = withTiming(background, config);
    borderColor.value = withTiming(border, config);
    return () => { cancelAnimation(backgroundColor); cancelAnimation(borderColor); };
  }, [background, border, backgroundColor, borderColor]);
  return useAnimatedStyle(() => ({ backgroundColor: backgroundColor.value, borderColor: borderColor.value }));
}

export function StateSurface({ background, border = '#00000000', style, ...props }: ViewProps & { background: string; border?: string }) {
  const colors = useStateColors(background, border);
  return <Animated.View {...props} style={[style, colors]} />;
}

export function SelectionPressable({ background, border = '#00000000', style, ...props }: PressableProps & { background: string; border?: string }) {
  const colors = useStateColors(background, border);
  return <MotionPressable {...props} style={style} animatedStyle={colors} />;
}

/** Commit the real value immediately; gently settle its opacity, never count through prices. */
export function ValueText({ children, style, ...props }: TextProps & { children: string | number | undefined }) {
  const previous = useRef(children), opacity = useSharedValue(1);
  const motion = useAnimatedStyle(() => ({ opacity: opacity.value }));
  useLayoutEffect(() => {
    if (previous.current === children) return;
    previous.current = children;
    opacity.value = 0.72;
    opacity.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.cubic) });
  }, [children, opacity]);
  useEffect(() => () => cancelAnimation(opacity), [opacity]);
  return <Animated.View style={motion}><Text {...props} style={[{ fontVariant: ['tabular-nums'] }, style]}>{children}</Text></Animated.View>;
}
