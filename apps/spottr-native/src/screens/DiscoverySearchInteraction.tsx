import React, { useLayoutEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View, type FlatList, type ScrollViewInstance } from 'react-native';
import type { Event } from '../data/events';

export function DiscoverySearchInteraction({ activityRef, gestureEndRef, listRef }: {
  activityRef: React.RefObject<((active: boolean) => void) | null>;
  gestureEndRef: React.RefObject<(() => void) | null>;
  listRef: React.RefObject<FlatList<Event> | null>;
}) {
  const [active, setActive] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  useLayoutEffect(() => {
    activityRef.current = next => {
      setActive(next);
      // Lock only the native scroll view. Re-rendering the entire event feed
      // during the morph stalls its first frames, especially with images.
      listRef.current?.getNativeScrollRef()?.setNativeProps({ scrollEnabled: !next });
      if (!next) scroll.current?.scrollTo({ y: 0, animated: false });
    };
    return () => { activityRef.current = null; };
  }, [activityRef, listRef]);
  if (Platform.OS === 'web') return null;
  // Keep the recognizer mounted before Search opens; its native view must not
  // be created in the middle of the expanding glass animation.
  return <ScrollView ref={scroll} testID="discovery-keyboard-gesture"
    style={[StyleSheet.absoluteFill, { zIndex: 5 }]} pointerEvents={active ? 'auto' : 'none'}
    scrollEnabled={active} contentContainerStyle={{ flexGrow: 1 }} alwaysBounceVertical
    keyboardDismissMode="interactive" keyboardShouldPersistTaps="never"
    onScrollEndDrag={() => gestureEndRef.current?.()}
    showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="never" scrollsToTop={false}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <View style={{ flex: 1 }} />
  </ScrollView>;
}
