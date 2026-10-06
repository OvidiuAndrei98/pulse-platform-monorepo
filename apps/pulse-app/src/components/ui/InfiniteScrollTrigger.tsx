"use client";

import { useEffect, useRef, type RefObject } from "react";

export function InfiniteScrollTrigger({ root, enabled, onVisible }: {
  root: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  onVisible: () => void;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enabled || !sentinel.current || !root.current) return;
    const node = sentinel.current;
    const scroller = root.current;
    // Re-observe after each page; this also fills a tall viewport automatically.
    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) onVisible();
      }, { root: scroller, rootMargin: "300px 0px" });
      observer.observe(node);
      return () => observer.disconnect();
    }
    const check = () => { if (node.getBoundingClientRect().top < scroller.getBoundingClientRect().bottom + 300) onVisible(); };
    check(); scroller.addEventListener("scroll", check, { passive: true });
    return () => scroller.removeEventListener("scroll", check);
  }, [enabled, onVisible, root]);
  return <div ref={sentinel} aria-hidden="true" className="h-px w-full" />;
}
