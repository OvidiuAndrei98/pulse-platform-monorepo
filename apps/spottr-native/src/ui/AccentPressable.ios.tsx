import React, { forwardRef } from 'react';
import { StyleSheet, type ViewInstance } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { AccentPressableFallback, type AccentPressableProps } from './AccentPressableFallback';
import { accentGlassButtonStyles, isAccentFill } from './accentGlassButtonStyles';
import { liquidGlassAppearance } from './liquidGlassAppearance';
import { MotionPressable } from './MotionPressable';

const glass: typeof import('expo-glass-effect') | null =
  requireOptionalNativeModule('ExpoGlassEffect') ? require('expo-glass-effect') : null;
const NativeGlassView = glass?.isLiquidGlassAvailable() && glass.isGlassEffectAPIAvailable() ? glass.GlassView : null;

export const AccentPressable = forwardRef<ViewInstance, AccentPressableProps>(function AccentPressable(
  { style, disabled = false, accessibilityState, fallback, onLayout, glassColor, ...props }, ref,
) {
  const flat = StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style) ?? {};
  if (!NativeGlassView) return <AccentPressableFallback {...props}
    ref={ref} style={style} disabled={disabled} accessibilityState={accessibilityState} fallback={fallback} onLayout={onLayout}/>;
  const accent = glassColor !== undefined || isAccentFill(flat.backgroundColor), styles = accentGlassButtonStyles(flat, disabled, accent);
  const Control = fallback ?? MotionPressable;
  const motionProps = Control === MotionPressable ? { static: accent } : {};
  return <NativeGlassView style={styles.surface} onLayout={onLayout} {...liquidGlassAppearance}
    glassEffectStyle={accent ? liquidGlassAppearance.glassEffectStyle : 'none'} tintColor={accent ? glassColor ?? flat.backgroundColor : undefined}
    isInteractive={accent} pointerEvents={disabled ? 'none' : 'auto'}>
    <Control {...props} {...motionProps} ref={ref} disabled={disabled}
      accessibilityRole={props.accessibilityRole ?? 'button'} accessibilityState={{ ...accessibilityState, disabled }}
      style={state => typeof style === 'function'
        ? accentGlassButtonStyles(StyleSheet.flatten(style(state)) ?? {}, disabled, accent).control : styles.control}/>
  </NativeGlassView>;
});
