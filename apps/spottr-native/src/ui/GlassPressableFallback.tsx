import React, { forwardRef } from 'react';
import type { Pressable, PressableProps, StyleProp, View as ViewInstance, ViewStyle } from 'react-native';
import { MotionPressable } from './MotionPressable';

export type GlassPressableProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Layout refinements for the native material; the web/Android design stays intact. */
  glassStyle?: StyleProp<ViewStyle>;
  /** Preserve each existing control's press feedback on unsupported platforms. */
  fallback?: typeof Pressable | typeof MotionPressable;
};

export const GlassPressableFallback = forwardRef<ViewInstance, GlassPressableProps>(
  function GlassPressableFallback({ glassStyle: _glassStyle, fallback: Control = MotionPressable, ...props }, ref) {
    return <Control ref={ref} {...props} />;
  },
);
