import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { liquidGlassAppearance } from './liquidGlassAppearance';

const glass: typeof import('expo-glass-effect') | null =
  requireOptionalNativeModule('ExpoGlassEffect') ? require('expo-glass-effect') : null;
const NativeGlassView = glass?.isLiquidGlassAvailable() && glass.isGlassEffectAPIAvailable()
  ? glass.GlassView : null;

/** One interactive material around multiple controls; retain the capsule's layout. */
export function GlassSurface({ style, ...props }: ViewProps) {
  if (!NativeGlassView) return <View {...props} style={style} />;
  return <NativeGlassView {...props} style={[style, s.glass]}
    {...liquidGlassAppearance} isInteractive />;
}

const s = StyleSheet.create({
  glass: {
    backgroundColor: 'transparent', borderColor: 'transparent',
    boxShadow: 'none', shadowOpacity: 0, elevation: 0,
    overflow: 'visible', opacity: 1,
  },
});
