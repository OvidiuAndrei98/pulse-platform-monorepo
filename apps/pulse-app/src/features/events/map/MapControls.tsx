"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed, Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import { useMap } from "react-leaflet";
import { Coordinates } from "@/features/events/types";

const glassStyle = {
  backgroundColor: "rgba(255, 255, 255, 0.06)",
  backdropFilter: "blur(14px) saturate(160%)",
  WebkitBackdropFilter: "blur(14px) saturate(160%)",
  boxShadow:
    "rgba(255, 255, 255, 0.18) 0px 1px 0px inset, rgba(255, 255, 255, 0.05) 0px -1px 0px inset, rgba(0, 0, 0, 0.35) 0px 6px 20px",
  opacity: 1,
};

export function MapControls({
  onLocate,
  isFullView,
  onToggleFullView,
}: {
  onLocate: (location: Coordinates) => void;
  isFullView?: boolean;
  onToggleFullView?: () => void;
}) {
  const map = useMap();
  const [locating, setLocating] = useState(false);
  const locationWatch = useRef<number | null>(null);
  const locationTimeout = useRef<number | null>(null);

  const stopLocating = () => {
    if (locationWatch.current !== null) {
      navigator.geolocation.clearWatch(locationWatch.current);
      locationWatch.current = null;
    }
    if (locationTimeout.current !== null) {
      window.clearTimeout(locationTimeout.current);
      locationTimeout.current = null;
    }
    setLocating(false);
  };

  useEffect(() => stopLocating, []);

  const handleRecenter = () => {
    if (!navigator.geolocation) return;

    stopLocating();
    setLocating(true);
    locationWatch.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        onLocate([coords.latitude, coords.longitude]);
        if (coords.accuracy <= 80) stopLocating();
      },
      stopLocating,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
    locationTimeout.current = window.setTimeout(stopLocating, 20_000);
  };

  return (
    <div className="pointer-events-auto  absolute top-10 right-5 z-[1000] flex flex-col gap-2">
      {/* Zoom Controls Container */}
      <div
        className="flex flex-col overflow-hidden rounded-2xl text-white/70"
        style={glassStyle}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            map.zoomIn();
          }}
          aria-label="Zoom in"
          className="grid h-9 w-9 place-items-center transition-colors hover:bg-white/10 hover:text-white active:bg-white/20"
        >
          <Plus className="h-4 w-4" />
        </button>
        <div className="h-[1px] w-full bg-white/10" />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            map.zoomOut();
          }}
          aria-label="Zoom out"
          className="grid h-9 w-9 place-items-center transition-colors hover:bg-white/10 hover:text-white active:bg-white/20"
        >
          <Minus className="h-4 w-4" />
        </button>
      </div>

      {/* Recenter Button */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          handleRecenter();
        }}
        aria-label="Find my location"
        title="Find my location"
        disabled={locating}
        className="grid h-9 w-9 place-items-center rounded-2xl text-white/70 transition-colors hover:bg-white/10 hover:text-white active:bg-white/20 disabled:opacity-60"
        style={glassStyle}
      >
        <LocateFixed
          className={`h-4 w-4 ${locating ? "animate-pulse text-white" : ""}`}
        />
      </button>

      {/* Toggle Full View Button */}
      {onToggleFullView && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleFullView();
          }}
          aria-label={isFullView ? "Show event list" : "Hide event list"}
          title={isFullView ? "Show event list" : "Full map view"}
          className="hidden h-9 w-9 place-items-center rounded-2xl text-white/70 transition-colors hover:bg-white/10 hover:text-white active:bg-white/20 lg:grid"
          style={glassStyle}
        >
          {isFullView ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </button>
      )}
    </div>
  );
}
