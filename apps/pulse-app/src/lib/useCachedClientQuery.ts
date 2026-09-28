"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { readClientQuery, refreshClientQuery, subscribeClientQuery, updateClientQuery } from "./clientQueryCache";

// Only opt in display data. Checkout/payment state must always be checked live.
// Cache keys must include the account and all parameters that affect the result.
export function useCachedClientQuery<T>(key: string | null, load: () => Promise<T>, initial: T) {
  const loader = useRef(load);
  loader.current = load;
  const subscribe = useCallback((listener: () => void) => key ? subscribeClientQuery(key, listener) : () => {}, [key]);
  const snapshot = useCallback(() => key ? readClientQuery<T>(key) : undefined, [key]);
  const state = useSyncExternalStore(subscribe, snapshot, () => undefined);
  const retry = useCallback(() => {
    if (key) void refreshClientQuery(key, loader.current);
  }, [key]);
  useEffect(retry, [retry]);
  const setData = useCallback((update: (data: T) => T) => {
    if (key) updateClientQuery(key, update);
  }, [key]);
  return {
    data: state?.hasData ? state.data as T : initial,
    pending: key !== null && !state?.hasData && !state?.error,
    refreshing: Boolean(state?.refreshing),
    error: state?.hasData ? null : state?.error,
    refreshError: state?.hasData ? state.error : null,
    retry,
    setData,
  };
}
