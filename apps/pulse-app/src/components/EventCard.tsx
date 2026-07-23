"use client";

import Image from "next/image";
import Link from "next/link";
import { MapPin, Bookmark } from "lucide-react";
import { Event } from "@/core/DataProvider";

interface EventCardProps {
  event: Event;
  className?: string;
  onBookmark?: (eventId: string) => void;
}

function formatEventDate(dateString?: string): string {
  if (!dateString) return "25 Dec";

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  const day = date.getDate();
  const month = date
    .toLocaleDateString("ro-RO", { month: "short" })
    .replace(".", "");
  const formattedMonth = month.charAt(0).toUpperCase() + month.slice(1);

  return `${day} ${formattedMonth}`;
}

export function EventCard({
  event,
  className = "",
  onBookmark,
}: EventCardProps) {
  const sampleAttendees = [
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80",
  ];

  const formattedDate = formatEventDate(event.startTime);

  return (
    <div
      className={`group relative w-[250px] shrink-0 rounded-[24px] border border-white/10 bg-white/[0.04] p-2 shadow-2xl backdrop-blur-2xl transition-all duration-300 hover:border-white/20 hover:bg-white/[0.07] ${className}`}
    >
      <Link href={`/events/${event.id}`} className="block">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[18px]">
          <Image
            src={event.bannerUrl || "/images/events/default.jpg"}
            alt={event.title}
            fill
            sizes="250px"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

          <div className="absolute left-2.5 right-2.5 top-2.5 flex items-start justify-between">
            {event.isLive ? (
              <div className="inline-flex h-6 items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/15 px-2.5 backdrop-blur-xl">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative h-2 w-2 rounded-full bg-red-500" />
                </span>

                <span className=" text-[10px] font-semibold uppercase tracking-wide text-red-300">
                  LIVE NOW
                </span>
              </div>
            ) : (
              <div />
            )}

            <div className="rounded-full border border-white/20 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 backdrop-blur-md">
              {formattedDate}
            </div>
          </div>
        </div>

        <div className="mt-2.5 p-1.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-bold tracking-wide text-white truncate">
              {event.title}
            </h3>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                if (onBookmark) onBookmark(event.id);
              }}
              aria-label="Save event"
              className="mt-0.5 text-zinc-400 hover:text-white transition-colors"
            >
              <Bookmark className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full bg-white/10 border border-white/10 px-2.5 py-0.5 text-[11px] font-medium text-zinc-200 backdrop-blur-sm">
              {event.category || "Music"}
            </span>

            <div className="flex items-center gap-1">
              <div className="flex -space-x-1.5 overflow-hidden">
                {sampleAttendees.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt="Attendee"
                    className="inline-block h-5 w-5 rounded-full ring-1 ring-black/50 object-cover"
                  />
                ))}
              </div>
              <span className="text-[10px] font-medium text-zinc-400">
                40k+ Going
              </span>
            </div>
          </div>

          <div className="mt-2.5 flex items-center gap-1 text-[11px] text-zinc-400">
            <MapPin className="h-3 w-3 shrink-0 text-zinc-400" />
            <span className="truncate">
              {event.locationName || "Grand Avenue, Indonesia"}
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
