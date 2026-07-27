"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Ticket,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import {
  type PublicProfile,
  type SocialFeedItem,
  User,
} from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { SocialAvatar } from "@/components/social/SocialAvatar";
import { formatEventDate } from "@/features/events/dateFormat";
import { useTranslation } from "react-i18next";

const INITIAL_VISIBLE_ITEMS = 6;
const ACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;

type FeedGroup = {
  kind: "friends" | "organizer";
  eventId: string;
  eventTitle: string;
  eventBannerUrl?: string;
  eventStartTime: string;
  occurredAt: string;
  organizerName?: string;
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
  const groupedItems = useMemo(() => groupFeedItems(visibleItems), [visibleItems]);
  const activeFriendIds = useMemo(
    () =>
      new Set(
        items
          .filter(
            (item) =>
              item.activityType !== "organizer_event" &&
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
      <main className="mx-auto min-h-screen max-w-xl px-5 pt-12 text-foreground">
        <h1 className="text-2xl font-semibold">{t("feed.title")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("feed.signInHint")}
        </p>
        <Link
          href="/login"
          className="mt-5 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          {t("social.signIn")}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-dvh max-w-2xl flex-col overflow-hidden px-5 pt-10 text-foreground sm:px-7">
      <header className="shrink-0">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary">
            <UsersRound className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold">{t("feed.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {isOrganizer ? t("feed.followedOrganizers") : t("feed.friendsAndOrganizers")}
            </p>
          </div>
        </div>
        {!isOrganizer && (
          <FriendsRail
            friends={friends}
            loading={friendsLoading}
            activeFriendIds={activeFriendIds}
          />
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-28 pt-6">
        {!isOrganizer && !requestsLoading && requests.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold">{t("feed.friendRequests")}</h2>
            <div className="mt-3 space-y-2">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3"
                >
                  <SocialAvatar profile={request} />
                  <Link
                    href={`/users/${request.id}`}
                    className="min-w-0 flex-1"
                  >
                    <p className="truncate text-sm font-semibold">
                      {request.username}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("feed.wantsToConnect")}
                    </p>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void respond(request.id, "accepted")}
                    className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground"
                    aria-label={t("feed.acceptRequest", { name: request.username })}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void respond(request.id, "declined")}
                    className="grid h-8 w-8 place-items-center rounded-full border border-white/15 text-muted-foreground"
                    aria-label={t("feed.declineRequest", { name: request.username })}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className={!requestsLoading && requests.length > 0 ? "mt-8" : ""}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">{t("feed.recent")}</h2>
            {groupedItems.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {t("feed.of", { visible: Math.min(visibleCount, groupedItems.length), total: groupedItems.length })}
              </span>
            )}
          </div>
          {feedLoading ? (
            <div className="mt-3 h-28 animate-pulse rounded-lg border border-white/10 bg-white/[0.035]" />
          ) : groupedItems.length === 0 ? (
            <div className="mt-3 rounded-lg border border-dashed border-white/15 px-5 py-10 text-center">
              <UserRoundPlus className="mx-auto h-5 w-5 text-primary" />
              <p className="mt-3 text-sm font-medium">
                {t("feed.empty")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isOrganizer
                  ? t("feed.emptyOrganizer")
                  : t("feed.emptyUser")}
              </p>
            </div>
          ) : (
            <>
              <div className="mt-3 divide-y divide-white/10 border-y border-white/10">
                {groupedItems.slice(0, visibleCount).map((item) => (
                  <FeedRow key={`${item.kind}-${item.eventId}-${item.occurredAt}`} item={item} />
                ))}
              </div>
              {visibleCount < groupedItems.length && (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCount((count) =>
                      Math.min(count + INITIAL_VISIBLE_ITEMS, groupedItems.length),
                    )
                  }
                  className="mt-4 w-full rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-primary"
                >
                  {t("feed.loadMore")}
                </button>
              )}
            </>
          )}
        </section>
      </div>
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
    <div className="-mx-5 mt-5 flex items-start gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-7 sm:px-7">
      {loading ? (
        <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-white/10" />
      ) : (
        friends.slice(0, 12).map((friend) => (
          <Link
            key={friend.id}
            href={`/users/${friend.id}`}
            className="flex w-12 shrink-0 flex-col items-center gap-1.5 text-center"
            title={t("feed.viewProfile", { name: friend.username })}
          >
            <SocialAvatar
              profile={friend}
              size="h-12 w-12"
              active={activeFriendIds.has(friend.id)}
            />
            <span className="w-full truncate text-[10px] font-medium text-muted-foreground">
              {friend.username}
            </span>
          </Link>
        ))
      )}
      {!loading && friends.length > 0 && (
        <Link
          href="/users/me/friends"
          className="flex h-12 shrink-0 items-center rounded-full border border-white/15 px-3 text-xs font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-primary"
        >
          {t("feed.seeAll", { count: friends.length })}
        </Link>
      )}
    </div>
  );
}

