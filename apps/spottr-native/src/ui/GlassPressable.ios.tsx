import React, { forwardRef } from 'react';
import { Pressable, StyleSheet, type View } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { GlassPressableFallback, type GlassPressableProps } from './GlassPressableFallback';
import { glassButtonStyles } from './glassButtonStyles';

// Older installed development builds may receive this JS before Pods are rebuilt.
const glass: typeof import('expo-glass-effect') | null =
  requireOptionalNativeModule('ExpoGlassEffect') ? require('expo-glass-effect') : null;
const NativeGlassView = glass?.isLiquidGlassAvailable() && glass.isGlassEffectAPIAvailable()
  ? glass.GlassView : null;

export const GlassPressable = forwardRef<View, GlassPressableProps>(function GlassPressable(
  { style, glassStyle, disabled, accessibilityState, fallback, ...props }, ref,
) {
  if (!NativeGlassView) return <GlassPressableFallback {...props} ref={ref} style={style} fallback={fallback}
    disabled={disabled} accessibilityState={accessibilityState} />;
  const styles = glassButtonStyles(StyleSheet.flatten([style, glassStyle]) ?? {}, Boolean(disabled));
  return <NativeGlassView style={styles.surface} glassEffectStyle="regular" colorScheme="dark"
    isInteractive pointerEvents={disabled ? 'none' : 'auto'}>
    {/* UIKit owns the press effect. A second animated scale would fight it.
        Keep the material opaque; only dim its content for disabled controls. */}
    <Pressable {...props} ref={ref} disabled={disabled}
      accessibilityRole={props.accessibilityRole ?? 'button'}
      accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled) }}
      style={styles.control} />
  </NativeGlassView>;
});
