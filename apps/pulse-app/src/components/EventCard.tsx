"use client";

import Image from "next/image";
import Link from "next/link";
import { MapPin, Bookmark } from "lucide-react";
import { useEffect, useState } from "react";
import { Event } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { EventFriendsPreview } from "@/components/social/EventFriendsPreview";

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

export function EventCard({
  event,
  className = "",
  onBookmark,
  live,
}: EventCardProps) {
  const { user } = useDataProvider();
  const [favorited, setFavorited] = useState(Boolean(event.stats?.isFavorited));
  const formattedDate = formatEventDate(event.startTime);

  useEffect(
    () => setFavorited(Boolean(event.stats?.isFavorited)),
    [event.id, event.stats?.isFavorited],
  );

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
      className={`group relative w-[260px] shrink-0 rounded-[24px] border border-white/10 bg-[#121217]/40 backdrop-blur-md p-2 shadow-2xl transition-all duration-200 hover:border-white/20 hover:bg-[#121217]/60 ${className}`}
    >
      <Link href={`/events/${event.id}`} className="block">
        {/* 1. CONTAINER IMAGINE */}
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[18px]">
          <Image
            src={event.bannerUrl || "/images/events/default.jpg"}
            alt={event.title}
            fill
            sizes="260px"
            className="transform-gpu object-cover transition-transform duration-300 will-change-transform group-hover:scale-105"
          />

          {/* Overlays / Gradientul tau original peste poza */}
          <div className="absolute inset-0 bg-black/20" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

          {/* BADGES HEADER (Peste imagine) */}
          <div className="absolute left-2.5 right-2.5 top-2.5 flex items-start justify-between z-10">
            {live ? (
              <div className="inline-flex h-6 items-center gap-1.5 rounded-full border border-red-500/30 bg-black/60 px-2.5 backdrop-blur-md shadow-lg">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative h-2 w-2 rounded-full bg-red-500" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
                  LIVE NOW
                </span>
              </div>
            ) : (
              <div />
            )}

            <div className="rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-md shadow-lg">
              {formattedDate}
            </div>
          </div>
        </div>

        {/* 2. CORPUL CARDULUI */}
        <div className="mt-3 p-1 space-y-2.5">
          {/* Titlu - Capitalized & Crisp */}
          <h3 className="truncate text-base font-bold tracking-tight text-white capitalize">
            {event.title.toLowerCase()}
          </h3>

          {/* Rândul 2: Category + Social Preview + Bookmark */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {/* Category Pill */}
              <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-zinc-300">
                {event.category || "Music"}
              </span>

              {/* Friends Avatars / Counter */}
              <EventFriendsPreview eventId={event.id} />
            </div>

            {/* Bookmark Button */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleFavorite();
              }}
              aria-label={
                favorited ? "Elimina din favorite" : "Salveaza evenimentul"
              }
              className={`p-1 transition-transform active:scale-90 ${
                favorited ? "text-primary" : "text-zinc-400 hover:text-white"
              }`}
            >
              <Bookmark
                className={`h-5 w-5 ${favorited ? "fill-current" : ""}`}
              />
            </button>
          </div>

          {/* Rândul 3: Locația */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-300/80 pt-0.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <span className="truncate">
              {event.locationName || "Locație neprecizată"}
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
