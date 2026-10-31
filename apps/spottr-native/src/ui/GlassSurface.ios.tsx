import React, { forwardRef } from 'react';
import { StyleSheet, View, type ViewInstance } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { liquidGlassAppearance } from './liquidGlassAppearance';
import type { GlassSurfaceProps } from './glassSurfaceTypes';

const glass: typeof import('expo-glass-effect') | null =
  requireOptionalNativeModule('ExpoGlassEffect') ? require('expo-glass-effect') : null;
// Expo's ComponentRef<typeof View> still resolves to never with RN 0.88's
// functional View declaration. The native view forwards a ViewInstance at runtime.
type NativeGlassSurface = React.ComponentType<
  Omit<React.ComponentProps<typeof import('expo-glass-effect').GlassView>, 'ref'> & React.RefAttributes<ViewInstance>
>;
const NativeGlassView = glass?.isLiquidGlassAvailable() && glass.isGlassEffectAPIAvailable()
  ? glass.GlassView as NativeGlassSurface : null;

/** One interactive material around multiple controls; retain the capsule's layout. */
export const GlassSurface = forwardRef<ViewInstance, GlassSurfaceProps>(function GlassSurface({ style, tintColor, interactive = true, ...props }, ref) {
  if (!NativeGlassView) return <View {...props} ref={ref} style={style} />;
  return <NativeGlassView {...props} ref={ref} style={[style, s.glass]}
    {...liquidGlassAppearance} tintColor={tintColor ?? liquidGlassAppearance.tintColor} isInteractive={interactive} />;
});

const s = StyleSheet.create({
  glass: {
    backgroundColor: 'transparent', borderColor: 'transparent',
    boxShadow: 'none', shadowOpacity: 0, elevation: 0,
    overflow: 'visible', opacity: 1,
  },
});
