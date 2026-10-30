import L from "leaflet";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Marker, useMap, useMapEvents } from "react-leaflet";
import { useTranslation } from "react-i18next";
import { Event } from "@/core/DataProvider";

const CLUSTER_RADIUS_PX = 58;
const OVERLAP_RADIUS_PX = 34;
const RADIAL_ZOOM_THRESHOLD = 17;
const eventPinIconCache = new Map<string, L.DivIcon>();
const clusterIconCache = new Map<number, L.DivIcon>();

type DisplayPosition = { latitude: number; longitude: number };

type EventCluster = {
  events: Event[];
  latitude: number;
  longitude: number;
  point: L.Point;
};

type RadialEvent = {
  event: Event;
  position: L.LatLng;
};

function createEventPinIcon(
  isSelected: boolean,
  isLive: boolean,
  isRadial = false,
) {
  const cacheKey = `${isSelected}-${isLive}-${isRadial}`;
  const cached = eventPinIconCache.get(cacheKey);
  if (cached) return cached;

  const size = isSelected ? 46 : 40;
  const classes = [
    "event-map-pin",
    `event-map-pin--${isSelected ? "selected" : "default"}`,
    isLive ? "event-map-pin--live" : "",
    isRadial ? "event-map-pin--spiderfied" : "",
  ].filter(Boolean).join(" ");
  const icon = L.divIcon({
    html: `<div class="${classes}" style="width: ${size}px; height: ${size}px;">
      ${isLive ? '<span class="event-map-pin__pulse"></span>' : ""}
      <div class="event-map-pin__shape"><svg class="event-map-pin__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg></div>
    </div>`,
    className: "custom-leaflet-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size - 3],
  });
  eventPinIconCache.set(cacheKey, icon);
  return icon;
}

function createClusterIcon(count: number) {
  const cached = clusterIconCache.get(count);
  if (cached) return cached;

  const size = count >= 100 ? 56 : count >= 10 ? 50 : 44;
  const icon = L.divIcon({
    html: `<div class="event-map-cluster" style="width:${size}px;height:${size}px"><span>${count}</span></div>`,
    className: "custom-leaflet-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  clusterIconCache.set(count, icon);
  return icon;
}

function groupNearbyEvents(events: Event[], map: L.Map, zoom: number) {
  const clusterRadius = zoom > RADIAL_ZOOM_THRESHOLD
    ? OVERLAP_RADIUS_PX
    : CLUSTER_RADIUS_PX;
  const clusters: EventCluster[] = [];

  for (const event of events) {
    const point = map.project([event.latitude, event.longitude], zoom);
    let closest: EventCluster | undefined;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const cluster of clusters) {
      const distance = point.distanceTo(cluster.point);
      if (distance <= clusterRadius && distance < closestDistance) {
        closest = cluster;
        closestDistance = distance;
      }
    }

    if (!closest) {
      clusters.push({
        events: [event],
        latitude: event.latitude,
        longitude: event.longitude,
        point,
      });
      continue;
    }

    const previousCount = closest.events.length;
    closest.events.push(event);
    closest.latitude =
      (closest.latitude * previousCount + event.latitude) / (previousCount + 1);
    closest.longitude =
      (closest.longitude * previousCount + event.longitude) / (previousCount + 1);
    closest.point = map.project([closest.latitude, closest.longitude], zoom);
  }

  return clusters;
}

function createRadialEventPositions(cluster: EventCluster, map: L.Map) {
  const centerPoint = map.latLngToLayerPoint([
    cluster.latitude,
    cluster.longitude,
  ]);
  const positionedEvents: RadialEvent[] = [];
  let eventIndex = 0;
  let ringIndex = 0;

  while (eventIndex < cluster.events.length) {
    const remaining = cluster.events.length - eventIndex;
    const capacity = ringIndex === 0 ? 8 : 12 + (ringIndex - 1) * 4;
    const ringCount = Math.min(capacity, remaining);
    const radius = ringIndex === 0
      ? ringCount <= 4 ? 28 : 38
      : 68 + (ringIndex - 1) * 34;

    for (let indexInRing = 0; indexInRing < ringCount; indexInRing += 1) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * indexInRing) / ringCount;
      const point = L.point(
        centerPoint.x + Math.cos(angle) * radius,
        centerPoint.y + Math.sin(angle) * radius,
      );
      positionedEvents.push({
        event: cluster.events[eventIndex + indexInRing],
        position: map.layerPointToLatLng(point),
      });
    }

    eventIndex += ringCount;
    ringIndex += 1;
  }

  return positionedEvents;
}

