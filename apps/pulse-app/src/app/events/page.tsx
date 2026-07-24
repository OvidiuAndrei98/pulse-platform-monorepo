"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { FiltersSheet } from "@/components/FiltersSheet";
import { Event, PublicEventsService } from "@/core/DataProvider";
import { cityCenters, defaultEventFilters } from "@/features/events/constants";
import { EventBrowseCard } from "@/features/events/components/EventBrowseCard";
import { EventViewToggle } from "@/features/events/components/EventViewToggle";
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

export default function EventsPage() {
  const [filters, setFilters] = useState<EventFilters>(defaultEventFilters);
  const [view, setView] = useState<"list" | "map">("list");
  const [events, setEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const selectedCityCenter = filters.city
    ? (cityCenters[filters.city] ?? null)
    : null;

  const eventQuery = useMemo(
    () => ({
      category: filters.categories.join(",") || undefined,
      city: filters.city || undefined,
      vibe: filters.vibes.join(",") || undefined,
    }),
    [filters.categories, filters.city, filters.vibes],
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
    <div
      className={`relative  text-foreground ${view === "map" ? "h-dvh overflow-hidden overscroll-none pb-0" : "min-h-screen pb-40"}`}
    >
      <div
        className={`relative mx-auto max-w-7xl px-5 pt-10 ${view === "map" ? "pointer-events-none fixed inset-x-0 top-0 z-30 lg:static lg:pointer-events-auto" : ""}`}
      >
        <div className="relative z-20 flex flex-wrap items-start justify-between gap-3 sm:items-center">
          <div
            className={`flex w-full items-center gap-2 sm:w-auto ${view === "map" ? "pointer-events-auto" : ""}`}
          >
            <EventViewToggle view={view} onChange={setView} />
            <FiltersSheet value={filters} onChange={setFilters} />
          </div>
        </div>

        {view === "list" ? (
          <>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {eventsLoading
                ? Array.from({ length: 6 }, (_, index) => (
                    <div key={index} className="event-card h-56 animate-pulse border border-white/10 bg-white/[0.04]" />
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
                <p className="text-sm font-medium">Nu exista evenimente pentru filtrele alese.</p>
                <p className="mt-1 text-xs text-muted-foreground">Incearca un alt oras, vibe sau o distanta mai mare.</p>
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
