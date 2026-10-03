"use client";

import { Suspense, useMemo, useState } from "react";
import { useCachedClientQuery } from "@/lib/useCachedClientQuery";
import { useDataProvider } from "@/core/DataProviderContext";
import dynamic from "next/dynamic";
import { useDiscoveryState } from "@/features/events/useDiscoveryState";
import { RequestError, RequestProgress } from "@/components/ui/RequestFeedback";
import { useTranslation } from "react-i18next";
import { FiltersSheet } from "@/components/FiltersSheet";
import { Event, PromotedEvent, PublicEventsService } from "@/core/DataProvider";
import {
  cityCenters,
  defaultEventFilters,
} from "@/features/events/constants";
import { EventBrowseCard } from "@/features/events/components/EventBrowseCard";
import { EventViewToggle } from "@/features/events/components/EventViewToggle";
import { getEventDateRange } from "@/features/events/dateFilters";
import { Coordinates } from "@/features/events/types";
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
  const { filters, setFilters, view, setView, ready } = useDiscoveryState();
  const { user, loading: authLoading } = useDataProvider();
  const [promotionSeed] = useState(
    () => `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const selectedCityCenter = filters.city
    ? (cityCenters[filters.city] ?? null)
    : null;

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

  // Use the filter values, not the generated current-time ISO string, as the key.
  // Filters still reset on tab re-entry; only matching results are reused.
  const discoveryKey = JSON.stringify(["discovery", user?.properties.id ?? "guest", filters.date,
    filters.city, [...filters.categories].sort(), [...filters.vibes].sort(), new Date().toDateString()]);
  const discovery = useCachedClientQuery(
    ready && !authLoading ? discoveryKey : null,
    () => PublicEventsService.getPublicEvents(eventQuery), [] as Event[],
  );
  const promotionQuery = useCachedClientQuery(
    !authLoading ? `promotions:${user?.properties.id ?? "guest"}` : null,
    () => PublicEventsService.getPromotedEvents(), [] as PromotedEvent[],
  );
  const events = discovery.data;
  const promotions = promotionQuery.data;
  const eventsLoading = !ready || authLoading || discovery.pending;
  const eventsError = Boolean(discovery.error);
  const retry = discovery.retry;

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
      <div className="relative flex h-full flex-col">
        {/* Keep the toolbar in the same page flow, including native safe-area spacing. */}
        <div className="app-page-gutter pointer-events-none relative z-30 mx-auto flex w-full max-w-7xl shrink-0 flex-wrap items-start justify-between gap-3 pt-[max(1.5rem,var(--native-safe-top))] sm:items-center md:pt-8">
          <div className="pointer-events-auto flex items-center gap-2 sm:w-auto">
            <EventViewToggle view={view} onChange={setView} />
            <FiltersSheet value={filters} onChange={setFilters} />
          </div>
        </div>

        {view === "list" ? (
          <>
            <div data-nav-scroll="events-list" className="mt-6 min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
              <div className="app-page-gutter mx-auto w-full max-w-7xl pb-28">
                {(eventsError || Boolean(discovery.refreshError)) && <RequestError onRetry={retry} className="mb-5" />}
                <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-4 lg:grid-cols-3">
                  {eventsLoading
                    ? Array.from({ length: 6 }, (_, index) => (
                        <EventCardSkeleton key={index} />
                      ))
                    : !eventsError && displayedEvents.map((event, index) => (
                        <EventBrowseCard
                          key={event.id}
                          event={event}
                          eagerImage={index < 3}
                          userLocation={userLocation}
                          promoted={feedEventIds.has(event.id)}
                          onOpen={() => trackFeedPromotion(feedCampaignsByEvent.get(event.id), "click")}
                          onVisible={() => trackFeedPromotion(feedCampaignsByEvent.get(event.id), "impression")}
                        />
                      ))}
                </div>
                {!eventsLoading && !eventsError && !displayedEvents.length && (
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
          <div className="pointer-events-auto fixed inset-0 z-0 w-screen max-w-none bg-transparent lg:static lg:mx-auto lg:mt-5 lg:w-full lg:max-w-7xl lg:px-8">
            {(eventsLoading || eventsError) && (
              <div className="fixed inset-x-5 bottom-28 z-[1100] mx-auto max-w-md">
                {eventsLoading ? <RequestProgress label={t("feedback.updatingEvents")} className="rounded-2xl border border-white/10 bg-[#141414] p-4 shadow-lg" /> : <RequestError onRetry={retry} />}
              </div>
            )}
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
