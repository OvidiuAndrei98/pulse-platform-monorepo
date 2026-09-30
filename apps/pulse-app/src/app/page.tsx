"use client";
import { RequestError } from "@/components/ui/RequestFeedback";
import { useCachedClientQuery } from "@/lib/useCachedClientQuery";
import { HomeCarouselSkeleton } from "@/components/ui/loading";

import { useEffect, useMemo, useState } from "react";
import { SearchPopover } from "@/components/SearchPopover";
import { useDataProvider } from "@/core/DataProviderContext";
import { User, Event, PublicEventsService, type PromotedEvent } from "@/core/DataProvider";
import { HomeEventCarousel } from "@/features/events/home/HomeEventCarousel";
import { PromotedEventsHeroCarousel } from "@/features/events/home/PromotedEventsHeroCarousel";
import { Coordinates } from "@/features/events/types";
import { getDistanceKm } from "@/features/events/utils";
import {
  mixFeedPromotions,
  promotionCampaignsByEvent,
} from "@/features/events/promotions";
import { useTranslation } from "react-i18next";
import { requestCurrentLocation } from "@/lib/native/location";
import { NotificationsPopover } from "@/components/NotificationsPopover";
import Image from "next/image";

const guestNames = [
  "Party Crasher",
  "Night Owl",
  "Anonymous Raver",
  "Creature of the Night",
];

function getTonightEvents(events: readonly Event[]) {
  const now = new Date();
  const endOfTonight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );

  return events.filter((event) => {
    const startsAt = new Date(event.startTime);
    const endsAt = new Date(event.endTime);
    return endsAt > now && startsAt < endOfTonight;
  });
}

function selectEventsByIds(
  events: readonly Event[],
  eventIds: ReadonlySet<string>,
) {
  return events
    .filter((event) => eventIds.has(event.id))
    .sort(
      (first, second) =>
        +new Date(first.startTime) - +new Date(second.startTime),
    )
    .slice(0, 8);
}

function trackFeedPromotion(
  campaign: PromotedEvent | undefined,
  metric: "impression" | "click",
) {
  if (!campaign) return;
  const viewerKey = sessionStorage.getItem("pulse:promotion-viewer");
  if (viewerKey)
    void PublicEventsService.trackPromotion(
      campaign.campaignId,
      metric,
      viewerKey,
    );
}

