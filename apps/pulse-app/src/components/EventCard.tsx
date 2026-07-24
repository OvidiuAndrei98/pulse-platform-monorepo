"use client";

import Image from "next/image";
import Link from "next/link";
import { MapPin, Bookmark } from "lucide-react";
import { useEffect, useState } from "react";
import { Event } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";

interface EventCardProps {
  event: Event;
  className?: string;
  onBookmark?: (eventId: string) => void;
  live?: boolean;
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

const SAMPLE_ATTENDEES = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80",
];

export function EventCard({
  event,
  className = "",
  onBookmark,
  live,
}: EventCardProps) {
  const { user } = useDataProvider();
  const [favorited, setFavorited] = useState(Boolean(event.stats?.isFavorited));
  const formattedDate = formatEventDate(event.startTime);

  useEffect(() => setFavorited(Boolean(event.stats?.isFavorited)), [event.id, event.stats?.isFavorited]);

  const toggleFavorite = async () => {
    if (onBookmark) {
      onBookmark(event.id);
      return;
    }
    if (!user) return;
    const nextFavorite = !favorited;
    setFavorited(nextFavorite);
    try {
      await user.setEventFavorite(event.id, nextFavorite);
    } catch {
      setFavorited(!nextFavorite);
    }
  };

  return (
    <div
      /* 
        - Fundal mai transparent: bg-[#121217]/40 (sau bg-black/30)
        - Blur puțin / moderat: backdrop-blur-md
      */
      className={`group relative w-[250px] shrink-0 rounded-[24px] border border-white/10 bg-[#121217]/40 backdrop-blur-md p-2 shadow-xl transition-colors duration-200 hover:border-white/20 hover:bg-[#121217]/60 ${className}`}
    >
      <Link href={`/events/${event.id}`} className="block">
        {/* Imagine Wrapper */}
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[18px]">
          <Image
            src={event.bannerUrl || "/images/events/default.jpg"}
            alt={event.title}
            fill
            sizes="250px"
            className="transform-gpu object-cover transition-transform duration-300 will-change-transform group-hover:scale-105"
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

          {/* Badges Header */}
          <div className="absolute left-2.5 right-2.5 top-2.5 flex items-start justify-between">
            {live ? (
              <div className="inline-flex h-6 items-center gap-1.5 rounded-full border border-red-500/40 bg-red-950/60 px-2.5 backdrop-blur-sm">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative h-2 w-2 rounded-full bg-red-500" />
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-red-300">
                  LIVE NOW
                </span>
              </div>
            ) : (
              <div />
            )}

            <div className="rounded-full border border-white/15 bg-black/30 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 backdrop-blur-sm">
              {formattedDate}
            </div>
          </div>
        </div>

        {/* Content Info */}
        <div className="mt-2.5 p-1.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-base font-bold tracking-wide text-white">
              {event.title}
            </h3>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-zinc-300 backdrop-blur-xs">
              {event.category || "Music"}
            </span>

            <div className="flex items-center gap-1.5">
              <div className="flex -space-x-1.5 overflow-hidden">
                {SAMPLE_ATTENDEES.map((src, i) => (
                  <div
                    key={i}
                    className="relative h-5 w-5 rounded-full ring-1 ring-black/80"
                  >
                    <Image
                      src={src}
                      alt="Attendee"
                      fill
                      sizes="20px"
                      className="rounded-full object-cover"
                    />
                  </div>
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

      {/* Bookmark Button */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleFavorite();
        }}
        aria-label={favorited ? "Elimina din favorite" : "Salveaza evenimentul"}
        className={`absolute right-3.5 bottom-12 z-10 transition-colors ${favorited ? "text-primary" : "text-zinc-400 hover:text-white"}`}
      >
        <Bookmark className={`h-4 w-4 ${favorited ? "fill-current" : ""}`} />
      </button>
    </div>
  );
}
