"use client";

import { ArrowUpRight, Clock, MapPin } from "lucide-react";
import Image from "next/image";
import avatar from "../../public/vercel.svg";
import { NotificationsPopover } from "@/components/NotificationsPopover";
import { SearchPopover } from "@/components/SearchPopover";
import { useDataProvider } from "@/core/DataProviderContext";
import { User, Event } from "@/core/DataProvider";
import Link from "next/link";
import { EventCard } from "@/components/EventCard";

export default function Home() {
  const { user, loading } = useDataProvider();
  const { events, eventsLoading, eventsError } = User.useEvents(user, loading);
  const liveEvents = events.filter((e) => e.isLive);
  const upcomingEvents = events.filter((e) => !e.isLive);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b0c0e] text-foreground">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -left-28 -top-20 h-[380px] w-[380px] rounded-full bg-emerald-500/20 blur-[130px]" />

        <div className="absolute -right-24 top-[30%] h-[420px] w-[350px] rounded-full bg-green-500/15 blur-[140px]" />

        <div className="absolute -bottom-10 -left-10 h-[320px] w-[320px] rounded-full bg-emerald-400/20 blur-[120px]" />

        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0b0c0e]/40 to-[#0b0c0e]" />
      </div>

      <div className="relative z-10 pb-32">
        <div className="mx-auto max-w-7xl px-5 pt-10">
          <div className="relative z-40 flex items-center justify-between">
            <div className="">
              <p className="text-xl font-semibold leading-tight md:text-2xl">
                Hello, {user?.properties.username}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground md:text-base">
                Explore {liveEvents.length} events in Bucharest tonight
              </p>
            </div>
            <NotificationsPopover />
          </div>

          <div className="relative mt-6 h-11">
            <SearchPopover events={events as Event[]} />
          </div>

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
        <div className="mx-auto max-w-7xl">
          <div className="mt-4 flex gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory scroll-pl-5">
            {liveEvents.map((e) => (
              <EventCard key={e.id} event={e} live />
            ))}
          </div>
        </div>

        {/* Upcoming Events Section */}
        <div className="mx-auto max-w-7xl px-5">
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

        <div className="mx-auto max-w-7xl">
          <div className="mt-4 flex gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory scroll-pl-5">
            {upcomingEvents.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
