"use client";
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { ApiClient } from '@packages/api-client/client';
import { EventFeedStore, type FeedRequest } from '@packages/app-core/feed/model';
import { useDataProvider } from '@/core/DataProviderContext';

export function useEventFeed() {
  const auth = useDataProvider(), actor = auth.user?.properties.id, token = auth.getToken(), current = useRef(auth);
  current.current = auth;
  const store = useMemo(() => {
    const request: FeedRequest = (path, method, signal) => {
      if (current.current.getToken() !== token || current.current.user?.properties.id !== actor) return Promise.reject(new Error('SESSION_ENDED'));
      if (method === 'GET') return ApiClient.instance.get('/event-feed', {params: {query: {page: Number(new URL(path, 'https://local.invalid').searchParams.get('page'))}}, signal, cache: 'no-store'});
      const options = {params: {path: {id: path.split('/')[2]}}, signal, cache: 'no-store' as const};
      return method === 'PUT' ? ApiClient.instance.put('/events/{id}/likes', options) : ApiClient.instance.delete('/events/{id}/likes', options);
    };
    return new EventFeedStore(request, () => current.current.getToken() === token && current.current.user?.properties.id === actor);
  }, [actor, token]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { store.activate(); if (!auth.loading) void store.load(); return () => store.dispose(); }, [store, auth.loading]);
  return {...state, store, actor, ready: !auth.loading};
}
