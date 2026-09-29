"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { TAB_TRANSITION, TAB_VISUAL_STATE, type TabTransition } from "@/lib/navigation/tabs";

// Animate only the committed content. Capturing the document with View
// Transitions pauses painting/input, including the persistent navbar.
export function TabPageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const surface = useRef<HTMLDivElement>(null);
  const requested = useRef<{ href: string; direction: number } | null>(null);
  const animation = useRef<Animation | null>(null);
  const currentPath = useRef(pathname);
  currentPath.current = pathname;

  useLayoutEffect(() => {
    const next = requested.current;
    if (!next || next.href !== pathname) return;
    requested.current = null;
    window.dispatchEvent(new Event("spottr:restore-scroll-now"));
    animation.current?.cancel();
    window.dispatchEvent(new CustomEvent(TAB_VISUAL_STATE, { detail: { href: next.href, phase: "ready" } }));
    if (!next.direction || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const element = surface.current;
    if (!element?.animate) return;
    // A visible directional entry on phones, bounded on wider screens.
    const distance = Math.min(64, Math.max(32, window.innerWidth * 0.12));
    // Individual translate doesn't turn fixed map controls into positioned
    // children after the animation: no fill mode or retained transform.
    const incoming = element.animate([
      { translate: (next.direction * distance) + "px 0", opacity: 0.96 },
      { translate: "0px 0", opacity: 1 },
    ], { duration: 260, easing: "cubic-bezier(.22,.8,.25,1)" });
    animation.current = incoming;
    void incoming.finished.catch(() => undefined).finally(() => {
      if (animation.current === incoming) animation.current = null;
    });
  }, [pathname]);

  useEffect(() => {
    const onTransition = (event: Event) => {
      event.preventDefault();
      const { href, direction, navigate } = (event as CustomEvent<TabTransition>).detail;
      // Let the visible page settle while a cold destination loads. Cancelling
      // here would snap it to its final position on a rapid second tap.
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
      animation.current?.cancel();
      requested.current = null;
    };
  }, []);

  return <div ref={surface} data-tab-page>{children}</div>;
}
