"use client";

import { ArrowUpRight, Clock, MapPin } from "lucide-react";
import Image from "next/image";
import avatar from "../../public/vercel.svg";
import { NotificationsPopover } from "@/components/NotificationsPopover";
import { SearchPopover } from "@/components/SearchPopover";
import { allEvents, type Event } from "@/core/events";

export default function Home() {
  const liveEvents = allEvents.filter((e) => e.isLive);
  const upcomingEvents = allEvents.filter((e) => !e.isLive);

  return (
    <div className="relative min-h-screen bg-background pb-32 text-foreground">
      <div className="mx-auto max-w-5xl px-5 pt-10">
        {/* Top bar */}
        <div className="relative z-40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src={avatar}
              alt="Sarah Johnson"
              width={44}
              height={44}
              priority
              className="h-11 w-11 rounded-full object-cover ring-2 ring-primary/40"
            />
            <div className="leading-tight">
              <p className="text-sm font-semibold">Sarah Johnson</p>
              <p className="text-xs text-muted-foreground">Good Morning</p>
            </div>
          </div>
          <NotificationsPopover />
        </div>

        {/* Compact greeting */}
        <div className="mt-6">
          <p className="text-xl font-semibold leading-tight md:text-2xl">
            Hello, Sarah
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground md:text-base">
            Explore {allEvents.length} events in Bucharest tonight
          </p>
        </div>

        {/* Search */}
        <div className="relative mt-6 h-11">
          <SearchPopover />
        </div>

        {/* Live Now */}
        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-base font-semibold md:text-lg">Live Now</h2>
          <button
            type="button"
            className="text-xs text-muted-foreground md:text-sm"
          >
            See all
          </button>
        </div>
      </div>

      {/* Live Events Section */}
      <div className="mx-auto max-w-5xl">
        <div className="mt-4 flex gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory scroll-pl-5">
          {liveEvents.map((e) => (
            <EventCard key={e.id} event={e} live />
          ))}
        </div>
      </div>

      {/* Upcoming Events Section */}
      <div className="mx-auto max-w-5xl px-5">
        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-base font-semibold md:text-lg">
            Upcoming Events
          </h2>
          <button
            type="button"
            className="text-xs text-muted-foreground md:text-sm"
          >
            Sort by
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-5xl">
        <div className="mt-4 flex gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory scroll-pl-5">
          {upcomingEvents.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      </div>
    </div>
  );
}

function EventCard({ event, live = false }: { event: Event; live?: boolean }) {
  return (
    <div className="relative w-[78%] shrink-0 snap-start overflow-hidden rounded-3xl border border-border md:w-[300px] lg:w-[320px]">
      <div className="relative h-72 w-full">
        <Image
          src={event.image}
          alt={event.title}
          fill
          sizes="(max-width: 768px) 78vw, (max-width: 1024px) 300px, 320px"
          loading="lazy"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/30 to-transparent" />
      </div>

      {/* Badges */}
      <div className="absolute left-4 right-4 top-4 flex flex-wrap items-center gap-2 z-10">
        {live ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-red-400 backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            Live Now
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-background/50 px-3 py-1.5 text-[11px] text-foreground backdrop-blur">
            <Clock className="h-3 w-3" /> {event.time}
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-background/50 px-3 py-1.5 text-[11px] text-foreground backdrop-blur">
          <MapPin className="h-3 w-3" /> {event.location}
        </span>
      </div>

      {/* Content */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5 z-10">
        <div className="min-w-0 flex-1 pr-3">
          <p className="text-xs font-medium text-primary">{event.category}</p>
          <p className="mt-1 text-xl font-semibold leading-tight truncate">
            {event.title}
          </p>
        </div>
        <button
          type="button"
          aria-label="Open event"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_24px_rgba(163,255,64,0.55)] transition-transform active:scale-95"
        >
          <ArrowUpRight className="h-5 w-5" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
