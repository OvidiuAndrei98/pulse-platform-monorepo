import type { ViewInstance } from 'react-native';
import React, { useEffect, useRef } from 'react';
import { AppState, Platform, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { randomUUID } from 'expo-crypto';
import { accountApi } from '../auth/AuthProvider';
let viewer: string | undefined;
const impressions = new Set<string>();
export function trackPromotion(campaignId: string | undefined, metric: 'impression' | 'click') {
  if (!campaignId || (metric === 'impression' && impressions.has(campaignId))) return;
  if (metric === 'impression') impressions.add(campaignId);
  viewer ??= randomUUID();
  void accountApi('/promotions/' + encodeURIComponent(campaignId) + '/track', { method: 'POST', token: null, body: { metric, viewerKey: viewer } }).catch(() => { if (metric === 'impression') impressions.delete(campaignId); });
}
export function VisiblePromotion({ campaignId, children, style }: React.PropsWithChildren<{ campaignId?: string; style?: StyleProp<ViewStyle> }>) {
  const ref = useRef<ViewInstance>(null), focused = useIsFocused(), viewport = useWindowDimensions();
  useEffect(() => {
    if (!campaignId || !focused || impressions.has(campaignId)) return;
    if (Platform.OS === 'web') {
      const element = ref.current as unknown as Element;
      if (!element) return;
      const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting && e.intersectionRatio >= .5) && document.visibilityState === 'visible') trackPromotion(campaignId, 'impression'); }, { threshold: .5 });
      observer.observe(element); return () => observer.disconnect();
    }
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      ref.current?.measureInWindow((x, y, width, height) => { if (width > 0 && height > 0 && x + width / 2 >= 0 && x + width / 2 <= viewport.width && y + height / 2 >= 0 && y + height / 2 <= viewport.height) trackPromotion(campaignId, 'impression'); });
    }, 600);
    return () => clearInterval(timer);
  }, [campaignId, focused, viewport.height, viewport.width]);
  return <View ref={ref} collapsable={false} style={style}>{children}</View>;
}
