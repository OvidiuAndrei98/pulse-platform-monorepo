import React from "react";
import {
  RefreshSpotlightBeam,
  type RefreshSpotlightProps,
} from "./RefreshSpotlightBeam";
import { REFRESH_LIGHT_FADE_MS } from "./useRefreshFeedback";

export function RefreshSpotlight({
  progress,
  active,
  visible,
}: RefreshSpotlightProps) {
  const fraction = Math.min(1, Math.max(0, progress));
  return (
    <>
      <style>{`
      @keyframes spottr-light-sweep { from { transform: rotate(-12deg); } to { transform: rotate(12deg); } }
      .spottr-refresh-light { animation: spottr-light-sweep 1700ms ease-in-out infinite alternate; transform-origin: 52px 5px; }
      @media (prefers-reduced-motion: reduce) { .spottr-refresh-light { animation: none !important; } }
    `}</style>
      <div
        data-testid="refresh-light"
        aria-hidden="true"
        style={{
          width: 104,
          height: 60,
          opacity: visible ? Math.min(1, fraction * 1.8) : 0,
          transform: `scaleY(${0.35 + fraction * 0.65})`,
          transformOrigin: "top center",
          transition: `opacity ${visible ? 80 : REFRESH_LIGHT_FADE_MS}ms ease-out`,
        }}
      >
        <div
          data-testid="refresh-light-sweep"
          className="spottr-refresh-light"
          style={{ animationPlayState: active ? "running" : "paused" }}
        >
          <RefreshSpotlightBeam />
        </div>
      </div>
    </>
  );
}
