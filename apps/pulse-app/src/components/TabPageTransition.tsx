"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { TAB_TRANSITION, TAB_VISUAL_STATE, type TabTransition } from "@/lib/navigation/tabs";

// Tabs swap content directly. Only the persistent navbar indicator animates;
// moving the entire page also moves fixed controls and feels like a reload.
export function TabPageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const requested = useRef<{ href: string; direction: number } | null>(null);
  const currentPath = useRef(pathname);
  currentPath.current = pathname;

  useLayoutEffect(() => {
    const next = requested.current;
    if (!next || next.href !== pathname) return;
    requested.current = null;
    window.dispatchEvent(new Event("spottr:restore-scroll-now"));
    window.dispatchEvent(new CustomEvent(TAB_VISUAL_STATE, { detail: { href: next.href, phase: "ready" } }));
  }, [pathname]);

  useEffect(() => {
    const onTransition = (event: Event) => {
      event.preventDefault();
      const { href, direction, navigate } = (event as CustomEvent<TabTransition>).detail;
      // Keep the current content visible while a cold destination loads.
      requested.current = { href, direction };
      window.dispatchEvent(new CustomEvent(TAB_VISUAL_STATE, { detail: { href, phase: "pending" } }));
      navigate();
      // Returning to the still-visible tab cancels a cold route immediately.
      if (href === currentPath.current) {
        requested.current = null;
        window.dispatchEvent(new CustomEvent(TAB_VISUAL_STATE, { detail: { href, phase: "ready" } }));
      }
    };
    window.addEventListener(TAB_TRANSITION, onTransition);
    return () => {
      window.removeEventListener(TAB_TRANSITION, onTransition);
      requested.current = null;
    };
  }, []);

  return <div data-tab-page>{children}</div>;
}
