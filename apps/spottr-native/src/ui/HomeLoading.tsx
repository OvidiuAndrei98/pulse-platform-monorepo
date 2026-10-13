import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { usePreferences } from '../PreferencesProvider';

export function HomeLoading({ hero = false }: { hero?: boolean }) {
  const { copy } = usePreferences(), reduced = useReducedMotion(), focused = useIsFocused();
  const opacity = useSharedValue(0.65);
  useEffect(() => {
    opacity.value = reduced || !focused ? 0.8 : withRepeat(withTiming(1, { duration: 850 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity, reduced, focused]);
  const motion = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View testID={hero ? 'home-loading-hero' : 'home-loading-rails'} pointerEvents="none"
    accessible accessibilityLabel={copy('common.loading')} accessibilityState={{ busy: true }}
    style={[hero ? s.hero : s.rails, motion]}>
    {hero ? <><View style={[s.line, { position: 'absolute', bottom: 56, left: 20, width: '58%', height: 24 }]} /><View style={[s.line, { position: 'absolute', bottom: 24, left: 20, width: '38%' }]} /></> : [0, 1].map(rail => <View key={rail} style={{ marginTop: 16 }}>
      <View style={[s.line, { width: 100, height: 16, marginLeft: 20, marginVertical: 8 }]} />
      <View style={{ flexDirection: 'row', gap: 16, paddingHorizontal: 20, paddingVertical: 8 }}>
        {[0, 1, 2].map(card => <View key={card} style={s.card}>
          <View style={s.image} /><View style={{ padding: 4, marginTop: 8, gap: 10 }}>
            <View style={[s.line, { width: '70%', height: 16 }]} />
            <View style={[s.line, { width: 56, height: 24, borderRadius: 99 }]} />
            <View style={[s.line, { width: '60%' }]} />
          </View>
        </View>)}
      </View>
    </View>)}
  </Animated.View>;
}
const s = StyleSheet.create({
  hero: { marginTop: 24, marginHorizontal: 20, aspectRatio: 4 / 3, borderRadius: 26, backgroundColor: '#101014', overflow: 'hidden' },
  rails: { overflow: 'hidden' },
  card: { width: 220, padding: 8, borderRadius: 26, backgroundColor: '#101012' },
  image: { aspectRatio: 4 / 3, borderRadius: 18, backgroundColor: '#1b1b20' },
  line: { height: 12, borderRadius: 6, backgroundColor: '#222227' },
});
