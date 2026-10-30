"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import L from "leaflet";
import { Marker, MapContainer, TileLayer } from "react-leaflet";
import { Event } from "@/core/DataProvider";
import {
  MapBoundsObserver,
  MapClickDismiss,
  MapEventFocusController,
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
import { formatEventDateShort, formatEventTime } from "@/features/events/dateFormat";
import carouselStyle from "@/features/events/map/eventMapCarousel.module.css";

import "leaflet/dist/leaflet.css";

const cartoBasemapKey = process.env.NEXT_PUBLIC_CARTO_BASEMAP_KEY?.trim();
const cartoTileUrl = `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png${
  cartoBasemapKey ? `?key=${encodeURIComponent(cartoBasemapKey)}` : ""
}`;


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
  focusRequest,
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
  focusRequest?: { eventId: string; requestId: number } | null;
  distanceKm?: number;
  cityCenter?: Coordinates | null;
}) {
  const { t } = useTranslation();
  const rail = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLButtonElement>());
  const railSelection = useRef<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [carouselHeight, setCarouselHeight] = useState(148);
  const mapEvents = useMemo(() => events.filter(event => Number.isFinite(event.latitude) && Number.isFinite(event.longitude) && Math.abs(event.latitude) <= 90 && Math.abs(event.longitude) <= 180), [events]);
  const [internalId, setInternalId] = useState<string | null>(null);
  const [selectedDisplayPosition, setSelectedDisplayPosition] = useState<{
    eventId: string;
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(
    userLocationProp ?? null,
  );
  const { open } = useEventDetails();

  useEffect(() => setIsMounted(true), []);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)');
    const update = () => setMobile(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
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
    if (!id) setSelectedDisplayPosition(null);
    if (onSelect) {
      onSelect(id);
      return;
    }
    setInternalId(id);
  };
  const handleSelectedDisplayPositionChange = useCallback(
    (
      eventId: string,
      displayPosition: { latitude: number; longitude: number } | null,
    ) => {
      setSelectedDisplayPosition(
        displayPosition ? { eventId, ...displayPosition } : null,
      );
    },
    [],
  );
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
    () => mapEvents.find((event) => event.id === selectedId) ?? null,
    [mapEvents, selectedId],
  );
  const focusEvent = useMemo(
    () => mapEvents.find((event) => event.id === focusRequest?.eventId),
    [mapEvents, focusRequest?.eventId],
  );
  const activeId = mapEvents.some(event => event.id === selectedId) ? selectedId : mapEvents[0]?.id;
  useEffect(() => {
    const node=rail.current;
    if(!node||!mobile||!isMounted)return;
    const update=()=>setCarouselHeight(node.offsetHeight);
    update();const observer=new ResizeObserver(update);observer.observe(node);
    return()=>observer.disconnect();
  }, [mobile,isMounted,mapEvents.length>0]);
  useEffect(() => {
    if(selectedId&&!mapEvents.some(event=>event.id===selectedId))setSelectedId(null);
  }, [mapEvents, selectedId]);
  useEffect(() => {
    const fromRail=railSelection.current===activeId;
    railSelection.current=null;
    if(fromRail)return;
    if (!mobile || !activeId) return;
    const node = rail.current, card = cards.current.get(activeId);
    if (node && card) node.scrollTo({left:card.offsetLeft - 16,behavior:'instant'});
  }, [activeId, mobile]);
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
      data-testid="event-map"
      className={`relative w-full overflow-hidden bg-black transform-gpu ${mapSize} ${carouselStyle.host}`}
      style={{'--map-carousel-height':`${mapEvents.length?carouselHeight:0}px`} as React.CSSProperties}
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
        // Leaflet's CSS zoom fallback timer can fire after MapContainer is
        // destroyed during tab navigation. Keep zoom, without that transition.
        zoomAnimation={false}
        zoomControl={false}
        attributionControl
        dragging
        touchZoom
        className="z-0 h-full w-full touch-none bg-black transform-gpu"
        style={{ touchAction: "none" }}
      >
        <TileLayer
          noWrap={true}
          url={cartoTileUrl}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={20}
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
          events={mapEvents}
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
          events={mapEvents}
          selectedId={mobile ? activeId ?? null : selectedId}
          onSelect={(id, displayPosition) => {
            setSelectedDisplayPosition(
              displayPosition
                ? { eventId: id, ...displayPosition }
                : null,
            );
            setSelectedId(id);
          }}
          onSelectedDisplayPositionChange={handleSelectedDisplayPositionChange}
        />
        <MapEventFocusController
          latitude={focusEvent?.latitude}
          longitude={focusEvent?.longitude}
          requestId={focusRequest?.requestId ?? 0}
        />
        {!mobile && selectedEvent && (
          <SelectedEventPopup
            event={selectedEvent}
            position={
              selectedDisplayPosition?.eventId === selectedEvent.id
                ? selectedDisplayPosition
                : undefined
            }
            onClose={() => setSelectedId(null)}
            onOpen={() => open(selectedEvent)}
          />
        )}
      </MapContainer>

      {mapEvents.length > 0 && <div ref={rail} data-testid="map-events-carousel" className={carouselStyle.rail}
        role="group" aria-label={t('eventMap.map')}
        onScroll={event=>{
          if(!mobile)return;
          const node=event.currentTarget;
          const nearest=mapEvents.reduce<Event|null>((result,item)=>{
            const current=cards.current.get(item.id), previous=result&&cards.current.get(result.id);
            return current&&(!previous||Math.abs(current.offsetLeft-16-node.scrollLeft)<Math.abs(previous.offsetLeft-16-node.scrollLeft))?item:result;
          },null);
          if(nearest&&nearest.id!==selectedId){railSelection.current=nearest.id;setSelectedId(nearest.id);}
        }}>
        {mapEvents.map(event=><button key={event.id} type="button" data-testid={'map-event-card-'+event.id}
          ref={node=>{if(node)cards.current.set(event.id,node);else cards.current.delete(event.id);}}
          className={carouselStyle.card} aria-current={event.id===activeId?'true':undefined}
          aria-label={`${t('events.viewEvent')}: ${event.title}. ${formatEventDateShort(event.startTime)} · ${formatEventTime(event.startTime)}. ${event.locationName||event.city||''}`}
          onClick={()=>{setSelectedId(event.id);open(event);}}>
          <span className={carouselStyle.copy}>
            <strong className={`${carouselStyle.title} line-clamp-2`}>{event.title}</strong>
            <span className={carouselStyle.meta}>{formatEventDateShort(event.startTime)} · {formatEventTime(event.startTime)}</span>
            <span className={`${carouselStyle.meta} ${carouselStyle.location}`}>{event.locationName||event.city}</span>
            <span className={carouselStyle.action}>{t('events.viewEvent')} →</span>
          </span>
          <Image src={event.bannerUrl||'/party-event.webp'} alt="" width={72} height={104} sizes="72px" className={carouselStyle.image}/>
        </button>)}
      </div>}

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
          background-color: var(--primary, #ff0044);
          border: 2px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 0 12px rgba(255, 0, 68, 0.6);
          margin: 3px;
        }
      `}</style>

      {!mapEvents.length && (
        <div className="pointer-events-none absolute inset-0 z-[1000] grid place-items-center bg-black/80 md:bg-background/50 md:backdrop-blur-sm">
          <p className="text-sm text-muted-foreground">{t("events.noMatch")}</p>
        </div>
      )}
    </div>
  );
}
