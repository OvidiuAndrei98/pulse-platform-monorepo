import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { Event } from '../data/events';
import { HeroCard } from './EventCard';
import { VisiblePromotion, trackPromotion } from './VisiblePromotion';

type Promotion = { campaignId: string; event: Event };

export function PromotionHero({ items, onOpen, refreshKey = 0, refreshing = false }: {
  items: Promotion[];
  onOpen: (event: Event) => void;
  refreshKey?: number;
  refreshing?: boolean;
}) {
  const [selected, setSelected] = useState<string>();
  const [interacting, setInteracting] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const focused = useIsFocused();
  const previousVisit = useRef({ focused, refreshKey });
  const swiped = useRef(false);
  // Retain the selected campaign across refresh/reordering; fall back if it ends.
  const index = Math.max(0, items.findIndex(item => item.campaignId === selected));
  const active = items[index];
  const go = useCallback((direction: number) => {
    if (items.length < 2) return;
    setSelected(current => {
      const position = Math.max(0, items.findIndex(item => item.campaignId === current));
      return items[(position + direction + items.length) % items.length]?.campaignId;
    });
  }, [items]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    const previous = previousVisit.current;
    previousVisit.current = { focused, refreshKey };
    // One advance per return or completed pull-to-refresh, never on mount or
    // ordinary data updates. A refresh completed while away waits for return.
    if (focused && (!previous.focused || previous.refreshKey !== refreshKey)) go(1);
  }, [focused, refreshKey, go]);
  useEffect(() => {
    if (items.length < 2 || refreshing || interacting || hovered || keyboardFocused || !focused || !foreground) return;
    const timer = setTimeout(() => go(1), 4500);
    return () => clearTimeout(timer);
  }, [active?.campaignId, items.length, refreshing, interacting, hovered, keyboardFocused, focused, foreground, go]);

  // Recognize a horizontal swipe, without translating the card. Vertical
  // gestures remain with Home's ScrollView and its pull-to-refresh control.
  const swipe = Gesture.Pan()
    .enabled(items.length > 1)
    .activeOffsetX([-18, 18])
    .failOffsetY([-12, 12])
    .runOnJS(true)
    .onBegin(() => setInteracting(true))
    .onStart(() => { swiped.current = true; })
    .onEnd(({ translationX }) => {
      if (Math.abs(translationX) >= 45) go(translationX < 0 ? 1 : -1);
    })
    .onFinalize(() => setInteracting(false));

  if (!active) return null;
  return (
    <VisiblePromotion campaignId={active.campaignId} style={{ marginTop: 24, marginHorizontal: 20 }}>
      <GestureDetector gesture={swipe} touchAction="pan-y">
        <Pressable
          testID="promotion-hero"
          accessibilityRole="button"
          accessibilityLabel={active.event.title}
          onPressIn={() => { swiped.current = false; setInteracting(true); }}
          onPressOut={() => setInteracting(false)}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          onFocus={() => setKeyboardFocused(true)}
          onBlur={() => setKeyboardFocused(false)}
          onPress={() => {
            if (swiped.current) return;
            trackPromotion(active.campaignId, 'click');
            onOpen(active.event);
          }}
        >
          <HeroCard event={active.event} />
        </Pressable>
      </GestureDetector>
    </VisiblePromotion>
  );
}
