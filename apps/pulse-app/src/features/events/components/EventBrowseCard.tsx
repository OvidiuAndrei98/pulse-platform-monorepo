import Image from "next/image";
import { ArrowUpRight, CheckCircle2, Clock, MapPin } from "lucide-react";
import { Event } from "@/core/DataProvider";
import { useEventDetails } from "@/components/EventDetailsSheet";
import { EventStatusBadge } from "@/features/events/components/EventStatusBadge";
import { Coordinates } from "@/features/events/types";
import { formatDistance, getDistanceKm } from "@/features/events/utils";
import { EventFriendsPreview } from "@/components/social/EventFriendsPreview";

export function EventBrowseCard({
  event,
  userLocation,
}: {
  event: Event;
  userLocation: Coordinates | null;
}) {
  const { open } = useEventDetails();

  return (
    <button
      type="button"
      onClick={() => open(event)}
      data-event-card
      className="event-card relative block w-full overflow-hidden rounded-3xl border border-border text-left"
    >
      <div className="relative h-56 w-full">
        <Image
          src={event.bannerUrl || "/images/events/default.jpg"}
          alt={event.title}
          fill
          className="object-cover"
        />
      </div>
      <div className="absolute inset-0 bg-black/25" />
      <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/55 to-transparent" />

      <div className="absolute left-4 right-4 top-4 flex flex-wrap items-center gap-2">
        <EventStatusBadge event={event} />
        {event.organizerAbsorbsServiceFee && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/35 bg-primary/15 px-2 py-1 text-[10px] font-semibold text-primary backdrop-blur">
            <CheckCircle2 className="h-3 w-3" /> Preț final
          </span>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-5">
        <p className="text-xs font-medium text-primary">{event.category}</p>
        <h3 className="mt-1 text-lg font-semibold leading-tight">
          {event.title}
        </h3>
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {event.startTime && new Date(event.startTime).toLocaleTimeString()}
          </span>
          {userLocation && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {formatDistance(getDistanceKm(userLocation, event))}
            </span>
          )}
        </div>
        <EventFriendsPreview eventId={event.id} className="mt-3" />
        <span
          aria-hidden
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
        >
          View event <ArrowUpRight className="h-4 w-4" strokeWidth={2.4} />
        </span>
      </div>
    </button>
  );
}
