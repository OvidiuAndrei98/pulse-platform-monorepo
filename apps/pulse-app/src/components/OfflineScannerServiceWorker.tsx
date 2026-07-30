"use client";

import { useEffect } from "react";

export function OfflineScannerServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(
          registrations
            .filter((registration) =>
              registration.active?.scriptURL.endsWith("/offline-scanner-sw.js"),
            )
            .map((registration) => registration.unregister()),
        ),
      );
      void caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("glow-offline-scanner-"))
            .map((key) => caches.delete(key)),
        ),
      );
      return;
    }

    void navigator.serviceWorker.register("/offline-scanner-sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  }, []);

  return null;
}
