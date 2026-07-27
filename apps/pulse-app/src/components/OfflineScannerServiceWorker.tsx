"use client";

import { useEffect } from "react";

export function OfflineScannerServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/offline-scanner-sw.js", { scope: "/" });
  }, []);

  return null;
}
