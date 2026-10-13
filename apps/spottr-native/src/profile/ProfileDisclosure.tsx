import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

export const PROFILE_DISCLOSURE_MOTION = { duration: 280, easing: Easing.out(Easing.cubic) };

/** Measure natural content height; keep it mounted until the closing animation ends. */
export function ProfileDisclosure({ expanded, children, testID }: {
  expanded: boolean;
  children: React.ReactNode;
  testID: string;
}) {
  const [mounted, setMounted] = useState(expanded);
  const [contentHeight, setContentHeight] = useState(0);
  const open = useRef(expanded);
  open.current = expanded;
  const height = useSharedValue(0), opacity = useSharedValue(0);
  const finishClose = useCallback(() => {
    // A previous close callback must not remove content reopened by a quick tap.
    if (!open.current) setMounted(false);
  }, []);
  useEffect(() => {
    if (expanded) setMounted(true);
    height.value = withTiming(expanded ? contentHeight : 0, PROFILE_DISCLOSURE_MOTION, finished => {
      if (finished && !expanded) runOnJS(finishClose)();
    });
    opacity.value = withTiming(expanded ? 1 : 0, PROFILE_DISCLOSURE_MOTION);
    return () => { cancelAnimation(height); cancelAnimation(opacity); };
  }, [expanded, contentHeight, height, opacity, finishClose]);
  const motion = useAnimatedStyle(() => ({ height: height.value, opacity: opacity.value }));
  return (
    <Animated.View
      testID={testID}
      pointerEvents={expanded ? 'auto' : 'none'}
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
      aria-hidden={!expanded}
      style={[styles.clip, motion]}
    >
      {mounted && <View style={styles.content} onLayout={event => setContentHeight(Math.ceil(event.nativeEvent.layout.height))}>
        {children}
      </View>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  content: { position: 'absolute', top: 0, left: 0, right: 0 },
});
