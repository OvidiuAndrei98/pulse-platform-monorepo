"use client";

import { useEffect, useRef } from "react";
import { isClientRoute, LAYER, locationKey } from "./state";

// One history entry per open surface. Nested surfaces unwind from the top.
// Returning false consumes Back (checkout step/busy operation) without closing.
export function useBackLayer(open: boolean, onBack: () => boolean | void) {
  const callback = useRef(onBack);
  callback.current = onBack;
  useEffect(() => {
    if (!open || !isClientRoute(location.pathname)) return;
    let dispose = () => {};
    // Defer registration so React Strict Mode's probe mount cannot add entries.
    const timer = window.setTimeout(() => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const url = locationKey();
    const previous: string[] = history.state?.[LAYER] ?? [];
    const layers = [...previous, id];
    history.pushState({ ...history.state, [LAYER]: layers }, "", location.href);
    let popped = false;
    let leaving = false;
    const onNavigate = () => { leaving = true; };
    const onLink = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) leaving = true;
    };
    const onPop = () => {
      if (leaving) return;
      if ((history.state?.[LAYER] ?? []).includes(id)) return;
      popped = true;
      if (locationKey() === url && callback.current() === false) {
        popped = false;
        history.pushState({ ...history.state, [LAYER]: layers }, "", location.href);
      } else if (locationKey() !== url) callback.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || history.state?.[LAYER]?.at(-1) !== id) return;
      event.preventDefault(); event.stopImmediatePropagation();
      history.back();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("click", onLink, true);
    window.addEventListener("spottr:layer-navigation", onNavigate);
    dispose = () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("click", onLink, true);
      window.removeEventListener("spottr:layer-navigation", onNavigate);
      if (!popped && !leaving && locationKey() === url && history.state?.[LAYER]?.at(-1) === id) history.back();
    };
    }, 0);
    return () => { window.clearTimeout(timer); dispose(); };
  }, [open]);
}
