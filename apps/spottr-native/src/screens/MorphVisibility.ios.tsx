import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import NativeMaskedView from '@react-native-masked-view/masked-view';
import Animated from 'react-native-reanimated';
import type { MorphVisibilityProps } from './MorphVisibility';

// The library's declaration still extends NativeMethods, removed in RN 0.88.
const MaskedView = NativeMaskedView as unknown as React.ComponentType<ViewProps & { maskElement: React.ReactElement }>;

/** Fade the compositing mask, never GlassView or its UIView ancestors. The
 * material stays mounted at alpha=1, even when this independent layer is hidden. */
export function MorphVisibility({ opacityStyle, children, ...props }: MorphVisibilityProps) {
  return <View {...props}>
    <MaskedView style={s.compositor} maskElement={
      <Animated.View pointerEvents="none" style={[s.mask, opacityStyle]}/>
    }><View style={s.content}>{children}</View></MaskedView>
  </View>;
}
const s = StyleSheet.create({
  mask: { flex: 1, backgroundColor: 'black' },
  // Preserve the resting controls' native press halo outside their 44px bounds.
  compositor: { position: 'absolute', left: -8, right: -8, top: -8, bottom: -8 },
  content: { position: 'absolute', left: 8, right: 8, top: 8, bottom: 8 },
});
