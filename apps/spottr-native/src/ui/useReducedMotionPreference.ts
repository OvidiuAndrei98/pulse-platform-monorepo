import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

export function useReducedMotionPreference() {
  // Reanimated already has a synchronous snapshot of the system preference.
  // Starting at `true` briefly disabled animations on every normal launch.
  const initial = useReducedMotion();
  const [reduced, setReduced] = useState(initial);
  useEffect(() => {
    let alive = true, changed = false;
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      if (!alive) return;
      changed = true;
      setReduced(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (alive && !changed) setReduced(value);
    }).catch(() => {});
    return () => { alive = false; listener.remove(); };
  }, []);
  return reduced;
}
