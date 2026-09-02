import { useState } from "react";
import { Event } from "@/core/DataProvider";
import { useEventDetails } from "@/components/EventDetailsSheet";
import { EventsMapView } from "@/components/EventsMapView";
import { EventMapSidebar } from "@/features/events/components/EventMapSidebar";
import { Coordinates } from "@/features/events/types";

export function EventsMapLayout({
  events,
  distanceKm,
  cityCenter,
  userLocation,
  onUserLocationChange,
}: {
  events: Event[];
  distanceKm: number;
  cityCenter: Coordinates | null;
  userLocation: Coordinates | null;
  onUserLocationChange: (location: Coordinates) => void;
}) {
  const { open } = useEventDetails();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isFullView, setIsFullView] = useState(false);
  const [visibleEventIds, setVisibleEventIds] = useState<string[] | null>(null);
  const [focusRequest, setFocusRequest] = useState<{
    eventId: string;
    requestId: number;
  } | null>(null);
  const visibleEvents = visibleEventIds
    ? events.filter((event) => visibleEventIds.includes(event.id))
    : events;

  return (
    <div className={`h-full lg:grid lg:gap-4 ${isFullView ? "lg:grid-cols-1" : "lg:grid-cols-[340px_minmax(0,1fr)]"}`}>
      {!isFullView && (
        <EventMapSidebar
          events={visibleEvents}
          selectedId={selectedId}
          userLocation={userLocation}
          onSelect={(eventId) => {
            setSelectedId(eventId);
            setFocusRequest((current) => ({
              eventId,
              requestId: (current?.requestId ?? 0) + 1,
            }));
          }}
          onOpen={open}
        />
      )}
      <EventsMapView
        events={events}
        selectedId={selectedId}
        onSelect={setSelectedId}
        fullScreenOnMobile
        desktopFillViewport
        isFullView={isFullView}
        onToggleFullView={() => setIsFullView((current) => !current)}
        distanceKm={distanceKm}
        cityCenter={cityCenter}
        userLocation={userLocation}
        onUserLocationChange={onUserLocationChange}
        onBoundsEventsChange={setVisibleEventIds}
        focusRequest={focusRequest}
      />
    </div>
  );
}
