import { useEffect } from "react";
import L from "leaflet";
import { useMap, useMapEvents } from "react-leaflet";
import { Event } from "@/core/DataProvider";
import { Coordinates } from "@/features/events/types";

export function MapViewportController({
  userLocation,
  cityCenter,
  distanceKm,
}: {
  userLocation?: Coordinates | null;
  cityCenter?: Coordinates | null;
  distanceKm: number;
}) {
  const map = useMap();

  useEffect(() => {
    const location = cityCenter ?? userLocation ?? [44.4268, 26.1025];
    const radiusMeters = Math.max(1, distanceKm) * 1000;
    map.fitBounds(L.latLng(location).toBounds(radiusMeters), {
      padding: [40, 40],
      maxZoom: 15,
      animate: true,
    });
  }, [cityCenter, distanceKm, map, userLocation]);

  return null;
}

export function MapSizeUpdater({ layoutKey }: { layoutKey: string }) {
  const map = useMap();

  useEffect(() => {
    const refresh = () => map.invalidateSize({ pan: false });
    const frame = requestAnimationFrame(refresh);
    const timeout = window.setTimeout(refresh, 180);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [layoutKey, map]);

  return null;
}

export function MapBoundsObserver({
  events,
  onBoundsEventsChange,
}: {
  events: Event[];
  onBoundsEventsChange?: (eventIds: string[]) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!onBoundsEventsChange) return;

    const updateVisibleEvents = () => {
      const bounds = map.getBounds();
      onBoundsEventsChange(
        events
          .filter((event) => bounds.contains([event.latitude, event.longitude]))
          .map((event) => event.id),
      );
    };

    updateVisibleEvents();
    map.on("moveend", updateVisibleEvents);
    map.on("zoomend", updateVisibleEvents);

    return () => {
      map.off("moveend", updateVisibleEvents);
      map.off("zoomend", updateVisibleEvents);
    };
  }, [events, map, onBoundsEventsChange]);

  return null;
}

export function MapClickDismiss({ onDismiss }: { onDismiss: () => void }) {
  useMapEvents({ click: onDismiss });
  return null;
}
