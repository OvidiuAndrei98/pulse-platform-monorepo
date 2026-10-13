import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

// Claim the OS launch screen before React mounts. The JS cover uses the same asset.
void SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: false });

export function StartupCover({ ready }: { ready: boolean }) {
  const [visible, setVisible] = useState(true), [laidOut, setLaidOut] = useState(false), [imageReady, setImageReady] = useState(false);
  const reduced = useReducedMotion(), opacity = useSharedValue(1);
  const motion = useAnimatedStyle(() => ({ opacity: opacity.value }));
  useEffect(() => {
    if (!laidOut || !imageReady) return;
    // The identical React cover is painted now, so hiding the OS screen cannot flash black.
    void SplashScreen.hideAsync().catch(() => {});
  }, [laidOut, imageReady]);
  useEffect(() => {
    if (!ready || !laidOut || !imageReady) return;
    opacity.value = withTiming(0, { duration: reduced ? 0 : 220 }, finished => {
      if (finished) runOnJS(setVisible)(false);
    });
    return () => cancelAnimation(opacity);
  }, [ready, laidOut, imageReady, reduced, opacity]);
  if (!visible) return null;
  return <Animated.View testID="startup-cover" pointerEvents={ready ? 'none' : 'auto'}
    accessibilityLabel="SPOTTR" onLayout={() => setLaidOut(true)} style={[s.cover, motion]}>
    <Image source={require('../../assets/splash-logo.png')} contentFit="contain" style={{ width: 96, height: 96 }}
      onLoad={() => setImageReady(true)} onError={() => setImageReady(true)} />
  </Animated.View>;
}
const s = StyleSheet.create({ cover: { position: 'absolute', inset: 0, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', zIndex: 1000 } });
