"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDataProvider } from "@/core/DataProviderContext";
import { isNativePlatform } from "@/lib/native/platform";

const SWIPE_DISTANCE = 88;
const HORIZONTAL_BIAS = 1.4;

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

    const navigate = (direction: "back" | "forward") => {
      if (navigatingRef.current) return;
      if (
        document.body.classList.contains("barcode-scanner-active") ||
        document.querySelector("[data-vaul-drawer], [role='dialog'][aria-modal='true']")
      ) {
        return;
      }

      navigatingRef.current = true;
      const currentIndex = mainNavigationIndex(pathname, isOrganizer);
      const mainRoutes = [
        "/",
        "/events",
        "/feed",
        isOrganizer ? "/dashboard" : "/users/me",
      ];

      if (currentIndex >= 0) {
        const nextIndex = direction === "back" ? currentIndex - 1 : currentIndex + 1;
        if (nextIndex >= 0 && nextIndex < mainRoutes.length) {
          router.push(mainRoutes[nextIndex]);
        }
      } else if (direction === "back") {
        router.back();
      } else {
        window.history.forward();
      }

      window.setTimeout(() => {
        navigatingRef.current = false;
      }, 450);
    };

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches.item(0);
      if (!touch || event.touches.length !== 1 || isGestureExempt(event.target)) {
        startRef.current = null;
        return;
      }
      startRef.current = { x: touch.clientX, y: touch.clientY, target: event.target };
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
        return;
      }

      // Requested direction: left goes back, right goes forward.
      navigate(deltaX < 0 ? "back" : "forward");
    };

    window.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    window.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart, true);
      window.removeEventListener("touchend", onTouchEnd, true);
    };
  }, [isOrganizer, pathname, router]);

  return null;
}
