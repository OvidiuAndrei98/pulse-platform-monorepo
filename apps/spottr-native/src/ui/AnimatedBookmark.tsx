import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Bookmark } from 'lucide-react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { colors } from './theme';

export function AnimatedBookmark({ selected, size = 20, color = '#a1a1aa' }: { selected: boolean; size?: number; color?: string }) {
  const previous = useRef(selected);
  const fill = useSharedValue(selected ? 1 : 0);
  const scale = useSharedValue(1);
  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.value }));
  const sizeStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  useEffect(() => {
    if (previous.current === selected) return;
    previous.current = selected;
    fill.value = withTiming(selected ? 1 : 0, { duration: 160 });
    scale.value = selected
      ? withSequence(withTiming(1.12, { duration: 100 }), withTiming(1, { duration: 180 }))
      : withTiming(1, { duration: 160 });
  }, [selected, fill, scale]);
  useEffect(() => () => { cancelAnimation(fill); cancelAnimation(scale); }, [fill, scale]);
  return <Animated.View pointerEvents="none" testID="bookmark-motion" style={[{ width: size, height: size }, sizeStyle]}>
    <View style={StyleSheet.absoluteFill}><Bookmark size={size} color={color} /></View>
    <Animated.View testID="bookmark-fill" style={[StyleSheet.absoluteFill, fillStyle]}><Bookmark size={size} color={colors.accent} fill={colors.accent} /></Animated.View>
  </Animated.View>;
}
