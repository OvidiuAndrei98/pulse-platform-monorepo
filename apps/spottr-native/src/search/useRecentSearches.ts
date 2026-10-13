import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseRecentSearches, rememberSearch } from './recentSearches';

// Serialize reads and writes across screen instances (including a fast back/reopen).
let storageQueue: Promise<unknown> = Promise.resolve();
export function useRecentSearches(owner: string, enabled: boolean) {
  const key = 'spottr:recent-searches:v1:' + owner;
  const [snapshot, setSnapshot] = useState({ key: '', items: [] as string[] });
  const current = useRef(key); current.current = key;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    if (enabled) {
      storageQueue = storageQueue.catch(() => {}).then(async () => {
        const items = parseRecentSearches(await AsyncStorage.getItem(key));
        if (mounted.current && current.current === key) setSnapshot({ key, items });
      }).catch(() => {});
    }
    return () => { mounted.current = false; };
  }, [key, enabled]);
  const change = (update: (items: string[]) => string[]) => {
    if (!enabled) return;
    storageQueue = storageQueue.catch(() => {}).then(async () => {
      const items = update(parseRecentSearches(await AsyncStorage.getItem(key)));
      if (mounted.current && current.current === key) setSnapshot({ key, items });
      await AsyncStorage.setItem(key, JSON.stringify(items));
    }).catch(() => {});
  };
  return {
    items: enabled && snapshot.key === key ? snapshot.items : [],
    remember: (value: string) => change(items => rememberSearch(items, value)),
    remove: (value: string) => change(items => items.filter(item => item !== value)),
    clear: () => change(() => []),
  };
}
