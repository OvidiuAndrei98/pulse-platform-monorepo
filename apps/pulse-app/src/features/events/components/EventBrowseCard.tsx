import Image from "next/image";
import { ArrowUpRight, Calendar, CheckCircle2, MapPin, Megaphone } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Event } from "@/core/DataProvider";
import { useEventDetails } from "@/components/EventDetailsSheet";
import { EventStatusBadge } from "@/features/events/components/EventStatusBadge";
import { Coordinates } from "@/features/events/types";
import { formatDistance, getDistanceKm } from "@/features/events/utils";
import {
  formatEventDateShort,
  formatEventTime,
} from "@/features/events/dateFormat";
import { EventFriendsPreview } from "@/components/social/EventFriendsPreview";

export function EventBrowseCard({
  event,
  userLocation,
  promoted = false,
  onOpen,
  onVisible,
}: {
  event: Event;
  userLocation: Coordinates | null;
  promoted?: boolean;
  onOpen?: () => void;
  onVisible?: () => void;
}) {
  const { open } = useEventDetails();
  const { t } = useTranslation();
  const cardRef = useRef<HTMLButtonElement>(null);
  const eventDate = event.startTime
    ? `${formatEventDateShort(event.startTime)} · ${formatEventTime(event.startTime)}`
    : null;

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

  const openEvent = () => {
    onOpen?.();
    open(event);
  };

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={openEvent}
      data-event-card
      className="event-card group block w-full text-left transition-all duration-300 active:scale-[0.99] sm:relative sm:overflow-hidden sm:rounded-[26px] sm:border sm:border-white/10 sm:bg-black sm:hover:border-white/20"
    >
      <div className="sm:hidden">
        <div className="relative aspect-square w-full overflow-hidden rounded-[20px]   bg-black">
          <Image
            src={event.bannerUrl || "/images/events/default.jpg"}
            alt={event.title}
            fill
            sizes="(max-width: 639px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-black/15" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20" />

          <div className="absolute left-2.5 right-2.5 top-2.5 flex items-start justify-between gap-2">
            <span className="rounded-full border border-white/15 bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/90 backdrop-blur-md">
              <span className="inline-flex items-center gap-1">
                {promoted && <Megaphone className="h-3 w-3 text-primary" />}
                {event.category || t("events.generalCategory")}
              </span>
            </span>
            {event.isLive && (
              <span className="rounded-full border border-red-500/40 bg-red-500/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-red-400 backdrop-blur-md">
                <span className="relative mr-1 inline-flex h-1.5 w-1.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-red-400" />
                </span>
                {t("events.liveNow")}
              </span>
            )}
          </div>

          <span className="absolute bottom-2.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-white/90 backdrop-blur-md">
            {formatEventDateShort(event.startTime)} ·{" "}
            {formatEventTime(event.startTime)}
          </span>
        </div>

        <div className="mt-2 px-1">
          <h3 className="truncate text-sm font-bold leading-tight text-white">
            {event.title}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">
              {event.locationName || t("events.locationUnknown")}
            </span>
          </p>
        </div>
      </div>

      <div className="hidden sm:block">
        <div className="relative h-64 w-full overflow-hidden">
          <Image
            src={event.bannerUrl || "/images/events/default.jpg"}
            alt={event.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-black/15" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent" />
        </div>

        <div className="absolute left-4 right-4 top-4 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <EventStatusBadge event={event} />
            {promoted && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/35 bg-black/55 px-2 py-1 text-[10px] font-semibold text-primary backdrop-blur">
                <Megaphone className="h-3 w-3" /> {t("promotions.sponsored")}
              </span>
            )}
            {event.organizerAbsorbsServiceFee && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/35 bg-primary/15 px-2 py-1 text-[10px] font-semibold text-primary backdrop-blur">
                <CheckCircle2 className="h-3 w-3" /> {t("events.finalPrice")}
              </span>
            )}
          </div>
          <span
            aria-label={t("events.viewEvent")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white backdrop-blur-md transition-transform group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground"
          >
            <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} />
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary drop-shadow-sm">
            {event.category}
          </p>
          <h3 className="mt-1 text-lg font-bold leading-tight text-white drop-shadow-md transition-colors group-hover:text-primary">
            {event.title}
          </h3>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-zinc-300 drop-shadow">
            {eventDate && (
              <span className="flex shrink-0 items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-primary" />
                {eventDate}
              </span>
            )}
            {event.locationName && (
              <span className="flex min-w-0 items-center gap-1.5 truncate">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate">{event.locationName}</span>
                {userLocation && (
                  <span className="shrink-0 opacity-70">
                    ({formatDistance(getDistanceKm(userLocation, event))})
                  </span>
                )}
              </span>
            )}
          </div>
          <EventFriendsPreview
            eventId={event.id}
            className="mt-3 border-t border-white/15 pt-3"
          />
        </div>
      </div>
    </button>
  );
}
