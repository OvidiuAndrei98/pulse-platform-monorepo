"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Event } from "@/core/DataProvider";
import { EventCard } from "@/components/EventCard";

export function HomeEventCarousel({
  title,
  events,
  live = false,
  emptyMessage,
  seeAllHref = "/events",
}: {
  title: string;
  events: readonly Event[];
  live?: boolean;
  emptyMessage: string;
  seeAllHref?: string;
}) {
  const { t } = useTranslation();
  const railRef = useRef<HTMLDivElement>(null);
  const scroll = (direction: -1 | 1) => {
    railRef.current?.scrollBy({ left: direction * 560, behavior: "smooth" });
  };

  return (
    <section className="mt-9">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5">
        <h2 className="text-base font-semibold md:text-lg">{title}</h2>
        <div className="flex items-center gap-1.5">
          <div className="hidden items-center gap-1 sm:flex">
            <button
              type="button"
              onClick={() => scroll(-1)}
              aria-label={`${t("common.back")} ${title}`}
              title={t("common.back")}
              className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-muted-foreground transition hover:border-white/20 hover:bg-white/[0.08] hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scroll(1)}
              aria-label={`${t("common.seeAll")} ${title}`}
              title={t("common.seeAll")}
              className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-muted-foreground transition hover:border-white/20 hover:bg-white/[0.08] hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <Link
            href={seeAllHref}
            className="ml-1 inline-flex h-8 items-center rounded-full    text-xs font-semibold text-primary transition-opacity hover:opacity-80"
          >
            {t("common.seeAll")}
          </Link>
        </div>
      </div>

      {events.length ? (
        <div
          ref={railRef}
          className="mx-auto mt-4 flex max-w-7xl snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-5 pb-2 scroll-pl-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              live={live || event.isLive}
            />
          ))}
        </div>
      ) : (
        <div className="mx-auto mt-4 max-w-7xl px-5">
          <div className="border border-dashed border-white/15 px-4 py-5 text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        </div>
      )}
    </section>
  );
}
