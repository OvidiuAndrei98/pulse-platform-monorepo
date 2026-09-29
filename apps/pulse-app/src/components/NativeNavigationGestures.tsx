"use client";

import { useEffect } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { canGoBack, isClientRoute, LAYER } from "@/lib/navigation/state";
import { isMainTabRoot } from "@/lib/navigation/tabs";

const NavigationGestures = registerPlugin<{ setEnabled(options: { enabled: boolean }): Promise<void> }>("NavigationGestures");

export function NativeNavigationGestures() {
  useEffect(() => {
    // iOS owns the interactive gesture; Android uses its system Back handler.
    // Neither also runs a JS touchend navigation.
    if (Capacitor.getPlatform() !== "ios" || !Capacitor.isPluginAvailable("NavigationGestures")) return;
    let previous: boolean | undefined;
    const update = () => {
      const blocked = Boolean(history.state?.[LAYER]?.length)
        || new URLSearchParams(location.search).has("eventId")
        || Boolean(document.querySelector('[data-vaul-drawer], [role="dialog"][aria-modal="true"]'))
        || document.body.classList.contains("barcode-scanner-active");
      const enabled = isClientRoute(location.pathname)
        && !isMainTabRoot(location.pathname, location.search) && !blocked && canGoBack();
      if (enabled === previous) return;
      previous = enabled;
      void NavigationGestures.setEnabled({ enabled }).catch(() => { previous = undefined; });
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-modal", "role", "data-state"] });
    window.addEventListener("spottr:navigation", update);
    window.addEventListener("popstate", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("spottr:navigation", update);
      window.removeEventListener("popstate", update);
      void NavigationGestures.setEnabled({ enabled: false }).catch(() => undefined);
    };
  }, []);
  return null;
}
