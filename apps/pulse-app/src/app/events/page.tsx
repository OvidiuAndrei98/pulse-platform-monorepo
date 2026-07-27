"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { FiltersSheet } from "@/components/FiltersSheet";
import { Event, PublicEventsService } from "@/core/DataProvider";
import {
  cityCenters,
  defaultEventFilters,
  eventDateFilters,
} from "@/features/events/constants";
import { EventBrowseCard } from "@/features/events/components/EventBrowseCard";
import { EventViewToggle } from "@/features/events/components/EventViewToggle";
import { getEventDateRange } from "@/features/events/dateFilters";
import { Coordinates, EventFilters } from "@/features/events/types";

const EventsMapLayout = dynamic(
  () =>
    import("@/features/events/components/EventsMapLayout").then(
      (module) => module.EventsMapLayout,
    ),
  {
    ssr: false,
    loading: () => <div className="h-dvh bg-black lg:h-[calc(100dvh-200px)]" />,
  },
);

function getDateFilter(value: string | null) {
  return eventDateFilters.includes(value as (typeof eventDateFilters)[number])
    ? value!
    : defaultEventFilters.date;
}

export default function EventsPage() {
  return (
    <Suspense fallback={<div className="h-dvh bg-background" />}>
      <EventsPageContent />
    </Suspense>
  );
}

function EventsPageContent() {
  const searchParams = useSearchParams();
  const requestedDate = getDateFilter(searchParams.get("date"));
  const [filters, setFilters] = useState<EventFilters>(() => ({
    ...defaultEventFilters,
    date: requestedDate,
  }));
  const [view, setView] = useState<"list" | "map">("list");
  const [events, setEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const selectedCityCenter = filters.city
    ? (cityCenters[filters.city] ?? null)
    : null;

  useEffect(() => {
    setFilters((current) =>
      current.date === requestedDate
        ? current
        : { ...current, date: requestedDate },
    );
  }, [requestedDate]);

  const eventQuery = useMemo(
    () => ({
      category: filters.categories.join(",") || undefined,
      city: filters.city || undefined,
      vibe: filters.vibes.join(",") || undefined,
      ...getEventDateRange(filters.date),
    }),
    [filters.categories, filters.city, filters.date, filters.vibes],
  );

  useEffect(() => {
    let active = true;
    setEventsLoading(true);

    PublicEventsService.getPublicEvents(eventQuery)
      .then((nextEvents) => {
        if (active) setEvents(nextEvents);
      })
      .catch((error) => {
        console.error("Failed to filter events:", error);
        if (active) setEvents([]);
      })
      .finally(() => {
        if (active) setEventsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventQuery]);

  return (
    <div className="relative h-dvh overflow-hidden overscroll-none text-foreground">
      <div
        className={`relative h-full ${
          view === "map"
            ? "pointer-events-none fixed inset-x-0 top-0 z-30 mx-auto max-w-7xl px-5 pt-[20px] lg:static lg:pointer-events-auto lg:pt-10"
            : "flex flex-col"
        }`}
      >
        <div className={`relative z-20 flex flex-wrap items-start justify-between gap-3 sm:items-center ${view === "list" ? "mx-auto w-full max-w-7xl px-5 pt-10" : ""}`}>
          <div
            className={`flex  items-center gap-2 sm:w-auto ${view === "map" ? "pointer-events-auto" : ""}`}
          >
            <EventViewToggle view={view} onChange={setView} />
            <FiltersSheet value={filters} onChange={setFilters} />
          </div>
        </div>

        {view === "list" ? (
          <>
            <div className="mt-6 min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="mx-auto w-full max-w-7xl px-5 pb-28">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {eventsLoading
                  ? Array.from({ length: 6 }, (_, index) => (
                      <div
                        key={index}
                        className="event-card h-56 animate-pulse border border-white/10 bg-white/[0.04]"
                      />
                    ))
                  : events.map((event) => (
                      <EventBrowseCard
                        key={event.id}
                        event={event}
                        userLocation={userLocation}
                      />
                    ))}
              </div>
              {!eventsLoading && !events.length && (
                <div className="mx-auto mt-12 max-w-md border border-dashed border-white/15 px-5 py-10 text-center">
                  <p className="text-sm font-medium">
                    Nu exista evenimente pentru filtrele alese.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Incearca un alt oras, vibe sau o distanta mai mare.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setFilters({ ...defaultEventFilters, distance: 50 })
                    }
                    className="mt-3 text-sm font-medium text-primary"
                  >
                    Reset filters
                  </button>
                </div>
              )}
              </div>
            </div>
          </>
        ) : (
          <div className="pointer-events-auto fixed inset-0 z-0 w-screen max-w-none bg-transparent lg:static lg:mt-5 lg:w-auto">
            <EventsMapLayout
              events={events}
              distanceKm={filters.distance}
              cityCenter={selectedCityCenter}
              userLocation={userLocation}
              onUserLocationChange={setUserLocation}
            />
          </div>
        )}
      </div>
    </div>
  );
}
