import { haptic } from "./haptics";
import { useCallback, useEffect, useRef, useState } from "react";

export const REFRESH_LIGHT_FADE_MS = 220;
const MIN_LIGHT_MS = 600;

/** Finish the request, extinguish the light, then let the scroll view retract. */
export function useRefreshFeedback(
  refreshing: boolean,
  onRefresh?: () => void | Promise<unknown>,
) {
  const input = useRef({ refreshing, onRefresh });
  input.current = { refreshing, onRefresh };
  const locked = useRef(false);
  const mounted = useRef(false);
  const started = useRef(0);
  const [phase, setPhase] = useState<"idle" | "loading" | "fading">("idle");
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(() => {
    const request = input.current.onRefresh;
    if (locked.current || input.current.refreshing || !request) return;
    locked.current = true;
    haptic("refresh");
    started.current = Date.now();
    setSettled(false);
    setPhase("loading");
    // Request errors and cached data belong to the caller, not this decoration.
    Promise.resolve()
      .then(request)
      .catch(() => undefined)
      .finally(() => {
        if (mounted.current) setSettled(true);
      });
  }, []);

  useEffect(() => {
    if (refreshing && phase === "idle") {
      locked.current = true;
      started.current = Date.now();
      setSettled(true);
      setPhase("loading");
      return;
    }
    if (phase === "loading" && settled && !refreshing) {
      const timer = setTimeout(
        () => setPhase("fading"),
        Math.max(0, MIN_LIGHT_MS - (Date.now() - started.current)),
      );
      return () => clearTimeout(timer);
    }
    if (phase === "fading" && !refreshing) {
      const timer = setTimeout(() => {
        locked.current = false;
        setPhase("idle");
      }, REFRESH_LIGHT_FADE_MS);
      return () => clearTimeout(timer);
    }
  }, [phase, settled, refreshing]);

  return {
    run,
    locked,
    busy: refreshing || phase === "loading",
    holding: refreshing || phase !== "idle",
  };
}
