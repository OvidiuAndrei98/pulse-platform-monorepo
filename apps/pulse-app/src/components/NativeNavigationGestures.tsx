"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDataProvider } from "@/core/DataProviderContext";
import { isNativePlatform } from "@/lib/native/platform";

const SWIPE_DISTANCE = 88;
const HORIZONTAL_BIAS = 1.4;
const BACK_EDGE_WIDTH = 36;
const MAX_DRAG_OFFSET = 112;

type SwipeStart = {
  x: number;
  y: number;
  target: EventTarget | null;
};

function isGestureExempt(target: EventTarget | null) {
  if (!(target instanceof Element)) return true;

  if (
    target.closest(
      "button, a, input, textarea, select, [contenteditable='true'], [data-gesture-exempt], [data-vaul-drawer], [role='dialog'], .leaflet-container",
    )
  ) {
    return true;
  }

  let element: Element | null = target;
  while (element) {
    const style = window.getComputedStyle(element);
    const canScrollHorizontally =
      (style.overflowX === "auto" || style.overflowX === "scroll") &&
      element.scrollWidth > element.clientWidth;
    if (canScrollHorizontally) return true;
    element = element.parentElement;
  }

  return false;
}

function mainNavigationIndex(pathname: string | null, isOrganizer: boolean) {
  const mainProfilePath = isOrganizer ? "/dashboard" : "/users/me";
  return ["/", "/events", "/feed", mainProfilePath].indexOf(pathname ?? "");
}

export function NativeNavigationGestures() {
  const pathname = usePathname();
  const router = useRouter();
  const { isOrganizer } = useDataProvider();
  const startRef = useRef<SwipeStart | null>(null);
  const navigatingRef = useRef(false);

  useEffect(() => {
    if (!isNativePlatform()) return;

    const surface = () => document.getElementById("native-app-surface");
    const setSurfaceOffset = (offset: number, animated = false) => {
      const element = surface();
      if (!element) return;

      element.style.willChange = "transform";
      element.style.transition = animated
        ? "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)"
        : "none";
      element.style.transform = `translate3d(${offset}px, 0, 0)`;
    };
    const resetSurface = (animated = true) => {
      setSurfaceOffset(0, animated);
      window.setTimeout(() => {
        const element = surface();
        if (!element) return;
        element.style.willChange = "";
        element.style.transition = "";
      }, animated ? 240 : 0);
    };

    const navigate = (direction: "back" | "forward") => {
      if (navigatingRef.current) return false;
      if (
        document.body.classList.contains("barcode-scanner-active") ||
        document.querySelector("[data-vaul-drawer], [role='dialog'][aria-modal='true']")
      ) {
        return false;
      }

      const currentIndex = mainNavigationIndex(pathname, isOrganizer);
      const mainRoutes = [
        "/",
        "/events",
        "/feed",
        isOrganizer ? "/dashboard" : "/users/me",
      ];

      if (currentIndex >= 0) {
        const nextIndex = direction === "back" ? currentIndex - 1 : currentIndex + 1;
        if (nextIndex < 0 || nextIndex >= mainRoutes.length) return false;
        router.push(mainRoutes[nextIndex]);
      } else if (direction === "back") {
        router.back();
      } else {
        window.history.forward();
      }

      navigatingRef.current = true;
      window.setTimeout(() => {
        navigatingRef.current = false;
      }, 450);
      return true;
    };

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches.item(0);
      if (!touch || event.touches.length !== 1 || isGestureExempt(event.target)) {
        startRef.current = null;
        return;
      }
      resetSurface(false);
      startRef.current = { x: touch.clientX, y: touch.clientY, target: event.target };
    };

    const onTouchMove = (event: TouchEvent) => {
      const start = startRef.current;
      const touch = event.touches.item(0);
      if (!start || !touch) return;

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      if (Math.abs(deltaX) < Math.abs(deltaY) * HORIZONTAL_BIAS) return;
      if (deltaX > 0 && start.x > BACK_EDGE_WIDTH) return;

      const resistance = Math.min(Math.abs(deltaX) * 0.52, MAX_DRAG_OFFSET);
      setSurfaceOffset(deltaX < 0 ? -resistance : resistance);
    };

    const onTouchEnd = (event: TouchEvent) => {
      const start = startRef.current;
      startRef.current = null;
      const touch = event.changedTouches.item(0);
      if (!start || !touch) return;

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      if (
        Math.abs(deltaX) < SWIPE_DISTANCE ||
        Math.abs(deltaX) < Math.abs(deltaY) * HORIZONTAL_BIAS ||
        isGestureExempt(start.target)
      ) {
        resetSurface();
        return;
      }

      // Native navigation convention: begin at the left edge and swipe right
      // to go back. A left swipe advances through the main navigation tabs.
      if (deltaX > 0 && start.x > BACK_EDGE_WIDTH) {
        resetSurface();
        return;
      }

      const direction = deltaX > 0 ? "back" : "forward";
      if (!navigate(direction)) {
        resetSurface();
        return;
      }

      setSurfaceOffset(direction === "back" ? MAX_DRAG_OFFSET : -MAX_DRAG_OFFSET, true);
      window.setTimeout(() => resetSurface(), 120);
    };

    const onTouchCancel = () => {
      startRef.current = null;
      resetSurface();
    };

    window.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    window.addEventListener("touchmove", onTouchMove, { capture: true, passive: true });
    window.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    window.addEventListener("touchcancel", onTouchCancel, { capture: true, passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart, true);
      window.removeEventListener("touchmove", onTouchMove, true);
      window.removeEventListener("touchend", onTouchEnd, true);
      window.removeEventListener("touchcancel", onTouchCancel, true);
      resetSurface(false);
    };
  }, [isOrganizer, pathname, router]);

  return null;
}
