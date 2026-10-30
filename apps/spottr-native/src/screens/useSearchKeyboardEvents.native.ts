import { useEffect, useLayoutEffect, useRef } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useGenericKeyboardHandler } from 'react-native-keyboard-controller';
import type { SearchKeyboardHandlers, SearchKeyboardVisibilityHandlers } from './useSearchKeyboardEvents';

export function useSearchKeyboardEvents(handlers: SearchKeyboardHandlers, visibility?: SearchKeyboardVisibilityHandlers) {
  // Do not change Android's window resize mode or supply web-only dependencies.
  useGenericKeyboardHandler(handlers);
  const latest = useRef(visibility);
  useLayoutEffect(() => { latest.current = visibility; }, [visibility]);
  useEffect(() => {
    const subscriptions = [
      Keyboard.addListener('keyboardDidShow', () => latest.current?.onDidShow()),
      Keyboard.addListener('keyboardDidHide', () => latest.current?.onDidHide()),
    ];
    if (Platform.OS === 'ios') subscriptions.push(Keyboard.addListener('keyboardWillHide', () => latest.current?.onWillHide()));
    return () => { subscriptions.forEach(subscription => subscription.remove()); };
  }, []);
}
