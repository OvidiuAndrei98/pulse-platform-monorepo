import React from 'react';
import { type ViewProps } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';

export type MorphVisibilityProps = ViewProps & { opacityStyle: AnimatedStyle<{ opacity: number }> };
export function MorphVisibility({ opacityStyle, style, ...props }: MorphVisibilityProps) {
  return <Animated.View {...props} style={[style, opacityStyle]}/>;
}
