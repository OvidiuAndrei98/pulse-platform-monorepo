"use client";

import { useEffect, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";

const TicketBrightness = registerPlugin<{
  acquire(options: { id: string }): Promise<{ active: boolean }>;
  release(options: { id: string }): Promise<void>;
}>("TicketBrightness");

let sequence = 0;
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation);
  queue = next.catch(() => undefined);
  return next;
}

export function useTicketBrightness(open: boolean) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    setActive(false);
    if (!open || !Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("TicketBrightness")) return;
    const id = `ticket-${Date.now()}-${++sequence}`;
    let mounted = true;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      // Ordered after acquire, even when Back happens before the bridge replies.
      void serialize(() => TicketBrightness.release({ id })).catch(() => undefined);
    };
    void serialize(() => TicketBrightness.acquire({ id }))
      .then(result => { if (mounted && !released) setActive(result.active); })
      .catch(() => { if (mounted) setActive(false); });
    window.addEventListener("pagehide", release);
    return () => {
      mounted = false;
      window.removeEventListener("pagehide", release);
      release();
    };
  }, [open]);
  return open && active;
}
