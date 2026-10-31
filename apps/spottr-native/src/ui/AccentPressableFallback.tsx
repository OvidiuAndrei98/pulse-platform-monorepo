import React, { forwardRef } from 'react';
import type { ColorValue, Pressable, PressableProps, ViewInstance } from 'react-native';
import { MotionPressable } from './MotionPressable';

export type AccentPressableProps = PressableProps & {
  fallback?: typeof Pressable | typeof MotionPressable;
  /** Explicit tint for an existing branded fill, such as Google's white button. */
  glassColor?: ColorValue;
};

export const AccentPressableFallback = forwardRef<ViewInstance, AccentPressableProps>(function AccentPressableFallback(
  { fallback: Control = MotionPressable, glassColor: _glassColor, ...props }, ref,
) {
  return <Control {...props} ref={ref}/>;
});
