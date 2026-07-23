import Image from "next/image";
import { Clock, MapPin } from "lucide-react";
import { Event } from "@/core/DataProvider";
import { Coordinates } from "@/features/events/types";
import { formatDistance, getDistanceKm } from "@/features/events/utils";
import { EventStatusBadge } from "@/features/events/components/EventStatusBadge";

export function EventMapSidebar({
  events,
  selectedId,
  userLocation,
  onSelect,
  onOpen,
}: {
  events: Event[];
  selectedId: string | null;
  userLocation: Coordinates | null;
  onSelect: (id: string) => void;
  onOpen: (event: Event) => void;
}) {
  return (
    <aside className="hidden lg:block">
      <div className="h-[calc(100dvh-200px)] space-y-2 overflow-y-auto pr-1">
        {events.length === 0 && (
          <p className="text-sm text-muted-foreground">No events match your filters.</p>
        )}
        {events.map((event) => (
          <button
            key={event.id}
            type="button"
            onClick={() => onSelect(event.id)}
            onDoubleClick={() => onOpen(event)}
            className={`flex w-full gap-3 rounded-2xl border p-2.5 text-left transition ${
              event.id === selectedId
                ? "border-primary bg-primary/10"
                : "border-border bg-white/5 hover:bg-white/10"
            }`}
          >
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg">
              <Image
                src={event.bannerUrl || "/images/events/default.jpg"}
                alt={event.title}
                fill
                className="object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-medium text-primary">{event.category}</p>
                {event.isLive && <EventStatusBadge event={event} compact />}
              </div>
              <h3 className="truncate text-sm font-semibold">{event.title}</h3>
              <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {new Date(event.startTime).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {userLocation && (
                <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {formatDistance(getDistanceKm(userLocation, event))}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
