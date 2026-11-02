import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { EventFeedStore } from '@packages/app-core/feed/model';
import { accountApi, useAuth } from '../auth/AuthProvider';

export function useEventFeed() {
  const auth = useAuth(), focused = useIsFocused(), actor = auth.user?.id, token = auth.controller.getToken();
  const store = useMemo(() => new EventFeedStore((path, method, signal) => accountApi(path, {method, signal, token: token ?? null}),
    () => auth.controller.getToken() === token && auth.controller.getSnapshot().user?.id === actor), [actor, token, auth.controller]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { store.activate(); return () => store.dispose(); }, [store]);
  useEffect(() => { if (auth.ready && focused && state.pending) void store.load(); }, [auth.ready, focused, state.pending, store]);
  return {...state, store, actor, ready: auth.ready};
}
