import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { EventImage } from './common';

type Frame = { uri?: string; key: number };

/** Keep the previous artwork painted until the new image has loaded and faded in. */
export function PromotionArtwork({ uri }: { uri?: string }) {
  const [frames, setFrames] = useState<Frame[]>([{ uri, key: 0 }]);
  const newest = frames[frames.length - 1]!;
  if (newest.uri !== uri) setFrames([...frames, { uri, key: newest.key + 1 }]);
  const settled = useCallback((key: number) => {
    setFrames(current => current.filter(frame => frame.key >= key));
  }, []);
  return (
    <View style={StyleSheet.absoluteFill}>
      {frames.map(frame => <ArtworkLayer key={frame.key} frame={frame} current={frame.key === newest.key} onSettled={settled} />)}
    </View>
  );
}

function ArtworkLayer({ frame, current, onSettled }: { frame: Frame; current: boolean; onSettled: (key: number) => void }) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(frame.key === 0 ? 1 : 0);
  const scale = useSharedValue(frame.key === 0 || reduceMotion ? 1 : 1.025);
  const ready = useRef(false);
  const layerStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  useEffect(() => () => { cancelAnimation(opacity); cancelAnimation(scale); }, [opacity, scale]);
  return (
    <Animated.View testID="promotion-hero-artwork" style={[StyleSheet.absoluteFill, layerStyle]}>
      <EventImage uri={frame.uri} fadeIn={false} style={StyleSheet.absoluteFill} onLoad={() => {
        if (ready.current || !current) return;
        ready.current = true;
        const key = frame.key;
        const config = { duration: reduceMotion || key === 0 ? 0 : 450, easing: Easing.out(Easing.cubic) };
        opacity.value = withTiming(1, config, finished => { if (finished) runOnJS(onSettled)(key); });
        scale.value = withTiming(1, config);
      }} />
    </Animated.View>
  );
}
