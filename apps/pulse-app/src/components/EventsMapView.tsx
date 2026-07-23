"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, TileLayer } from "react-leaflet";
import { Event } from "@/core/DataProvider";
import {
  MapBoundsObserver,
  MapClickDismiss,
  MapSizeUpdater,
  MapViewportController,
} from "@/features/events/map/MapBehavior";
import { MapControls } from "@/features/events/map/MapControls";
import { EventMapMarkers } from "@/features/events/map/EventMapMarkers";
import { SelectedEventPopup } from "@/features/events/map/SelectedEventPopup";
import { eventMapStyles } from "@/features/events/map/eventMapStyles";
import { useEventDetails } from "@/components/EventDetailsSheet";
import { Coordinates } from "@/features/events/types";

import "leaflet/dist/leaflet.css";

export function EventsMapView({
  events,
  selectedId: selectedIdProp,
  onSelect,
  fullScreenOnMobile = false,
  desktopFillViewport = false,
  isFullView = false,
  onToggleFullView,
  userLocation: userLocationProp,
  onUserLocationChange,
  onBoundsEventsChange,
  distanceKm = 15,
  cityCenter,
}: {
  events: Event[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  fullScreenOnMobile?: boolean;
  desktopFillViewport?: boolean;
  isFullView?: boolean;
  onToggleFullView?: () => void;
  userLocation?: Coordinates | null;
  onUserLocationChange?: (location: Coordinates) => void;
  onBoundsEventsChange?: (eventIds: string[]) => void;
  distanceKm?: number;
  cityCenter?: Coordinates | null;
}) {
  const [internalId, setInternalId] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(
    userLocationProp ?? null,
  );
  const { open } = useEventDetails();

  useEffect(() => setIsMounted(true), []);
  useEffect(() => {
    if (userLocationProp) setUserLocation(userLocationProp);
  }, [userLocationProp]);

  const selectedId = selectedIdProp !== undefined ? selectedIdProp : internalId;
  const setSelectedId = (id: string | null) => {
    if (onSelect) {
      onSelect(id);
      return;
    }
    setInternalId(id);
  };
  const handleUserLocation = (location: Coordinates) => {
    setUserLocation(location);
    onUserLocationChange?.(location);
  };

  useEffect(() => {
    if (!navigator.geolocation || !navigator.permissions) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((permission) => {
        if (permission.state !== "granted" || cancelled) return;
        navigator.geolocation.getCurrentPosition(
          ({ coords }) =>
            !cancelled &&
            handleUserLocation([coords.latitude, coords.longitude]),
          () => undefined,
          { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedId) ?? null,
    [events, selectedId],
  );
  const desktopHeight = desktopFillViewport
    ? "lg:h-[calc(100dvh-200px)] lg:min-h-0"
    : "lg:h-[78vh] lg:min-h-[640px]";
  const mapSize = fullScreenOnMobile
    ? `h-dvh rounded-none ${desktopHeight} lg:rounded-[24px] lg:border lg:border-white/10`
    : `h-[72vh] min-h-[520px] rounded-[24px] border border-white/10 ${desktopHeight}`;

  if (!isMounted) {
    return (
      <div
        className={`grid w-full place-items-center bg-background/50 ${mapSize}`}
      >
        <p className="text-sm text-muted-foreground">Loading map...</p>
      </div>
    );
  }

  return (
    <div className={`relative w-full overflow-hidden bg-black ${mapSize}`}>
      <MapContainer
        center={[44.4323, 26.1063]}
        zoom={12}
        zoomControl={false}
        attributionControl={false}
        dragging
        touchZoom
        className="z-0 h-full w-full touch-none bg-black"
        style={{ touchAction: "none" }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          maxZoom={19}
          keepBuffer={6}
          updateWhenIdle={false}
          updateWhenZooming={false}
        />
        <MapViewportController
          userLocation={userLocation}
          cityCenter={cityCenter}
          distanceKm={distanceKm}
        />
        <MapSizeUpdater
          layoutKey={`${fullScreenOnMobile}-${desktopFillViewport}-${isFullView}`}
        />
        <MapBoundsObserver
          events={events}
          onBoundsEventsChange={onBoundsEventsChange}
        />
        <MapClickDismiss onDismiss={() => setSelectedId(null)} />
        <MapControls
          onLocate={handleUserLocation}
          isFullView={isFullView}
          onToggleFullView={onToggleFullView}
        />
        {userLocation && (
          <CircleMarker
            center={userLocation}
            radius={9}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: "#84cc16",
              fillOpacity: 1,
            }}
          />
        )}
        <EventMapMarkers
          events={events}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {selectedEvent && (
          <SelectedEventPopup
            event={selectedEvent}
            onClose={() => setSelectedId(null)}
            onOpen={() => open(selectedEvent)}
          />
        )}
      </MapContainer>
      <style jsx global>
        {eventMapStyles}
      </style>
      {!events.length && (
        <div className="pointer-events-none absolute inset-0 z-[1000] grid place-items-center bg-background/50 backdrop-blur-sm">
          <p className="text-sm text-muted-foreground">
            No events match your filters.
          </p>
        </div>
      )}
    </div>
  );
}
