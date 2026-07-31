"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Ticket,
  UserRoundPlus,
  UsersRound,
  X,
  Calendar,
  ChevronRight,
} from "lucide-react";
import {
  type PublicProfile,
  type SocialFeedItem,
  User,
} from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { SocialAvatar } from "@/components/social/SocialAvatar";
import { NotificationsPopover } from "@/components/NotificationsPopover";
import { useEventDetails } from "@/components/EventDetailsSheet";
import { formatEventDate } from "@/features/events/dateFormat";
import { useTranslation } from "react-i18next";

const INITIAL_VISIBLE_ITEMS = 8;
const ACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;

type FeedGroup = {
  kind: "friends" | "organizer" | "update";
  eventId: string;
  eventTitle: string;
  eventBannerUrl?: string;
  eventStartTime: string;
  occurredAt: string;
  organizerName?: string;
  organizerUpdateId?: string;
  organizerUpdateImageUrl?: string;
  organizerUpdateCaption?: string;
  actors: SocialFeedItem[];
  ticketActors: SocialFeedItem[];
  goingActors: SocialFeedItem[];
};

export default function FeedPage() {
  const { user, loading, isOrganizer } = useDataProvider();
  const { t } = useTranslation();
  const { friends, friendsLoading } = User.useFriends(
    isOrganizer ? undefined : user,
  );
  const { items, feedLoading } = User.useSocialFeed(user);
  const [requests, setRequests] = useState<PublicProfile[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ITEMS);

  useEffect(() => {
    if (!user || isOrganizer) {
      setRequests([]);
      setRequestsLoading(false);
      return;
    }

    let active = true;
    setRequestsLoading(true);
    user
      .getFriendRequests()
      .then((received) => {
        if (active) setRequests(received);
      })
      .catch(() => {
        if (active) setRequests([]);
      })
      .finally(() => {
        if (active) setRequestsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOrganizer, user]);

  const visibleItems = useMemo(
    () =>
      isOrganizer
        ? items.filter((item) => item.activityType === "organizer_event")
        : items,
    [isOrganizer, items],
  );
  const groupedItems = useMemo(
    () => groupFeedItems(visibleItems),
    [visibleItems],
  );
  const activeFriendIds = useMemo(
    () =>
      new Set(
        items
          .filter(
            (item) =>
              item.activityType !== "organizer_event" &&
              item.activityType !== "organizer_update" &&
              Date.now() - new Date(item.occurredAt).getTime() <
                ACTIVITY_WINDOW_MS,
          )
          .map((item) => item.actorId),
      ),
    [items],
  );

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_ITEMS);
  }, [items]);

  const respond = async (id: string, status: "accepted" | "declined") => {
    if (!user) return;
    await user.respondToFriendRequest(id, status);
    setRequests((current) => current.filter((request) => request.id !== id));
  };

  if (!loading && !user) {
    return (
      <main className="w-full px-4 pt-10 text-foreground ">
        <h1 className="text-xl font-bold">{t("feed.title")}</h1>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("feed.signInHint")}
        </p>
        <Link
          href="/login"
          className="mt-4 inline-flex rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
        >
          {t("social.signIn")}
        </Link>
      </main>
    );
  }

  return (
    <main className="w-full px-3 pb-24 pt-4 text-foreground sm:px-6 mx-auto max-w-7xl ">
      {/* Header-ul paginii */}
      <header className="mb-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-primary/20 bg-primary/10 text-primary">
              <UsersRound className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                {t("feed.title")}
              </h1>
              <p className="text-xs text-muted-foreground">
                {isOrganizer
                  ? t("feed.followedOrganizers")
                  : t("feed.friendsAndOrganizers")}
              </p>
            </div>
          </div>
          {user && <NotificationsPopover />}
        </div>

        {!isOrganizer && (
          <FriendsRail
            friends={friends}
            loading={friendsLoading}
            activeFriendIds={activeFriendIds}
          />
        )}
      </header>

      {/* Cereri de prietenie */}
      {!isOrganizer && !requestsLoading && requests.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {t("feed.friendRequests")}
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {requests.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between gap-2.5 rounded-2xl border border-white/10 bg-neutral-900/60 p-3 backdrop-blur-md"
              >
                <Link
                  href={`/users/${request.id}`}
                  className="flex min-w-0 flex-1 items-center gap-2.5"
                >
                  <SocialAvatar profile={request} size="h-9 w-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">
                      {request.username}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {t("feed.wantsToConnect")}
                    </p>
                  </div>
                </Link>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void respond(request.id, "accepted")}
                    className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground transition active:scale-95"
                    aria-label={t("feed.acceptRequest", {
                      name: request.username,
                    })}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void respond(request.id, "declined")}
                    className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground transition active:scale-95"
                    aria-label={t("feed.declineRequest", {
                      name: request.username,
                    })}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Activitate recentă */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {t("feed.recent")}
          </h2>
          {groupedItems.length > 0 && (
            <span className="text-[11px] font-medium text-muted-foreground">
              {t("feed.of", {
                visible: Math.min(visibleCount, groupedItems.length),
                total: groupedItems.length,
              })}
            </span>
          )}
        </div>

        {feedLoading ? (
          <div className="space-y-2.5">
            <div className="h-28 animate-pulse rounded-3xl border border-white/10 bg-white/[0.03]" />
            <div className="h-28 animate-pulse rounded-3xl border border-white/10 bg-white/[0.03]" />
          </div>
        ) : groupedItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.01] px-4 py-8 text-center">
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5">
              <UserRoundPlus className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-3 text-sm font-semibold">{t("feed.empty")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isOrganizer ? t("feed.emptyOrganizer") : t("feed.emptyUser")}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {groupedItems.slice(0, visibleCount).map((item) => (
              <FeedCard
                key={`${item.kind}-${item.eventId}-${item.occurredAt}`}
                item={item}
              />
            ))}

            {visibleCount < groupedItems.length && (
              <button
                type="button"
                onClick={() =>
                  setVisibleCount((count) =>
                    Math.min(
                      count + INITIAL_VISIBLE_ITEMS,
                      groupedItems.length,
                    ),
                  )
                }
                className="mt-4 w-full rounded-full border border-white/10 bg-white/5 py-2.5 text-xs font-semibold text-muted-foreground transition active:scale-[0.99] hover:bg-white/10 hover:text-primary"
              >
                {t("feed.loadMore")}
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
function FriendsRail({
  friends,
  loading,
  activeFriendIds,
}: {
  friends: readonly PublicProfile[];
  loading: boolean;
  activeFriendIds: Set<string>;
}) {
  const { t } = useTranslation();

  return (
    <div className="-mx-3 flex items-start gap-3 overflow-x-auto px-3 py-2 scrollbar-none sm:-mx-6 sm:px-6 after:w-4 after:shrink-0 sm:after:w-6">
      {loading ? (
        <div className="flex gap-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="flex w-[68px] shrink-0 flex-col items-center gap-2"
            >
              <div className="h-12 w-12 animate-pulse rounded-full bg-white/5" />
              <div className="h-3 w-12 animate-pulse rounded bg-white/5" />
            </div>
          ))}
        </div>
      ) : (
        friends.slice(0, 15).map((friend) => {
          const isActive = activeFriendIds.has(friend.id);

          return (
            <Link
              key={friend.id}
              href={`/users/${friend.id}`}
              className="group flex w-[68px] shrink-0 flex-col items-center gap-1.5 text-center focus:outline-none"
              title={t("feed.viewProfile", { name: friend.username })}
            >
              {/* Cerc Avatar */}
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
                <SocialAvatar
                  profile={friend}
                  size="h-12 w-12"
                  active={isActive}
                />
              </div>

              {/* Text curat pe 1 singur rând - fără despărțiri urâte de litere */}
              <span className="w-full truncate text-[11px] font-medium leading-tight text-zinc-300 transition-colors group-hover:text-white">
                {friend.username}
              </span>
            </Link>
          );
        })
      )}

      {/* BUTONUL „VEZI TOT” - Aliniere perfectă pe 1 rând */}
      {!loading && friends.length > 0 && (
        <Link
          href="/users/me/friends"
          className="group flex w-[68px] shrink-0 flex-col items-center gap-1.5 text-center focus:outline-none"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 transition duration-200 group-hover:border-primary/40 group-hover:bg-primary/10 group-hover:text-primary">
            <ChevronRight className="h-5 w-5 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>

          <span className="w-full truncate text-[11px] font-semibold leading-tight text-zinc-400 transition-colors group-hover:text-primary">
            {t("feed.seeAll", { count: friends.length })}
          </span>
        </Link>
      )}
    </div>
  );
}

