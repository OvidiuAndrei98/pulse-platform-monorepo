"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// A key identifies the data, including the current account when applicable.
// Ignore late responses after retry, navigation, or an account change.
export function useClientQuery<T>(key: string | null, load: () => Promise<T>, initial: T, refreshIntervalMs = 0) {
  const loader = useRef(load);
  loader.current = load;
  const fallback = useRef(initial);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string | null; data: T; pending: boolean; error: unknown }>({
    key: null, data: initial, pending: Boolean(key), error: null,
  });
  useEffect(() => {
    if (key === null) return;
    let active = true;
    const request = loader.current;
    setState((old) => ({ key, data: old.key === key ? old.data : fallback.current, pending: true, error: null }));
    let busy = false;
    const fetchData = async (background = false) => {
      if (busy || !active) return;
      busy = true;
      try {
        const data = await request();
        if (active) setState({ key, data, pending: false, error: null });
      } catch (error: unknown) {
        // Keep the visible list during a failed background refresh. The next
        // interval can recover it without flashing a loading/error screen.
        if (active && !background) setState((old) => ({ ...old, pending: false, error }));
      } finally { busy = false; }
    };
    void fetchData();
    const refresh = () => { if (document.visibilityState === 'visible') void fetchData(true); };
    const timer = refreshIntervalMs > 0 ? setInterval(refresh, refreshIntervalMs) : undefined;
    if (timer) document.addEventListener('visibilitychange', refresh);
    return () => { active = false; clearInterval(timer); if (timer) document.removeEventListener('visibilitychange', refresh); };
  }, [key, attempt, refreshIntervalMs]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return {
    data: state.key === key ? state.data : fallback.current,
    pending: key !== null && (state.key !== key || state.pending),
    error: state.key === key ? state.error : null,
    retry,
  };
}
