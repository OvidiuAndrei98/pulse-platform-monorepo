import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { createReducedMotionStore } from './reducedMotionStore';

const preference = createReducedMotionStore({
  read: () => AccessibilityInfo.isReduceMotionEnabled(),
  listen: change => {
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', change);
    return () => subscription.remove();
  },
});

export function useReducedMotionPreference() {
  // Reanimated already has a synchronous snapshot of the system preference.
  // Starting at `true` briefly disabled animations on every normal launch.
  const initial = useReducedMotion();
  preference.initialize(initial);
  return useSyncExternalStore(preference.subscribe, preference.getSnapshot, preference.getSnapshot);
}