function FeedCard({ item }: { item: FeedGroup }) {
  const { t } = useTranslation();
  const { open } = useEventDetails();
  const [openingEvent, setOpeningEvent] = useState(false);
  const primaryActor = item.actors[0];
  const actorSummary = actorLabel(item.actors, t);
  const copy =
    item.kind === "update"
      ? t("feed.publishedUpdate")
      : item.kind === "organizer"
        ? t("feed.publishedEvent")
        : item.ticketActors.length > 0 && item.goingActors.length > 0
          ? t("feed.gettingReady")
          : item.ticketActors.length > 0
            ? t("feed.haveTickets")
            : t("feed.goingTo");

  if (item.kind === "update") {
    return <OrganizerUpdateFeedCard item={item} />;
  }

  const openEvent = async () => {
    if (openingEvent) return;
    setOpeningEvent(true);
    try {
      open(await User.getPublicEventById(item.eventId));
    } finally {
      setOpeningEvent(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => void openEvent()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void openEvent();
        }
      }}
      className="group flex cursor-pointer flex-col justify-between gap-2.5 rounded-3xl border border-white/10 bg-neutral-900/40 p-3.5 transition hover:border-white/20 hover:bg-neutral-900/70 sm:flex-row sm:items-center"
    >
      {/* Informații actor & eveniment */}
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Link
          href={`/users/${primaryActor.actorId}`}
          className="shrink-0 transition active:scale-95"
          onClick={(event) => event.stopPropagation()}
        >
          <SocialAvatar
            profile={{
              username: primaryActor.actorUsername,
              avatarUrl: primaryActor.actorAvatarUrl,
            }}
            size="h-9 w-9"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs leading-tight">
            <span className="font-semibold">
              {item.kind === "organizer"
                ? item.organizerName || primaryActor.actorUsername
                : actorSummary}
            </span>{" "}
            <span className="text-muted-foreground">{copy}</span>
          </p>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void openEvent();
            }}
            className="mt-0.5 block max-w-full truncate text-left text-sm font-bold text-primary transition hover:underline"
          >
            {item.eventTitle}
          </button>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium">
              <Calendar className="h-3 w-3 text-primary/80" />
              {formatEventDate(item.eventStartTime)}
            </span>
            {item.kind === "friends" && item.ticketActors.length > 0 && (
              <span className="rounded bg-primary/10 px-1.5 py-0.2 text-[10px] font-semibold text-primary">
                {t("feed.withTicket", { count: item.ticketActors.length })}
              </span>
            )}
            {item.kind === "friends" && item.goingActors.length > 0 && (
              <span className="rounded bg-white/5 px-1.5 py-0.2 text-[10px] font-medium text-foreground">
                {t("feed.going", { count: item.goingActors.length })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Buton Bilet */}
      <div className="flex shrink-0 items-center justify-end sm:pl-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void openEvent();
          }}
          disabled={openingEvent}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary transition active:scale-95 hover:bg-primary hover:text-primary-foreground"
        >
          <Ticket className="h-3.5 w-3.5" />
          <span>{t("feed.viewTickets")}</span>
        </button>
      </div>
    </div>
  );
}

