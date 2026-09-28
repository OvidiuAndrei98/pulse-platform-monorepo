"use client";

import { Bookmark } from "lucide-react";
import type { Event } from "@/core/DataProvider";
import { useEventDetails } from "@/components/EventDetailsSheet";
import { formatEventDateShort } from "@/features/events/dateFormat";

export function SavedEventCard({ event }: { event: Event }) {
  const { open } = useEventDetails();
  return (
    <button
      type="button"
      onClick={() => open(event)}
      className="group flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:bg-white/[0.06]"
    >
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white/5">
        {event.bannerUrl && <img src={event.bannerUrl} alt="" className="h-full w-full object-cover" loading="lazy" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{event.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {event.locationName} · {formatEventDateShort(event.startTime)}
        </p>
      </div>
      <Bookmark className="h-4 w-4 shrink-0 fill-primary text-primary" />
    </button>
  );
}
