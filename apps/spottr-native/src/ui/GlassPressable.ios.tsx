import React, { forwardRef } from 'react';
import { Pressable, StyleSheet, type ViewInstance } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { GlassPressableFallback, type GlassPressableProps } from './GlassPressableFallback';
import { glassButtonStyles } from './glassButtonStyles';
import { liquidGlassAppearance } from './liquidGlassAppearance';

// Older installed development builds may receive this JS before Pods are rebuilt.
const glass: typeof import('expo-glass-effect') | null =
  requireOptionalNativeModule('ExpoGlassEffect') ? require('expo-glass-effect') : null;
const NativeGlassView = glass?.isLiquidGlassAvailable() && glass.isGlassEffectAPIAvailable()
  ? glass.GlassView : null;

export const GlassPressable = forwardRef<ViewInstance, GlassPressableProps>(function GlassPressable(
  { style, glassStyle, nativePressEffect = true, disabled, accessibilityState, fallback, ...props }, ref,
) {
  if (!NativeGlassView) return <GlassPressableFallback {...props} ref={ref} style={style} fallback={fallback}
    disabled={disabled} accessibilityState={accessibilityState} />;
  const styles = glassButtonStyles(StyleSheet.flatten([style, glassStyle]) ?? {}, Boolean(disabled));
  return <NativeGlassView style={styles.surface} {...liquidGlassAppearance}
    isInteractive={nativePressEffect} pointerEvents={disabled ? 'none' : 'auto'}>
    {/* UIKit normally owns pressing; a shared morph may own the deformation
        instead. Keep the material opaque in both cases. */}
    <Pressable {...props} ref={ref} disabled={disabled}
      accessibilityRole={props.accessibilityRole ?? 'button'}
      accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled) }}
      style={styles.control} />
  </NativeGlassView>;
});
