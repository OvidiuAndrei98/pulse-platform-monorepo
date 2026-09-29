"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { LocateFixed, Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import { useMap } from "react-leaflet";
import { Coordinates } from "@/features/events/types";
import { requestCurrentLocation } from "@/lib/native/location";

export function MapControls({
  onLocate,
  isFullView,
  onToggleFullView,
}: {
  onLocate: (location: Coordinates) => void;
  isFullView?: boolean;
  onToggleFullView?: () => void;
}) {
  const { t } = useTranslation();
  const map = useMap();
  const [locating, setLocating] = useState(false);
  const locatingRef = useRef(false);
  const handleRecenter = async () => {
    if (locatingRef.current) return;
    locatingRef.current = true;
    setLocating(true);
    try {
      onLocate(
        await requestCurrentLocation({
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 20_000,
        }),
      );
    } catch (error) {
      const code = (error as { code?: number | string })?.code;
      const denied = code === 1 || (error instanceof Error && /DENIED|permission/i.test(error.message));
      toast.error(t(denied ? "feedback.locationDenied" : code === 3 ? "feedback.locationTimeout" : "feedback.locationUnavailable"));
    } finally {
      locatingRef.current = false;
      setLocating(false);
    }
  };

  // Clasa reutilizabilă pentru container sticlă + shadow optimizat
  const glassClasses =
    "border border-white/10 bg-[#121418]/85 md:bg-white/[0.06] md:backdrop-blur-md shadow-[rgba(255,255,255,0.18)_0px_1px_0px_inset,rgba(0,0,0,0.35)_0px_6px_20px] transform-gpu";

  return (
    <div className="pointer-events-auto absolute right-5 top-[5.75rem] z-[1000] flex flex-col gap-2 lg:top-10">
      {/* Zoom Controls Container */}
      <div
        className={`flex flex-col overflow-hidden rounded-2xl text-white/70 ${glassClasses}`}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            map.zoomIn();
          }}
          aria-label={t("mapControls.zoomIn")}
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
          aria-label={t("mapControls.zoomOut")}
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
          void handleRecenter();
        }}
        aria-label={t("mapControls.findMyLocation")}
        title={t("mapControls.findMyLocation")}
        disabled={locating}
        className={`grid h-9 w-9 place-items-center rounded-2xl text-white/70 transition-colors hover:bg-white/10 hover:text-white active:bg-white/20 disabled:opacity-60 ${glassClasses}`}
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
          aria-label={t(isFullView ? "mapControls.showEventList" : "mapControls.hideEventList")}
          title={t(isFullView ? "mapControls.showEventList" : "mapControls.fullMapView")}
          className={`hidden h-9 w-9 place-items-center rounded-2xl text-white/70 transition-colors hover:bg-white/10 hover:text-white active:bg-white/20 lg:grid ${glassClasses}`}
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
