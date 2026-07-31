"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { Marker, MapContainer, TileLayer } from "react-leaflet";
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
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/loading";
import { requestCurrentLocation } from "@/lib/native/location";

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
  const { t } = useTranslation();
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

  // Instantiem iconita in useMemo doar pe client pentru a evita erorile de appendChild / SSR
  const userLocationIcon = useMemo(() => {
    if (!isMounted || typeof window === "undefined") return null;
    return L.divIcon({
      className: "custom-user-location-marker",
      html: `<div class="user-location-dot"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }, [isMounted]);

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
    let cancelled = false;
    requestCurrentLocation({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20_000,
    })
      .then((location) => !cancelled && handleUserLocation(location))
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
      <div className={`relative w-full overflow-hidden bg-black ${mapSize}`}>
        <Skeleton className="absolute inset-0 opacity-40" />
        <div className="absolute right-4 top-4 flex flex-col gap-2">
          <Skeleton className="h-10 w-10 rounded-lg bg-white/10" />
          <Skeleton className="h-10 w-10 rounded-lg bg-white/10" />
        </div>
        <span className="sr-only">{t("eventMap.loading")}</span>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full overflow-hidden bg-black transform-gpu ${mapSize}`}
    >
      <MapContainer
        maxBounds={[
          [-90, -180],
          [90, 180],
        ]}
        maxBoundsViscosity={1.0}
        minZoom={3}
        center={[44.4323, 26.1063]}
        zoom={12}
        zoomControl={false}
        attributionControl={false}
        dragging
        touchZoom
        className="z-0 h-full w-full touch-none bg-black transform-gpu"
        style={{ touchAction: "none" }}
      >
        <TileLayer
          noWrap={true}
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

        {userLocation && userLocationIcon && (
          <Marker
            position={userLocation}
            icon={userLocationIcon}
            interactive={false}
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
      <style jsx global>{`
        .custom-user-location-marker {
          background: transparent !important;
          border: none !important;
        }
        .user-location-dot {
          width: 18px;
          height: 18px;
          background-color: #84cc16;
          border: 2px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 0 12px rgba(132, 204, 22, 0.6);
          margin: 3px;
        }
      `}</style>

      {!events.length && (
        <div className="pointer-events-none absolute inset-0 z-[1000] grid place-items-center bg-black/80 md:bg-background/50 md:backdrop-blur-sm">
          <p className="text-sm text-muted-foreground">{t("events.noMatch")}</p>
        </div>
      )}
    </div>
  );
}
