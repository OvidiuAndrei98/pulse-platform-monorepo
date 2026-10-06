"use client";

import Image from "next/image";
import { MapPin, Bookmark, CheckCircle2, Megaphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Event } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { EventFriendsPreview } from "@/components/social/EventFriendsPreview";
import { formatEventDateShort } from "@/features/events/dateFormat";
import { useEventDetails } from "@/components/EventDetailsSheet";

interface EventCardProps {
  event: Event;
  eagerImage?: boolean;
  className?: string;
  onBookmark?: (eventId: string) => void;
  live?: boolean;
  promoted?: boolean;
  onOpen?: () => void;
  onVisible?: () => void;
}

export function EventCard({
  event,
  eagerImage = false,
  className = "",
  onBookmark,
  live,
  promoted = false,
  onOpen,
  onVisible,
}: EventCardProps) {
  const { t, i18n } = useTranslation();
  const { user } = useDataProvider();
  const { open } = useEventDetails();
  const [favorited, setFavorited] = useState(Boolean(event.stats?.isFavorited));
  const cardRef = useRef<HTMLDivElement>(null);

  const formattedDate = formatEventDateShort(event.startTime);

  // Formatăm ora scurt în format de 24 ore (ex: 22:00)
  const formattedTime = new Date(event.startTime).toLocaleTimeString(
    i18n.language || "ro",
    { hour: "2-digit", minute: "2-digit", hour12: false },
  );

  useEffect(
    () => setFavorited(Boolean(event.stats?.isFavorited)),
    [event.id, event.stats?.isFavorited],
  );
  useEffect(() => {
    if (!onVisible || !cardRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || entry.intersectionRatio < 0.4) return;
        onVisible();
        observer.disconnect();
      },
      { threshold: [0.4] },
    );
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [event.id, onVisible]);

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
  const openEvent = () => {
    onOpen?.();
    open(event);
  };

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      onClick={openEvent}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
          keyboardEvent.preventDefault();
          openEvent();
        }
      }}
      className={`group relative w-[220px] md:w-[260px] shrink-0 cursor-pointer rounded-[26px]  border-white/5 bg-gradient-to-b from-[#141414] via-[#090909] to-[#0a0a0a] p-2 shadow-none transition-all duration-200 hover:border-white/20 hover:from-[#16161c] hover:to-[#0c0c0f] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
    >
      <div className="block">
        {/* 1. CONTAINER IMAGINE */}
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[18px]">
          <Image
            src={event.bannerUrl || "/party-event.webp"}
            alt={event.title}
            loading={eagerImage ? "eager" : "lazy"}
            fill
            sizes="260px"
            className="transform-gpu object-cover transition-transform duration-300 will-change-transform group-hover:scale-105"
          />

          {/* Overlays */}
          <div className="absolute inset-0 bg-black/20" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

          {/* BADGES HEADER */}
          <div className="absolute left-2.5 right-2.5 top-2.5 z-10 flex items-start justify-between">
            {live ? (
              <div className="inline-flex h-6 items-center gap-1.5 rounded-full border border-red-500/30 bg-black/60 px-2.5 backdrop-blur-md">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative h-2 w-2 rounded-full bg-red-500" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
                  {t("common.liveNow")}
                </span>
              </div>
            ) : promoted ? (
              <div className="inline-flex h-6 items-center gap-1.5 rounded-full border border-primary/30 bg-black/65 px-2.5 text-primary backdrop-blur-md">
                <Megaphone className="h-3 w-3" />
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  {t("promotions.sponsored")}
                </span>
              </div>
            ) : (
              <div />
            )}

            {/* Capsulei cu Ora/Data i s-au aplicat exact aceleași clase de dimensiune: h-6, inline-flex, items-center */}
            <div className="inline-flex h-6 items-center rounded-full border border-white/10 bg-black/60 px-2.5 text-[10px] font-semibold text-white/90 backdrop-blur-md">
              {live ? formattedTime : formattedDate}
            </div>
          </div>
          {event.organizerAbsorbsServiceFee && (
            <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-full border border-primary/35 bg-black/65 px-2 py-1 text-[10px] font-semibold text-primary backdrop-blur-md">
              <CheckCircle2 className="h-3 w-3" /> {t("events.finalPrice")}
            </span>
          )}
        </div>

        {/* 2. CORPUL CARDULUI */}
        <div className="mt-1 space-y-2 p-1">
          {/* Titlu */}
          <div className="flex items-center justify-between">
            <h3 className="truncate text-base font-bold tracking-tight text-white capitalize">
              {event.title.toLowerCase()}
            </h3>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleFavorite();
              }}
              aria-label={
                favorited
                  ? t("eventSheet.removeFavorite")
                  : t("eventSheet.addFavorite")
              }
              className={`py-1 pl-1 transition-transform active:scale-90 ${
                favorited ? "text-primary" : "text-zinc-400 hover:text-white"
              }`}
            >
              <Bookmark
                className={`h-5 w-5 ${favorited ? "fill-current" : ""}`}
              />
            </button>
          </div>

          {/* Rândul 2: Category + Social Preview */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-white/10 bg-white/5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-300">
                {event.category || t("events.generalCategory")}
              </span>

              <EventFriendsPreview eventId={event.id} />
            </div>
          </div>

          {/* Rândul 3: Locația */}
          <div className="flex items-center gap-1.5 pt-0.5 text-xs text-zinc-300/80">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <span className="truncate">
              {event.locationName || t("events.locationUnknown")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
