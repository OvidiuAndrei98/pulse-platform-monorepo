import React from 'react';
import { View, type ViewProps } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { glassButtonGroupSpacing, glassButtonGroupStyle } from './glassButtonStyles';

// Keep JS refreshes safe on binaries without ExpoGlassEffect and older iOS.
const glass: typeof import('expo-glass-effect') | null =
  requireOptionalNativeModule('ExpoGlassEffect') ? require('expo-glass-effect') : null;
const NativeGlassContainer = glass?.isLiquidGlassAvailable() && glass.isGlassEffectAPIAvailable()
  ? glass.GlassContainer : null;

export function GlassButtonGroup({ style, ...props }: ViewProps) {
  if (!NativeGlassContainer) return <View {...props} pointerEvents="box-none" accessible={false}
    style={[glassButtonGroupStyle, style]} />;
  // One container renders both descendant GlassViews together. Their existing
  // isInteractive touch response supplies the expansion and liquid bridge;
  // do not add an overlay, another scale or a parent opacity animation.
  return <NativeGlassContainer {...props} spacing={glassButtonGroupSpacing}
    pointerEvents="box-none" accessible={false} style={[glassButtonGroupStyle, style]} />;
}