function FeedRow({ item }: { item: FeedGroup }) {
  const { t } = useTranslation();
  const primaryActor = item.actors[0];
  const actorSummary = actorLabel(item.actors, t);
  const copy =
    item.kind === "organizer"
      ? t("feed.publishedEvent")
      : item.ticketActors.length > 0 && item.goingActors.length > 0
        ? t("feed.gettingReady")
        : item.ticketActors.length > 0
          ? t("feed.haveTickets")
          : t("feed.goingTo");

  return (
    <div className="flex items-center gap-3 py-3 transition hover:bg-white/[0.03]">
      <Link href={`/users/${primaryActor.actorId}`} className="shrink-0">
        <SocialAvatar
          profile={{
            username: primaryActor.actorUsername,
            avatarUrl: primaryActor.actorAvatarUrl,
          }}
        />
      </Link>
      <Link href={`/events/${item.eventId}`} className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-semibold">
            {item.kind === "organizer"
              ? item.organizerName || primaryActor.actorUsername
              : actorSummary}
          </span>{" "}
          <span className="text-muted-foreground">{copy}</span>
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-primary">
          {item.eventTitle}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span>{formatEventDate(item.eventStartTime)}</span>
          {item.kind === "friends" && item.ticketActors.length > 0 && (
            <span>{t("feed.withTicket", { count: item.ticketActors.length })}</span>
          )}
          {item.kind === "friends" && item.goingActors.length > 0 && (
            <span>{t("feed.going", { count: item.goingActors.length })}</span>
          )}
        </div>
      </Link>
      <Link
        href={`/events/${item.eventId}`}
        aria-label={t("feed.viewTicketsFor", { event: item.eventTitle })}
        title={t("feed.viewTickets")}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-primary/35 bg-primary/10 text-primary transition hover:bg-primary hover:text-primary-foreground"
      >
        <Ticket className="h-4 w-4" />
      </Link>
    </div>
  );
}

function groupFeedItems(items: readonly SocialFeedItem[]): FeedGroup[] {
  const canonicalFriends = new Map<string, SocialFeedItem>();
  const organizerItems: SocialFeedItem[] = [];

  for (const item of items) {
    if (item.activityType === "organizer_event") {
      organizerItems.push(item);
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
    if (new Date(item.occurredAt).getTime() > new Date(current.occurredAt).getTime()) {
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
    actors: [],
    ticketActors: [],
    goingActors: [],
  };
}

function actorLabel(actors: SocialFeedItem[], t?: (key: string, options?: Record<string, unknown>) => string) {
  const firstName = actors[0]?.actorUsername ?? t?.("feed.yourFriends") ?? "";
  if (actors.length === 1) return firstName;
  return t?.("feed.andOtherFriends", { name: firstName, count: actors.length - 1 }) ?? firstName;
}
