import L from "leaflet";
import { Marker } from "react-leaflet";
import { Event } from "@/core/DataProvider";

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

export function EventMapMarkers({
  events,
  selectedId,
  onSelect,
}: {
  events: Event[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return events.map((event) => (
    <Marker
      key={event.id}
      position={[event.latitude, event.longitude]}
      icon={createEventPinIcon(selectedId === event.id, !!event.isLive)}
      eventHandlers={{ click: () => onSelect(event.id) }}
    />
  ));
}
