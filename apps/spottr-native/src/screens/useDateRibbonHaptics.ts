import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

export function useDateRibbonHaptics(enabled: boolean) {
  const live = useRef(enabled), focused = useRef(false);
  live.current = enabled;
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; };
  }, []));
  return useCallback(() => {
    if (!live.current || !focused.current || AppState.currentState !== 'active') return;
    // One immediate native tick for the current visible selection. Replaying
    // skipped scroll samples would vibrate after the finger has already moved.
    try { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); } catch {}
  }, []);
}
