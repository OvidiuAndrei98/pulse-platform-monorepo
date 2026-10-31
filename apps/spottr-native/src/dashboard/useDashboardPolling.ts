import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { focusManager } from '@tanstack/react-query';

/** Poll only the visible workspace without subscribing its UI to focus state. */
export function useDashboardPolling(refetch: (options: { cancelRefetch: boolean }) => Promise<unknown>, enabled: boolean, interval?: number) {
  useFocusEffect(useCallback(() => {
    if (!enabled || interval === undefined || !Number.isFinite(interval) || interval <= 0) return;
    const timer = setInterval(() => {
      if (focusManager.isFocused()) void refetch({ cancelRefetch: false });
    }, interval);
    return () => clearInterval(timer);
  }, [enabled, interval, refetch]));
}
