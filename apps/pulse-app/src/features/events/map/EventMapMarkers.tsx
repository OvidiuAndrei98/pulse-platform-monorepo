import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { Marker, useMap, useMapEvents } from "react-leaflet";
import { useTranslation } from "react-i18next";
import { Event } from "@/core/DataProvider";

const CLUSTER_RADIUS_PX = 58;
const CLUSTER_MAX_ZOOM = 17;

type EventCluster = {
  events: Event[];
  latitude: number;
  longitude: number;
  point: L.Point;
};

function createEventPinIcon(isSelected: boolean, isLive: boolean) {
  const size = isSelected ? 46 : 40;
  const state = `${isSelected ? "selected" : "default"}${isLive ? " event-map-pin--live" : ""}`;

  return L.divIcon({
    html: `<div class="event-map-pin event-map-pin--${state}" style="width: ${size}px; height: ${size}px;">
      ${isLive ? '<span class="event-map-pin__pulse"></span>' : ""}
      <div class="event-map-pin__shape"><svg class="event-map-pin__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg></div>
    </div>`,
    className: "custom-leaflet-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size - 3],
  });
}

function createClusterIcon(count: number) {
  const size = count >= 100 ? 56 : count >= 10 ? 50 : 44;
  return L.divIcon({
    html: `<div class="event-map-cluster" style="width:${size}px;height:${size}px"><span>${count}</span></div>`,
    className: "custom-leaflet-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function groupNearbyEvents(events: Event[], map: L.Map, zoom: number) {
  if (zoom > CLUSTER_MAX_ZOOM) {
    return events.map<EventCluster>((event) => ({
      events: [event],
      latitude: event.latitude,
      longitude: event.longitude,
      point: map.project([event.latitude, event.longitude], zoom),
    }));
  }

  const clusters: EventCluster[] = [];
  for (const event of events) {
    const point = map.project([event.latitude, event.longitude], zoom);
    let closest: EventCluster | undefined;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const cluster of clusters) {
      const distance = point.distanceTo(cluster.point);
      if (distance <= CLUSTER_RADIUS_PX && distance < closestDistance) {
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

export function EventMapMarkers({
  events,
  selectedId,
  onSelect,
}: {
  events: Event[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  });

  useEffect(() => setZoom(map.getZoom()), [map]);

  const selectedEvent = events.find((event) => event.id === selectedId);
  const clusters = useMemo(
    () => groupNearbyEvents(events.filter((event) => event.id !== selectedId), map, zoom),
    [events, map, selectedId, zoom],
  );

  const openCluster = (cluster: EventCluster) => {
    const bounds = L.latLngBounds(
      cluster.events.map((event) => [event.latitude, event.longitude] as L.LatLngTuple),
    );
    map.flyToBounds(bounds, {
      animate: true,
      duration: 0.45,
      padding: [64, 64],
      maxZoom: Math.min(CLUSTER_MAX_ZOOM + 1, zoom + 2),
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
              position={[event.latitude, event.longitude]}
              icon={createEventPinIcon(false, !!event.isLive)}
              eventHandlers={{ click: () => onSelect(event.id) }}
            />
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
            eventHandlers={{ click: () => openCluster(cluster) }}
          />
        );
      })}

      {selectedEvent && (
        <Marker
          key={`selected-${selectedEvent.id}`}
          position={[selectedEvent.latitude, selectedEvent.longitude]}
          icon={createEventPinIcon(true, !!selectedEvent.isLive)}
          eventHandlers={{ click: () => onSelect(selectedEvent.id) }}
          zIndexOffset={1000}
        />
      )}
    </>
  );
}
