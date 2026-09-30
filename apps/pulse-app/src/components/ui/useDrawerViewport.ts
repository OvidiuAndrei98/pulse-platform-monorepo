"use client";

import { useEffect, useState } from "react";

let lockCount = 0;
let unlockBody: (() => void) | undefined;
const mobileViewport = "(max-width: 767px), (hover: none) and (pointer: coarse)";

// Shared ownership prevents one nested drawer from unlocking another's page.
export function lockPage() {
  if (lockCount++ === 0) {
    const body = document.body;
    const keys = ["position", "top", "left", "right", "overflow"] as const;
    const saved = keys.map(key => [key, body.style.getPropertyValue(key), body.style.getPropertyPriority(key)]);
    const { scrollX, scrollY } = window;
    const path = location.pathname;
    const mobile = window.matchMedia(mobileViewport).matches;
    body.style.overflow = "hidden";
    if (mobile) {
      body.style.position = "fixed";
      body.style.top = `${-scrollY}px`;
      body.style.left = `${-scrollX}px`;
      body.style.right = "0";
    }
    unlockBody = () => {
      saved.forEach(([key, value, priority]) => value ? body.style.setProperty(key, value, priority) : body.style.removeProperty(key));
      if (mobile && location.pathname === path) window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
    };
  }
  return () => { if (--lockCount === 0) { unlockBody?.(); unlockBody = undefined; } };
}

export function revealDrawerField(panel: HTMLElement) {
  const field = document.activeElement;
  if (!(field instanceof HTMLElement) || !panel.contains(field)) return;
  // Do not use scrollIntoView: it also scrolls the document on iOS.
  for (let parent = field.parentElement; parent && panel.contains(parent); parent = parent.parentElement) {
    if (!/(auto|scroll)/.test(getComputedStyle(parent).overflowY) || parent.scrollHeight <= parent.clientHeight) continue;
    const bounds = field.getBoundingClientRect();
    const scrollBounds = parent.getBoundingClientRect();
    const delta = bounds.bottom > scrollBounds.bottom - 12
      ? bounds.bottom - scrollBounds.bottom + 12
      : bounds.top < scrollBounds.top + 12 ? bounds.top - scrollBounds.top - 12 : 0;
    if (delta) parent.scrollTop += delta;
  }
}

/** One keyboard policy for Vaul sheets and custom side panels. The panel's
 * resting top stays stable; only its scrollable interior gets smaller. */
export function useDrawerViewport(enabled = true, mode: "sheet" | "panel" = "sheet", lockDocument = true) {
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!enabled || !panel) return;
    // Vaul's modal overlay already uses Radix RemoveScroll. Fixing the body a
    // second time resets window.scrollY on iOS and can shift the page on close.
    const unlock = lockDocument ? lockPage() : () => undefined;
    const viewport = window.visualViewport;
    const media = window.matchMedia(mobileViewport);
    const properties = ["height", "max-height", "top", "bottom"] as const;
    const original = properties.map(key => [key, panel.style.getPropertyValue(key), panel.style.getPropertyPriority(key)]);
    let frame = 0;
    let adjusted = false;
    let baseViewport = window.innerHeight;
    let baseWidth = window.innerWidth;
    let baseHeight = panel.offsetHeight;
    let baseTop = 0;
    let baseBottom = 0;
    const restore = () => {
      if (!adjusted) return;
      original.forEach(([key, value, priority]) => value ? panel.style.setProperty(key, value, priority) : panel.style.removeProperty(key));
      delete panel.dataset.keyboardOpen;
      adjusted = false;
    };
    const measure = () => {
      const style = getComputedStyle(panel);
      baseViewport = window.innerHeight;
      baseWidth = window.innerWidth;
      baseHeight = panel.offsetHeight;
      baseBottom = Math.max(0, parseFloat(style.bottom) || 0);
      baseTop = mode === "panel" ? 0 : Math.max(0, baseViewport - baseHeight - baseBottom);
    };
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!media.matches || !viewport || Math.abs(viewport.scale - 1) > 0.01) { restore(); return; }
        // Rotation changes the resting layout too; do not retain the previous
        // orientation's keyboard threshold or sheet height.
        if (window.innerWidth !== baseWidth) { restore(); measure(); }
        const field = document.activeElement;
        const editing = field instanceof HTMLElement && panel.contains(field) && field.matches("input,textarea,select,[contenteditable=true]");
        const keyboard = (editing || adjusted) && Math.max(baseViewport, window.innerHeight) - viewport.height > 100;
        if (!keyboard) { restore(); measure(); return; }
        // A short sheet may need to move just enough to leave usable space.
        const top = Math.min(baseTop, Math.max(0, viewport.height - 240));
        const height = Math.max(0, Math.min(baseHeight, viewport.height - top - baseBottom));
        panel.style.top = `${viewport.offsetTop + top}px`;
        panel.style.bottom = "auto";
        panel.style.height = `${height}px`;
        panel.style.maxHeight = `${height}px`;
        panel.dataset.keyboardOpen = "true";
        adjusted = true;
        revealDrawerField(panel);
      });
    };
    measure();
    update();
    const observer = new ResizeObserver(() => { if (!adjusted) update(); });
    observer.observe(panel);
    panel.addEventListener("focusin", update);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      panel.removeEventListener("focusin", update);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      restore();
      // Close the keyboard before releasing the page scroll lock.
      if (panel.contains(document.activeElement)) (document.activeElement as HTMLElement)?.blur();
      unlock();
    };
  }, [enabled, mode, panel, lockDocument]);
  return setPanel;
}