function OrganizerUpdateFeedCard({ item }: { item: FeedGroup }) {
  const { t } = useTranslation();
  const { open } = useEventDetails();
  const [openingEvent, setOpeningEvent] = useState(false);
  const actor = item.actors[0];

  const openEvent = async () => {
    if (openingEvent) return;
    setOpeningEvent(true);
    try {
      open(await User.getPublicEventById(item.eventId));
    } finally {
      setOpeningEvent(false);
    }
  };

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => void openEvent()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void openEvent();
        }
      }}
      className="group cursor-pointer overflow-hidden rounded-3xl border border-white/10 bg-neutral-900/40 transition hover:border-white/20 hover:bg-neutral-900/70 sm:grid sm:grid-cols-[12rem_minmax(0,1fr)]"
    >
      <div className="relative block aspect-[16/9] overflow-hidden sm:aspect-auto sm:min-h-36">
        {item.organizerUpdateImageUrl ? (
          <img
            src={item.organizerUpdateImageUrl}
            alt=""
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full bg-white/[0.04]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent sm:bg-gradient-to-r sm:from-transparent sm:to-black/30" />
      </div>

      <div className="flex min-w-0 flex-col p-3.5 sm:p-4">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            href={`/users/${actor.actorId}`}
            onClick={(event) => event.stopPropagation()}
            className="shrink-0 transition active:scale-95"
          >
            <SocialAvatar
              profile={{
                username: actor.actorUsername,
                avatarUrl: actor.actorAvatarUrl,
              }}
              size="h-9 w-9"
            />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs leading-tight">
              <span className="font-semibold">
                {item.organizerName || actor.actorUsername}
              </span>{" "}
              <span className="text-muted-foreground">
                {t("feed.publishedUpdate")}
              </span>
            </p>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void openEvent();
              }}
              className="mt-1 block max-w-full truncate text-left text-base font-bold text-primary transition hover:underline"
            >
              {item.eventTitle}
            </button>
          </div>
        </div>

        {item.organizerUpdateCaption && (
          <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {item.organizerUpdateCaption}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 shrink-0 text-primary/80" />
            <span className="truncate">
              {formatEventDate(item.eventStartTime)}
            </span>
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void openEvent();
            }}
            disabled={openingEvent}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary transition active:scale-95 hover:bg-primary hover:text-primary-foreground"
          >
            <Ticket className="h-3.5 w-3.5" />
            {t("feed.viewTickets")}
          </button>
        </div>
      </div>
    </article>
  );
}

