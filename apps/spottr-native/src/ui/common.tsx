import { Text } from './Text';
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type ViewStyle, type StyleProp, type NativeScrollEvent, type NativeSyntheticEvent, Alert, Platform, Linking } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { MotionPressable as Pressable } from './MotionPressable';
import { GlassPressable } from './GlassPressable';
import { Image } from 'expo-image';
import { openBrowserAsync } from 'expo-web-browser';
import { usePreferences } from '../PreferencesProvider';
import { colors } from './theme';
import { httpUrl } from '../data/events';

export function webListScrollProps(loadMore: () => void, threshold = 0.6) {
  if (Platform.OS !== 'web') return {};
  // RN Web can update its rendered-row range after its final scroll event when
  // a cached list becomes visible again. Check real scroll metrics as well.
  return { scrollEventThrottle: 16, onScroll: ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentSize, layoutMeasurement, contentOffset } = nativeEvent;
    if (layoutMeasurement.height > 0 && contentSize.height > 0 && contentSize.height - layoutMeasurement.height - contentOffset.y <= layoutMeasurement.height * threshold) loadMore();
  } };
}

const AnimatedImage = Animated.createAnimatedComponent(Image);
export function EventImage({ uri, style, onLoad, fadeIn = true }: { uri?: string; style?: React.ComponentProps<typeof Image>['style']; onLoad?: () => void; fadeIn?: boolean }) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const sourceUri = uri && uri !== failedUri ? uri : undefined;
  const reduceMotion = useReducedMotion(), animate = fadeIn && !reduceMotion;
  const opacity = useSharedValue(animate ? 0 : 1);
  const motion = useAnimatedStyle(() => ({ opacity: opacity.value }));
  useLayoutEffect(() => { opacity.value = animate ? 0 : 1; }, [sourceUri, animate, opacity]);
  useEffect(() => () => cancelAnimation(opacity), [opacity]);
  return <AnimatedImage testID="event-artwork" source={sourceUri ? { uri: sourceUri } : require('../../assets/party-event.webp')}
    style={[style, motion]} contentFit="cover" cachePolicy="memory-disk" draggable={false} recyclingKey={sourceUri || 'fallback'}
    onLoad={() => { opacity.value = withTiming(1, { duration: animate ? 220 : 0 }); onLoad?.(); }}
    onError={() => setFailedUri(uri ?? null)} />;
}

export function Button({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[styles.button, secondary && styles.secondary, { opacity: disabled ? 0.4 : 1 }]}>
    <Text style={styles.buttonText}>{title}</Text>
  </Pressable>;
}
export function IconButton({ label, onPress, children, disabled }: React.PropsWithChildren<{ label: string; onPress: () => void; disabled?: boolean }>) {
  return <GlassPressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={styles.iconButton}>{children}</GlassPressable>;
}
export function Feedback({ title, detail, retry, compact = false }: { title: string; detail?: string; retry?: () => void; compact?: boolean }) {
  const { t } = usePreferences();
  return <View accessibilityLiveRegion="polite" style={[styles.feedback, compact && { paddingVertical: 16 }]}>
    <Text style={[styles.feedbackTitle, compact && { fontSize: 14 }]}>{title}</Text>
    {detail ? <Text style={styles.muted}>{detail}</Text> : null}
    {retry ? <Button title={t('retry')} secondary onPress={retry} /> : null}
  </View>;
}
export function Loading() {
  const { t } = usePreferences();
  return <View style={styles.feedback}><ActivityIndicator color={colors.accent} accessibilityLabel={t('loading')} /><Text style={styles.muted}>{t('loading')}</Text></View>;
}
export function useOpenLink() {
  const { t } = usePreferences();
  const [error, setError] = useState(false);
  return { error, clearError: () => setError(false), open: async (url: string) => {
    setError(false);
    if (!httpUrl(url)) { setError(true); return; }
    try {
      if (Platform.OS === 'web') await Linking.openURL(url);
      else await openBrowserAsync(url, { toolbarColor: colors.bg, controlsColor: colors.accent });
    } catch {
      setError(true);
      if (Platform.OS !== 'web') Alert.alert(t('errorTitle'), t('openError'));
    }
  } };
}
export const styles = StyleSheet.create({
  text: { color: colors.text, fontSize: 16 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  title: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.7 },
  subtitle: { color: colors.text, fontSize: 21, fontWeight: '700', letterSpacing: -0.4 },
  button: { minHeight: 52, borderRadius: 28, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  secondary: { backgroundColor: colors.raised }, buttonText: { color: colors.text, fontWeight: '700', fontSize: 15, textAlign: 'center' },
  iconButton: { width: 44, height: 44, borderRadius: 24, backgroundColor: colors.raised, justifyContent: 'center', alignItems: 'center' },
  feedback: { padding: 24, paddingVertical: 38, alignItems: 'center', gap: 14 }, feedbackTitle: { color: colors.text, fontSize: 19, fontWeight: '700', textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
