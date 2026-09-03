"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { FiltersSheet } from "@/components/FiltersSheet";
import { Event, PromotedEvent, PublicEventsService } from "@/core/DataProvider";
import {
  cityCenters,
  defaultEventFilters,
  eventDateFilters,
} from "@/features/events/constants";
import { EventBrowseCard } from "@/features/events/components/EventBrowseCard";
import { EventViewToggle } from "@/features/events/components/EventViewToggle";
import { getEventDateRange } from "@/features/events/dateFilters";
import { Coordinates, EventFilters } from "@/features/events/types";
import { EventCardSkeleton, PageLoadingState } from "@/components/ui/loading";
import {
  mixFeedPromotions,
  promotionCampaignsByEvent,
} from "@/features/events/promotions";

const EventsMapLayout = dynamic(
  () =>
    import("@/features/events/components/EventsMapLayout").then(
      (module) => module.EventsMapLayout,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-dvh bg-black lg:h-[calc(100dvh-200px)]">
        <PageLoadingState className="min-h-full" />
      </div>
    ),
  },
);

function getDateFilter(value: string | null) {
  return eventDateFilters.includes(value as (typeof eventDateFilters)[number])
    ? value!
    : defaultEventFilters.date;
}

function trackFeedPromotion(
  campaign: PromotedEvent | undefined,
  metric: "impression" | "click",
) {
  if (!campaign) return;
  let viewerKey = sessionStorage.getItem("pulse:promotion-viewer");
  if (!viewerKey) {
    viewerKey = crypto.randomUUID();
    sessionStorage.setItem("pulse:promotion-viewer", viewerKey);
  }
  void PublicEventsService.trackPromotion(
    campaign.campaignId,
    metric,
    viewerKey,
  );
}

export default function EventsPage() {
  return (
    <Suspense
      fallback={
        <div className="h-dvh bg-background">
          <PageLoadingState className="min-h-full" />
        </div>
      }
    >
      <EventsPageContent />
    </Suspense>
  );
}

function EventsPageContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const requestedDate = getDateFilter(searchParams.get("date"));
  const hasDateInUrl = searchParams.has("date");
  const [filters, setFilters] = useState<EventFilters>(() => ({
    ...defaultEventFilters,
    date: requestedDate,
  }));
  const [view, setView] = useState<"list" | "map">("list");
  const [events, setEvents] = useState<Event[]>([]);
  const [promotions, setPromotions] = useState<PromotedEvent[]>([]);
  const [promotionSeed] = useState(
    () => `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const [eventsLoading, setEventsLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const selectedCityCenter = filters.city
    ? (cityCenters[filters.city] ?? null)
    : null;

  useEffect(() => {
    setFilters({
      ...defaultEventFilters,
      date: hasDateInUrl ? requestedDate : defaultEventFilters.date,
    });
  }, [hasDateInUrl, requestedDate]);

  const eventQuery = useMemo(() => {
    const dateRange = getEventDateRange(filters.date);

    return {
      category: filters.categories.join(",") || undefined,
      city: filters.city || undefined,
      vibe: filters.vibes.join(",") || undefined,
      ...dateRange,
      // Discovery should never surface events that have already ended.
      startsAfter: dateRange.startsAfter ?? new Date().toISOString(),
    };
  }, [filters.categories, filters.city, filters.date, filters.vibes]);

  useEffect(() => {
    let active = true;
    setEventsLoading(true);

    Promise.all([
      PublicEventsService.getPublicEvents(eventQuery),
      PublicEventsService.getPromotedEvents().catch(() => []),
    ])
      .then(([nextEvents, nextPromotions]) => {
        if (!active) return;
        setEvents(nextEvents);
        setPromotions(nextPromotions);
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

  const feedPromotions = useMemo(
    () => promotions.filter((campaign) => campaign.placement === "feed"),
    [promotions],
  );
  const feedCampaignsByEvent = useMemo(
    () => promotionCampaignsByEvent(feedPromotions),
    [feedPromotions],
  );
  const feedEventIds = useMemo(
    () => new Set(feedCampaignsByEvent.keys()),
    [feedCampaignsByEvent],
  );
  const displayedEvents = useMemo(
    () =>
      mixFeedPromotions(
        events,
        feedPromotions,
        `${promotionSeed}:events`,
        (event) => {
          const categories = eventQuery.category?.split(",") ?? [];
          const vibes = eventQuery.vibe?.split(",") ?? [];
          if (categories.length && !categories.includes(event.category)) return false;
          if (vibes.length && !vibes.includes(event.vibe)) return false;
          if (eventQuery.city && event.city !== eventQuery.city) return false;
          if (eventQuery.startsAfter && new Date(event.endTime) <= new Date(eventQuery.startsAfter)) return false;
          if (eventQuery.startsBefore && new Date(event.startTime) >= new Date(eventQuery.startsBefore)) return false;
          return true;
        },
        3,
      ),
    [eventQuery, events, feedPromotions, promotionSeed],
  );

  return (
    <div className="relative h-dvh overflow-hidden overscroll-none text-foreground">
      <div
        className={`relative h-full ${
          view === "map"
            ? "app-page-gutter pointer-events-none fixed inset-x-0 top-0 z-30 mx-auto max-w-7xl pt-[20px] lg:static lg:pointer-events-auto lg:pt-10"
            : "flex flex-col"
        }`}
      >
        <div
          className={`relative z-20 flex flex-wrap items-start justify-between gap-3 sm:items-center ${view === "list" ? "app-page-gutter mx-auto w-full max-w-7xl pt-10" : ""}`}
        >
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
              <div className="app-page-gutter mx-auto w-full max-w-7xl pb-28">
                <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-4 lg:grid-cols-3">
                  {eventsLoading
                    ? Array.from({ length: 6 }, (_, index) => (
                        <EventCardSkeleton key={index} />
                      ))
                    : displayedEvents.map((event) => (
                        <EventBrowseCard
                          key={event.id}
                          event={event}
                          userLocation={userLocation}
                          promoted={feedEventIds.has(event.id)}
                          onOpen={() => trackFeedPromotion(feedCampaignsByEvent.get(event.id), "click")}
                          onVisible={() => trackFeedPromotion(feedCampaignsByEvent.get(event.id), "impression")}
                        />
                      ))}
                </div>
                {!eventsLoading && !displayedEvents.length && (
                  <div className="mx-auto mt-12 max-w-md border border-dashed border-white/15 px-5 py-10 text-center">
                    <p className="text-sm font-medium">{t("events.noMatch")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("events.tryAnother")}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setFilters({ ...defaultEventFilters, distance: 50 })
                      }
                      className="mt-3 text-sm font-medium text-primary"
                    >
                      {t("events.resetFilters")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="pointer-events-auto fixed inset-0 z-0 w-screen max-w-none bg-transparent lg:static lg:mt-5 lg:w-auto">
            <EventsMapLayout
              events={displayedEvents}
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