export default function Home() {
  const { t } = useTranslation();
  const { user, loading } = useDataProvider();
  const { events, eventsLoading, eventsError, refresh: refreshEvents } = User.useEvents(user, loading);
  const { items: socialFeed } = User.useSocialFeed(user);
  const { data: userLocation } = useCachedClientQuery<Coordinates | null>(
    !loading && !eventsLoading ? `nearby-location:${user?.properties.id ?? "guest"}` : null,
    () => requestCurrentLocation({ enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 8_000 }), null,
  );
  const { data: promotedEvents } = useCachedClientQuery<PromotedEvent[]>(
    !loading ? `promotions:${user?.properties.id ?? "guest"}` : null,
    () => PublicEventsService.getPromotedEvents(), [],
  );
  const [promotionSeed] = useState(
    () => `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  useEffect(() => {
    if (loading) return;
    const storedKey = sessionStorage.getItem("pulse:promotion-viewer");
    const viewerKey = storedKey || crypto.randomUUID();
    if (!storedKey) sessionStorage.setItem("pulse:promotion-viewer", viewerKey);
  }, [loading, user?.properties.id]);

  const now = new Date();
  const endOfTonight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  const bannerPromotions = promotedEvents.filter(
    (campaign) => campaign.placement === "home_banner",
  );
  const feedPromotions = promotedEvents.filter(
    (campaign) => campaign.placement === "feed",
  );
  const feedCampaignsByEvent = promotionCampaignsByEvent(feedPromotions);
  const feedEventIds = new Set(feedCampaignsByEvent.keys());
  const activeEvents = useMemo(
    () => events.filter((event) => new Date(event.endTime) > now),
    [events],
  );
  const liveEvents = mixFeedPromotions(
    activeEvents.filter((event) => event.isLive),
    feedPromotions,
    `${promotionSeed}:live`,
    (event) =>
      new Date(event.startTime) <= now && new Date(event.endTime) > now,
  );
  const upcomingEvents = mixFeedPromotions(
    activeEvents
    .filter((event) => !event.isLive)
    .sort(
      (first, second) =>
        +new Date(first.startTime) - +new Date(second.startTime),
    ),
    feedPromotions,
    `${promotionSeed}:upcoming`,
    (event) => new Date(event.startTime) > now,
  );
  const tonightEvents = getTonightEvents(activeEvents);
  const tonightForYou = mixFeedPromotions(
    [...tonightEvents]
      .filter((event) => !event.isLive)
      .sort(
        (first, second) =>
          Number(Boolean(second.stats?.isFavorited)) -
            Number(Boolean(first.stats?.isFavorited)) ||
          (second.stats?.goingCount ?? 0) - (first.stats?.goingCount ?? 0),
      ),
    feedPromotions,
    `${promotionSeed}:tonight`,
    (event) => {
      const startsAt = new Date(event.startTime);
      const endsAt = new Date(event.endTime);
      return endsAt > now && startsAt < endOfTonight && startsAt > now;
    },
  );
  const friendEventIds = useMemo(
    () =>
      new Set(
        socialFeed
          .filter(
            (item) =>
              item.activityType === "friend_ticket" ||
              item.activityType === "friend_going",
          )
          .map((item) => item.eventId),
      ),
    [socialFeed],
  );
  const followedOrganizerEventIds = useMemo(
    () =>
      new Set(
        socialFeed
          .filter((item) => item.activityType === "organizer_event")
          .map((item) => item.eventId),
      ),
    [socialFeed],
  );
  const friendEvents = selectEventsByIds(activeEvents, friendEventIds);
  const followedOrganizerEvents = selectEventsByIds(
    activeEvents,
    followedOrganizerEventIds,
  );
  const nearbyEvents = useMemo(() => {
    if (!userLocation) return [];

    const nearby = activeEvents
      .map((event) => ({ event, distance: getDistanceKm(userLocation, event) }))
      .filter(({ distance }) => distance <= 25)
      .sort((first, second) => first.distance - second.distance)
      .map(({ event }) => event);
    return mixFeedPromotions(
      nearby,
      feedPromotions,
      `${promotionSeed}:nearby`,
      (event) => getDistanceKm(userLocation, event) <= 25,
    );
  }, [activeEvents, feedPromotions, promotionSeed, userLocation]);
  const guestName = guestNames[new Date().getDate() % guestNames.length];

  return (
    <div className="relative min-h-screen overflow-hidden text-foreground">
      <div className="relative z-10 pb-[110px]">
        <div className="app-page-gutter mx-auto max-w-7xl pt-[max(1.5rem,var(--native-safe-top))] md:pt-8">
          <div className="relative z-40 flex items-center justify-between gap-4 mb-2 md:mb-4">
            <div className="flex items-center gap-2">
              <Image
                src="/spottr-logo.svg"
                alt={t("common.logoAlt")}
                width={40}
                height={40}
                className="h-8 w-8 md:h-10 md:w-10"
              />
              <span className="hidden md:block text-md md:text-lg font-black uppercase tracking-[0.10em] text-foreground">
                SPOTTR<span className="text-primary">.</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              {user && <NotificationsPopover />}
              <SearchPopover events={events as Event[]} />
            </div>
          </div>

          <div className="relative z-30 flex items-end justify-between gap-4">
            <div>
              <p className="min-h-7 text-xl font-semibold leading-7 md:text-2xl md:leading-8">
                {loading ? (
                  <span
                    className="inline-flex items-center gap-2"
                    aria-label={t("common.loading")}
                  >
                    {t("common.loading")}
                    <span className="h-5 w-36 animate-pulse rounded-full bg-white/[0.08] md:h-6" />
                  </span>
                ) : (
                  t("home.hello", {
                    name: user?.properties.username || guestName,
                  })
                )}
              </p>
              <p className="mt-1 text-sm text-primary md:text-base">
                {t("home.exploreTonight", { count: tonightEvents.length })}
              </p>
            </div>
          </div>
        </div>

        {bannerPromotions.length > 0 && (
          <PromotedEventsHeroCarousel
            items={bannerPromotions}
            onEventOpen={(campaign) => {
              const viewerKey = sessionStorage.getItem("pulse:promotion-viewer");
              if (viewerKey) void PublicEventsService.trackPromotion(campaign.campaignId, "click", viewerKey);
            }}
            onEventVisible={(campaign) => {
              const viewerKey = sessionStorage.getItem("pulse:promotion-viewer");
              if (viewerKey) void PublicEventsService.trackPromotion(campaign.campaignId, "impression", viewerKey);
            }}
          />
        )}

        {eventsLoading ? (
          <HomeLoadingState />
        ) : eventsError ? (
          <div className="app-page-gutter mx-auto mt-9 max-w-7xl"><RequestError onRetry={refreshEvents} message={t("home.eventsUnavailable")} /></div>
        ) : (
          <>
            {liveEvents.length > 0 && (
              <HomeEventCarousel
                title={t("common.liveNow")}
                events={liveEvents.slice(0, 8)}
                live
                promotedEventIds={feedEventIds}
                onEventOpen={(event) => trackFeedPromotion(feedCampaignsByEvent.get(event.id), "click")}
                onEventVisible={(event) => trackFeedPromotion(feedCampaignsByEvent.get(event.id), "impression")}
                emptyMessage=""
                seeAllHref="/events?date=Tonight"
              />
            )}
            {tonightForYou.length > 0 && (
              <HomeEventCarousel
                title={user ? t("home.tonightForYou") : t("home.tonight")}
                events={tonightForYou.slice(0, 8)}
                promotedEventIds={feedEventIds}
                onEventOpen={(event) => trackFeedPromotion(feedCampaignsByEvent.get(event.id), "click")}
                onEventVisible={(event) => trackFeedPromotion(feedCampaignsByEvent.get(event.id), "impression")}
                emptyMessage=""
                seeAllHref="/events?date=Tonight"
              />
            )}
            {friendEvents.length > 0 && (
              <HomeEventCarousel
                title={t("home.friendsGoing")}
                events={friendEvents}
                emptyMessage=""
              />
            )}
            {followedOrganizerEvents.length > 0 && (
              <HomeEventCarousel
                title={t("home.followedOrganizers")}
                events={followedOrganizerEvents}
                emptyMessage=""
              />
            )}
            {nearbyEvents.length > 0 && (
              <HomeEventCarousel
                title={t("home.nearYou")}
                events={nearbyEvents.slice(0, 8)}
                promotedEventIds={feedEventIds}
                onEventOpen={(event) => trackFeedPromotion(feedCampaignsByEvent.get(event.id), "click")}
                onEventVisible={(event) => trackFeedPromotion(feedCampaignsByEvent.get(event.id), "impression")}
                emptyMessage=""
              />
            )}
            <HomeEventCarousel
              title={t("home.upcoming")}
              events={upcomingEvents.slice(0, 8)}
              promotedEventIds={feedEventIds}
              onEventOpen={(event) => trackFeedPromotion(feedCampaignsByEvent.get(event.id), "click")}
              onEventVisible={(event) => trackFeedPromotion(feedCampaignsByEvent.get(event.id), "impression")}
              emptyMessage={t("home.noUpcoming")}
            />
          </>
        )}
      </div>
    </div>
  );
}

function HomeLoadingState() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t("common.loading")}>
      <HomeCarouselSkeleton />
      <HomeCarouselSkeleton />
    </div>
  );
}
