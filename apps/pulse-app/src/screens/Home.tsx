"use client";

import { useState } from "react";
import { Search, ArrowUpRight, Clock, MapPin } from "lucide-react";
import Image from "next/image"; // Înlocuit eticheta nativă <img> cu componenta nativă Next.js pentru performanță
import partyImage from "../../public/party-event.jpg";
import { NotificationsPopover } from "@/components/NotificationsPopover";
import { FiltersSheet } from "@/components/FiltersSheet";

const categories = ["All", "Social", "Music", "Fashion"] as const;

export default function HomePage() {
  const [active, setActive] = useState<(typeof categories)[number]>("All");

  return (
    // Adăugat scrollbar-gutter: stable sub formă de stil inline sau clasă pentru a bloca lățimea ferestrei când dispare scroll-ul
    <div
      className="relative min-h-screen bg-background pb-32 text-foreground select-none"
      style={{ scrollbarGutter: "stable" }}
    >
      <div className="mx-auto max-w-5xl px-5 pt-10">
        {/* Top bar - static sau relativ curat, fără overflow strâns */}
        <div className="relative z-40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="leading-tight">
              <p className="text-sm font-semibold">Sarah Johnson</p>
              <p className="text-xs text-muted-foreground">Good Morning</p>
            </div>
          </div>

          {/* Container izolat pentru a asigura alinierea corectă a clopoțelului în interiorul headerului */}
          <div className="flex items-center justify-end min-h-10 min-w-10">
            <NotificationsPopover />
          </div>
        </div>

        {/* Compact greeting */}
        <div className="mt-6">
          <p className="text-xl font-semibold leading-tight md:text-2xl">
            Hello, Sarah
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground md:text-base">
            Explore 12 events in Bucharest tonight
          </p>
        </div>

        {/* Search & Filters */}
        <div className="mt-6 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-full border border-border bg-surface/70 px-4 py-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search events..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <FiltersSheet />
        </div>

        {/* Categories */}
        <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categories.map((c) => {
            const isOn = c === active;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setActive(c)}
                className={
                  "shrink-0 rounded-full px-5 py-2 text-sm font-medium transition-colors " +
                  (isOn
                    ? "bg-primary text-primary-foreground shadow-[0_0_20px_rgba(163,255,64,0.4)]"
                    : "border border-border bg-surface/60 text-foreground/80")
                }
              >
                {c}
              </button>
            );
          })}
        </div>

        {/* Live Now Header */}
        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-base font-semibold md:text-lg">Live Now</h2>
          <button className="text-xs text-muted-foreground md:text-sm">
            See all
          </button>
        </div>
      </div>

      {/* Live Events Carousel */}
      <div className="mx-auto max-w-5xl mt-4">
        <div className="flex w-full gap-4 overflow-x-auto px-5 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory scroll-pl-5">
          {liveEvents.map((e) => (
            <EventCard key={e.title} event={e} live />
          ))}
        </div>
      </div>

      {/* Upcoming Events Header */}
      <div className="mx-auto max-w-5xl px-5">
        <div className="mt-6 flex items-center justify-between">
          <h2 className="text-base font-semibold md:text-lg">
            Upcoming Events
          </h2>
          <button className="text-xs text-muted-foreground md:text-sm">
            Sort by
          </button>
        </div>
      </div>

      {/* Upcoming Events Carousel */}
      <div className="mx-auto max-w-5xl mt-4">
        <div className="flex w-full gap-4 overflow-x-auto px-5 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory scroll-pl-5">
          {upcomingEvents.map((e) => (
            <EventCard key={e.title} event={e} />
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Date și Componente ---

type EventItem = {
  title: string;
  category: string;
  time: string;
  location: string;
  image: any; // Schimbat tipul pentru a suporta corect importurile de imagini statice din Next.js
};

const liveEvents: EventItem[] = [
  {
    title: "Neon Warehouse",
    category: "Rave Party",
    time: "Ends 4 AM",
    location: "Docks 7",
    image: partyImage,
  },
  {
    title: "Sunset Rooftop",
    category: "House Session",
    time: "Ends 2 AM",
    location: "Skybar",
    image: partyImage,
  },
  {
    title: "Basement Beats",
    category: "Techno Night",
    time: "Ends 5 AM",
    location: "Club 23",
    image: partyImage,
  },
];

const upcomingEvents: EventItem[] = [
  {
    title: "Michael and Anthonia Party",
    category: "Party Event",
    time: "12 Sep · 10 PM",
    location: "Shiho B1056",
    image: partyImage,
  },
  {
    title: "Summer Fest",
    category: "Festival",
    time: "18 Sep · 6 PM",
    location: "Central Park",
    image: partyImage,
  },
  {
    title: "Retro Disco Night",
    category: "Disco",
    time: "22 Sep · 9 PM",
    location: "Loft 12",
    image: partyImage,
  },
];

function EventCard({
  event,
  live = false,
}: {
  event: EventItem;
  live?: boolean;
}) {
  return (
    <div className="relative w-[82vw] min-w-[82vw] shrink-0 snap-start overflow-hidden rounded-3xl border border-border sm:w-[300px] sm:min-w-[300px] md:w-[320px] md:min-w-[320px]">
      <Image
        src={event.image}
        alt={event.title}
        placeholder="blur" // Oferă un efect elegant de încărcare imaginii
        loading="lazy"
        className="h-80 w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

      <div className="absolute left-4 right-4 top-4 flex flex-wrap items-center gap-1.5">
        {live ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-red-400 backdrop-blur-md">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
            </span>
            Live Now
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur-md">
            <Clock className="h-3 w-3" /> {event.time}
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur-md max-w-[150px] truncate">
          <MapPin className="h-3 w-3 shrink-0" /> {event.location}
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5">
        <div className="min-w-0 pr-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            {event.category}
          </p>
          <p className="mt-1 text-lg font-bold leading-tight text-white truncate">
            {event.title}
          </p>
        </div>
        <button
          type="button"
          aria-label="Open event"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_20px_rgba(163,255,64,0.45)] transition-transform active:scale-95"
        >
          <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