function groupFeedItems(items: readonly SocialFeedItem[]): FeedGroup[] {
  const canonicalFriends = new Map<string, SocialFeedItem>();
  const organizerItems: SocialFeedItem[] = [];

  const updateItems: SocialFeedItem[] = [];

  for (const item of items) {
    if (item.activityType === "organizer_event") {
      organizerItems.push(item);
      continue;
    }
    if (item.activityType === "organizer_update") {
      updateItems.push(item);
      continue;
    }

    const key = `${item.actorId}:${item.eventId}`;
    const current = canonicalFriends.get(key);
    if (
      !current ||
      (item.activityType === "friend_ticket" &&
        current.activityType !== "friend_ticket") ||
      (item.activityType === current.activityType &&
        new Date(item.occurredAt).getTime() >
          new Date(current.occurredAt).getTime())
    ) {
      canonicalFriends.set(key, item);
    }
  }

  const groups = new Map<string, FeedGroup>();
  for (const item of canonicalFriends.values()) {
    const key = `friends:${item.eventId}`;
    const current = groups.get(key) ?? createGroup("friends", item);
    current.actors.push(item);
    if (item.activityType === "friend_ticket") current.ticketActors.push(item);
    else current.goingActors.push(item);
    if (
      new Date(item.occurredAt).getTime() >
      new Date(current.occurredAt).getTime()
    ) {
      current.occurredAt = item.occurredAt;
    }
    groups.set(key, current);
  }

  for (const item of organizerItems) {
    const key = `organizer:${item.actorId}:${item.eventId}`;
    const group = createGroup("organizer", item);
    group.actors.push(item);
    groups.set(key, group);
  }

  for (const item of updateItems) {
    const key = `update:${item.organizerUpdateId}`;
    const group = createGroup("update", item);
    group.actors.push(item);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      actors: group.actors.sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      ),
    }))
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
}

function createGroup(kind: FeedGroup["kind"], item: SocialFeedItem): FeedGroup {
  return {
    kind,
    eventId: item.eventId,
    eventTitle: item.eventTitle,
    eventBannerUrl: item.eventBannerUrl,
    eventStartTime: item.eventStartTime,
    occurredAt: item.occurredAt,
    organizerName: item.organizerName,
    organizerUpdateId: item.organizerUpdateId,
    organizerUpdateImageUrl: item.organizerUpdateImageUrl,
    organizerUpdateCaption: item.organizerUpdateCaption,
    actors: [],
    ticketActors: [],
    goingActors: [],
  };
}

function actorLabel(
  actors: SocialFeedItem[],
  t?: (key: string, options?: Record<string, unknown>) => string,
) {
  const firstName = actors[0]?.actorUsername ?? t?.("feed.yourFriends") ?? "";
  if (actors.length === 1) return firstName;
  return (
    t?.("feed.andOtherFriends", {
      name: firstName,
      count: actors.length - 1,
    }) ?? firstName
  );
}
