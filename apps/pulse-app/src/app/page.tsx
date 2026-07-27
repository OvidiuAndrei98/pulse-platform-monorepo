"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchPopover } from "@/components/SearchPopover";
import { useDataProvider } from "@/core/DataProviderContext";
import { User, Event } from "@/core/DataProvider";
import { HomeEventCarousel } from "@/features/events/home/HomeEventCarousel";
import { Coordinates } from "@/features/events/types";
import { getDistanceKm } from "@/features/events/utils";
import { useTranslation } from "react-i18next";

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

export default function Home() {
  const { t } = useTranslation();
  const { user, loading } = useDataProvider();
  const { events, eventsLoading, eventsError } = User.useEvents(user, loading);
  const { items: socialFeed } = User.useSocialFeed(user);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);

  useEffect(() => {
    if (eventsLoading || !navigator.geolocation) return;

    let active = true;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (active) setUserLocation([coords.latitude, coords.longitude]);
      },
      () => {
        // Nearby events stay hidden when the browser does not grant location.
      },
      {
        enableHighAccuracy: false,
        maximumAge: 5 * 60 * 1000,
        timeout: 8_000,
      },
    );

    return () => {
      active = false;
    };
  }, [eventsLoading]);

  const now = new Date();
  const activeEvents = useMemo(
    () => events.filter((event) => new Date(event.endTime) > now),
    [events],
  );
  const liveEvents = activeEvents.filter((event) => event.isLive);
  const upcomingEvents = activeEvents
    .filter((event) => !event.isLive)
    .sort(
      (first, second) =>
        +new Date(first.startTime) - +new Date(second.startTime),
    );
  const tonightEvents = getTonightEvents(activeEvents);
  const tonightForYou = [...tonightEvents]
    .filter((event) => !event.isLive)
    .sort(
      (first, second) =>
        Number(Boolean(second.stats?.isFavorited)) -
          Number(Boolean(first.stats?.isFavorited)) ||
        (second.stats?.goingCount ?? 0) - (first.stats?.goingCount ?? 0),
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

    return activeEvents
      .map((event) => ({ event, distance: getDistanceKm(userLocation, event) }))
      .filter(({ distance }) => distance <= 25)
      .sort((first, second) => first.distance - second.distance)
      .map(({ event }) => event);
  }, [activeEvents, userLocation]);
  const guestName = guestNames[new Date().getDate() % guestNames.length];

  return (
    <div className="relative min-h-screen overflow-hidden text-foreground">
      <div className="relative z-10 pb-32">
        <div className="mx-auto max-w-7xl px-5 pt-10">
          <div className="relative z-40">
            <p className="text-xl font-semibold leading-tight md:text-2xl">
              {loading ? (
                <span className="inline-flex items-center gap-2" aria-label={t("common.loading")}>
                  {t("common.loading")}
                  <span className="h-5 w-36 animate-pulse rounded-full bg-white/[0.08] md:h-6" />
                </span>
              ) : t("home.hello", { name: user?.properties.username || guestName })}
            </p>
            <p className="mt-1 text-sm text-muted-foreground md:text-base">
              {t("home.exploreTonight", { count: tonightEvents.length })}
            </p>
          </div>

          <div className="relative mt-6 h-11">
            <SearchPopover events={events as Event[]} />
          </div>
        </div>

        {eventsLoading ? (
          <HomeLoadingState />
        ) : eventsError ? (
          <p className="mx-auto mt-9 max-w-7xl px-5 text-sm text-muted-foreground">
            {t("home.eventsUnavailable")}
          </p>
        ) : (
          <>
            {liveEvents.length > 0 && (
              <HomeEventCarousel
                title={t("common.liveNow")}
                events={liveEvents.slice(0, 8)}
                live
                emptyMessage=""
                seeAllHref="/events?date=Tonight"
              />
            )}
            {tonightForYou.length > 0 && (
              <HomeEventCarousel
                title={user ? t("home.tonightForYou") : t("home.tonight")}
                events={tonightForYou.slice(0, 8)}
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
                emptyMessage=""
              />
            )}
            <HomeEventCarousel
              title={t("home.upcoming")}
              events={upcomingEvents.slice(0, 8)}
              emptyMessage={t("home.noUpcoming")}
            />
          </>
        )}
      </div>
    </div>
  );
}

function HomeLoadingState() {
  return (
    <div className="mx-auto mt-9 max-w-7xl px-5">
      <div className="h-5 w-24 animate-pulse bg-white/[0.08]" />
      <div className="mt-4 flex gap-4 overflow-hidden">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-[22rem] w-[260px] shrink-0 animate-pulse rounded-[24px] border border-white/10 bg-white/[0.035]"
          />
        ))}
      </div>
      <div className="mt-9 h-5 w-28 animate-pulse bg-white/[0.08]" />
      <div className="mt-4 flex gap-4 overflow-hidden">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-[22rem] w-[260px] shrink-0 animate-pulse rounded-[24px] border border-white/10 bg-white/[0.035]"
          />
        ))}
      </div>
    </div>
  );
}
