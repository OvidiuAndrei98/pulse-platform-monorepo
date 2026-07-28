"use client";

import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { User } from "@/core/DataProvider";

export function EventOrganizerUpdates({
  eventId,
  organizerId,
}: {
  eventId?: string;
  organizerId?: string;
}) {
  const byEvent = User.useEventUpdates(eventId ?? "");
  const byOrganizer = User.useOrganizerUpdates(organizerId ?? "");
  const { t } = useTranslation();
  const { updates, updatesLoading } = eventId ? byEvent : byOrganizer;

  if (updatesLoading) {
    return (
      <section>
        <h3 className="text-sm font-semibold text-foreground/90">
          {t("organizerUpdates.title")}
        </h3>
        <div className="mt-3 flex gap-3 overflow-hidden">
          {[0, 1].map((item) => (
            <div key={item} className="h-40 min-w-[10.5rem] animate-pulse bg-white/[0.05]" />
          ))}
        </div>
      </section>
    );
  }

  if (!updates.length) return null;

  return (
    <section>
      <h3 className="text-sm font-semibold text-foreground/90">
        {t("organizerUpdates.title")}
      </h3>
      <div className="mt-3 flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {updates.map((update) => (
          <article
            key={update.id}
            className="group relative h-44 min-w-[12rem] snap-start overflow-hidden border border-white/10 bg-black sm:min-w-[14rem]"
          >
            <img
              src={update.imageUrl}
              alt=""
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-3">
              {!eventId && (
                <Link
                  href={`/events/${update.eventId}`}
                  className="line-clamp-1 text-xs font-semibold text-primary hover:underline"
                >
                  {update.eventTitle}
                </Link>
              )}
              {update.caption && (
                <p className="mt-1 line-clamp-2 text-xs leading-4 text-white">{update.caption}</p>
              )}
              <p className="mt-2 flex items-center gap-1 text-[10px] text-white/65">
                <CalendarClock className="h-3 w-3" />
                {t("organizerUpdates.expires", {
                  time: new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(update.expiresAt)),
                })}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