export function EventMapMarkers({
  events,
  selectedId,
  onSelect,
  onSelectedDisplayPositionChange,
}: {
  events: Event[];
  selectedId: string | null;
  onSelect: (id: string, displayPosition?: DisplayPosition) => void;
  onSelectedDisplayPositionChange?: (
    eventId: string,
    displayPosition: DisplayPosition | null,
  ) => void;
}) {
  const { t } = useTranslation();
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  });

  const clusters = useMemo(
    () => groupNearbyEvents(events, map, zoom),
    [events, map, zoom],
  );
  const radialLayouts = useMemo(
    () => zoom > RADIAL_ZOOM_THRESHOLD
      ? clusters
          .filter((cluster) => cluster.events.length > 1)
          .flatMap((cluster) => createRadialEventPositions(cluster, map))
      : [],
    [clusters, map, zoom],
  );
  const radialPositionByEventId = useMemo(
    () => new Map(
      radialLayouts.map(({ event, position }) => [event.id, position]),
    ),
    [radialLayouts],
  );

  useEffect(() => {
    if (!selectedId || !onSelectedDisplayPositionChange) return;
    const radialPosition = radialPositionByEventId.get(selectedId);
    onSelectedDisplayPositionChange(
      selectedId,
      radialPosition
        ? { latitude: radialPosition.lat, longitude: radialPosition.lng }
        : null,
    );
  }, [onSelectedDisplayPositionChange, radialPositionByEventId, selectedId]);

  const zoomToCluster = (cluster: EventCluster) => {
    const firstEvent = cluster.events[0];
    const sameLocation = cluster.events.every(
      (event) =>
        Math.abs(event.latitude - firstEvent.latitude) < 0.000001 &&
        Math.abs(event.longitude - firstEvent.longitude) < 0.000001,
    );

    if (sameLocation) {
      map.flyTo(
        [cluster.latitude, cluster.longitude],
        Math.max(RADIAL_ZOOM_THRESHOLD + 1, zoom),
        { animate: true, duration: 0.45 },
      );
      return;
    }

    const bounds = L.latLngBounds(
      cluster.events.map((event) => [
        event.latitude,
        event.longitude,
      ] as L.LatLngTuple),
    );
    map.flyToBounds(bounds, {
      animate: true,
      duration: 0.45,
      padding: [64, 64],
      maxZoom: RADIAL_ZOOM_THRESHOLD + 1,
    });
  };

  return (
    <>
      {clusters.map((cluster) => {
        if (cluster.events.length === 1) {
          const event = cluster.events[0];
          return (
            <Marker
              key={event.id}
              title={event.title}
              alt={event.title}
              position={[event.latitude, event.longitude]}
              icon={createEventPinIcon(event.id === selectedId, !!event.isLive)}
              eventHandlers={{ click: () => onSelect(event.id) }}
              zIndexOffset={event.id === selectedId ? 1000 : 0}
            />
          );
        }

        if (zoom > RADIAL_ZOOM_THRESHOLD) {
          return (
            <Fragment key={`radial-${cluster.events.map((event) => event.id).sort().join("-")}`}>
              {cluster.events.map((event) => {
                const position = radialPositionByEventId.get(event.id);
                if (!position) return null;
                return (
                  <Marker
                    key={`radial-pin-${event.id}`}
                    title={event.title}
                    alt={event.title}
                    position={position}
                    icon={createEventPinIcon(
                      event.id === selectedId,
                      !!event.isLive,
                      true,
                    )}
                    eventHandlers={{
                      click: (clickEvent) => {
                        L.DomEvent.stopPropagation(clickEvent.originalEvent);
                        onSelect(event.id, {
                          latitude: position.lat,
                          longitude: position.lng,
                        });
                      },
                    }}
                    zIndexOffset={event.id === selectedId ? 1000 : 900}
                  />
                );
              })}
            </Fragment>
          );
        }

        const label = t("eventMap.cluster", { count: cluster.events.length });
        return (
          <Marker
            key={`cluster-${cluster.events.map((event) => event.id).sort().join("-")}`}
            position={[cluster.latitude, cluster.longitude]}
            icon={createClusterIcon(cluster.events.length)}
            title={label}
            alt={label}
            eventHandlers={{
              click: (clickEvent) => {
                L.DomEvent.stopPropagation(clickEvent.originalEvent);
                zoomToCluster(cluster);
              },
            }}
          />
        );
      })}
    </>
  );
}
