import Image from "next/image";
import { Clock, MapPin } from "lucide-react";
import { Event } from "@/core/DataProvider";
import { Coordinates } from "@/features/events/types";
import { formatDistance, getDistanceKm } from "@/features/events/utils";
import { EventStatusBadge } from "@/features/events/components/EventStatusBadge";
import { formatEventTime } from "@/features/events/dateFormat";

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
      <div className="h-[calc(100dvh-200px)] space-y-2.5 overflow-y-auto pr-1">
        {events.length === 0 && (
          <p className="p-2 text-sm text-zinc-400">
            No events match your filters.
          </p>
        )}
        {events.map((event) => {
          const isSelected = event.id === selectedId;

          return (
            <button
              key={event.id}
              type="button"
              onClick={() => onSelect(event.id)}
              onDoubleClick={() => onOpen(event)}
              className={`group flex w-full items-center gap-3 rounded-[24px] border p-2.5 text-left antialiased transition-all duration-300 transform-gpu ${
                isSelected
                  ? "border-primary/50 bg-primary/10 shadow-[0_0_20px_rgba(255,255,255,0.08)]"
                  : "border-white/10 bg-white/[0.04] shadow-lg hover:border-white/20 hover:bg-white/[0.07]"
              }`}
            >
              {/* Image Container */}
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[16px]">
                <Image
                  src={event.bannerUrl || "/images/events/default.jpg"}
                  alt={event.title}
                  fill
                  sizes="64px"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>

              {/* Details Content */}
              <div className="min-w-0 flex-1">
                {/* 1. SUS: Titlul Evenimentului */}
                <h3 className="truncate text-sm font-bold leading-snug tracking-wide text-white">
                  {event.title}
                </h3>

                {/* 2. MIJLOC: Ora & Distanța */}
                <div className="mt-1 flex items-center gap-3 text-xs leading-none text-zinc-400">
                  <span className="inline-flex items-center gap-1.5 text-zinc-300">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    {formatEventTime(event.startTime)}
                  </span>

                  {userLocation && (
                    <span className="inline-flex items-center gap-1.5 text-zinc-400">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {formatDistance(getDistanceKm(userLocation, event))}
                    </span>
                  )}
                </div>

                {/* 3. JOS: Badges (Categorie + Status Live) */}
                <div className="mt-2 flex items-center gap-2">
                  {/* Badge Categorie */}
                  <span className="inline-flex h-6 items-center rounded-full border border-white/10 bg-white/10 px-2 text-[10px] font-semibold uppercase leading-none text-zinc-200 md:backdrop-blur-sm">
                    {event.category || "General"}
                  </span>

                  {/* Badge Live Status */}
                  {event.isLive && (
                    <EventStatusBadge
                      event={event}
                      compact
                      className="!h-6 !text-[10px] !font-semibold !uppercase"
                    />
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
