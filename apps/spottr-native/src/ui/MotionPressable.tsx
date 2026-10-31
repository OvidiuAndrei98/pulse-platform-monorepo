import React, { forwardRef, useEffect, useState } from 'react';
import { Pressable, type PressableProps, type ViewInstance } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import {useReducedMotionPreference} from './useReducedMotionPreference';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
type MotionPressableProps = PressableProps & {
  animatedStyle?: React.ComponentProps<typeof AnimatedPressable>['style'];
  /** A native glass parent already owns the press deformation. */
  static?: boolean;
};

export function usePressMotion(disabled = false) {
  const reduced=useReducedMotionPreference();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  useEffect(() => {
    if(disabled||reduced)scale.value=1;
    return () => cancelAnimation(scale);
  }, [disabled, reduced, scale]);
  return {
    style,
    pressIn: () => { if (!disabled&&!reduced) scale.value = withTiming(0.98, { duration: 85, easing: Easing.out(Easing.cubic) }); },
    pressOut: () => { if(reduced)scale.value=1;else scale.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) }); },
  };
}

/** Feedback only: Pressable still owns taps, cancellation and navigation timing. */
export const MotionPressable = forwardRef<ViewInstance, MotionPressableProps>(function MotionPressable(
  { style, animatedStyle, disabled, static: staticPress = false, onPressIn, onPressOut, ...props }, ref,
) {
  const motion = usePressMotion(Boolean(disabled) || staticPress);
  const [pressed, setPressed] = useState(false);
  useEffect(() => { if (disabled) setPressed(false); }, [disabled]);
  return <AnimatedPressable {...props} ref={ref} disabled={disabled}
    style={[typeof style === 'function' ? style({ pressed: pressed && !disabled }) : style, animatedStyle, motion.style]}
    onPressIn={event => { setPressed(true); motion.pressIn(); onPressIn?.(event); }}
    onPressOut={event => { setPressed(false); motion.pressOut(); onPressOut?.(event); }} />;
});
