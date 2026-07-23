import { useEffect, useRef, useState } from "react";
import { LocateFixed, Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import { useMap } from "react-leaflet";
import { Coordinates } from "@/features/events/types";

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
    <div className="pointer-events-auto absolute right-3 top-3 z-[1000] flex flex-col gap-1.5">
      <div className="flex flex-col overflow-hidden rounded-xl border border-white/15 bg-background/80 shadow-lg" style={{ backdropFilter: "blur(16px)" }}>
        <button type="button" onClick={(event) => { event.stopPropagation(); map.zoomIn(); }} aria-label="Zoom in" className="grid h-9 w-9 place-items-center transition hover:bg-white/10 active:bg-white/20">
          <Plus className="h-4 w-4" />
        </button>
        <div className="h-px w-full bg-white/10" />
        <button type="button" onClick={(event) => { event.stopPropagation(); map.zoomOut(); }} aria-label="Zoom out" className="grid h-9 w-9 place-items-center transition hover:bg-white/10 active:bg-white/20">
          <Minus className="h-4 w-4" />
        </button>
      </div>
      <button type="button" onClick={(event) => { event.stopPropagation(); handleRecenter(); }} aria-label="Find my location" title="Find my location" disabled={locating} className="grid h-9 w-9 place-items-center rounded-xl border border-white/15 bg-background/80 shadow-lg transition hover:bg-white/10 active:bg-white/20 disabled:opacity-60" style={{ backdropFilter: "blur(16px)" }}>
        <LocateFixed className={`h-4 w-4 ${locating ? "animate-pulse" : ""}`} />
      </button>
      {onToggleFullView && (
        <button type="button" onClick={(event) => { event.stopPropagation(); onToggleFullView(); }} aria-label={isFullView ? "Show event list" : "Hide event list"} title={isFullView ? "Show event list" : "Full map view"} className="hidden h-9 w-9 place-items-center rounded-xl border border-white/15 bg-background/80 shadow-lg transition hover:bg-white/10 active:bg-white/20 lg:grid" style={{ backdropFilter: "blur(16px)" }}>
          {isFullView ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}
