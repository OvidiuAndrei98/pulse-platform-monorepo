"use client";

import { useId, useLayoutEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";

/** ML Kit previews behind the WebView. Reveal only the embedded viewfinder,
 * keeping the rest of the screen opaque, also during resizing/dragging. */
export function NativeCameraWindow({ viewport }: { viewport: RefObject<HTMLDivElement | null> }) {
  const id = useId();
  const hole = useRef<SVGRectElement>(null);
  useLayoutEffect(() => {
    let frame = 0;
    let previous = "";
    const update = () => {
      const bounds = viewport.current?.getBoundingClientRect();
      const key = bounds ? `${bounds.x},${bounds.y},${bounds.width},${bounds.height}` : "";
      if (bounds && hole.current && key !== previous) {
        previous = key;
        for (const [name, value] of Object.entries({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height })) {
          hole.current.setAttribute(name, String(value));
        }
      }
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [viewport]);
  return createPortal(
    <svg aria-hidden="true" className="native-barcode-scanner-ui pointer-events-none fixed inset-0 z-[98] h-full w-full">
      <defs><mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
        <rect width="100%" height="100%" fill="white" />
        <rect ref={hole} width="0" height="0" rx="24" fill="black" />
      </mask></defs>
      <rect width="100%" height="100%" fill="black" mask={`url(#${id})`} />
    </svg>, document.body,
  );
}
