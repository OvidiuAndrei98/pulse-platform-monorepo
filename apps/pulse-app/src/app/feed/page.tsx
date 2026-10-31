"use client";
import { FeedActivitySkeleton } from "@/components/ui/loading";

import { useCachedClientQuery } from "@/lib/useCachedClientQuery";
import { useNavigationState } from "@/lib/navigation/useNavigationState";
import { RequestError } from "@/components/ui/RequestFeedback";
import { useFeedbackAction } from "@/lib/useFeedbackAction";

import { FriendsSheet } from "@/components/social/FriendsSheet";
import { FeedActivityCard } from "@/components/social/FeedActivityCard";
import { groupFeedItems } from "@/components/social/groupFeedItems";
import Link from "next/link";
import { useMemo, useState } from "react";
import { UserRoundPlus, UsersRound } from "lucide-react";
import {
  type PublicProfile,
  User,
} from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { useTranslation } from "react-i18next";
import {ActionLink as UIActionLink} from '@/components/ui/ActionButton';

const INITIAL_VISIBLE_ITEMS = 8;
export default function FeedPage() {
  const { user, loading, isOrganizer } = useDataProvider();
  const { t } = useTranslation();
  const { friends, friendsLoading, friendsError, refresh: refreshFriends } = User.useFriends(
    isOrganizer ? undefined : user,
  );
  const { items, feedLoading, feedError, refresh: refreshFeed } = User.useSocialFeed(user);
  const responseAction = useFeedbackAction();
  const [friendsOpen, setFriendsOpen] = useState(false);
  const requestsQuery = useCachedClientQuery<PublicProfile[]>(
    user && !isOrganizer ? 'friend-requests:' + user.properties.id : null,
    () => user!.getFriendRequests(), [],
  );
  const { data: requests, pending: requestsLoading, error: requestsError, setData: setRequests } = requestsQuery;
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useNavigationState("feed-visible:" + (user?.properties.id ?? "guest"), INITIAL_VISIBLE_ITEMS);

  const visibleItems = useMemo(
    () =>
      isOrganizer
        ? items.filter(
            (item) =>
              item.activityType === "organizer_event" ||
              item.activityType === "organizer_update",
          )
        : items,
    [isOrganizer, items],
  );
  const groupedItems = useMemo(
    () => groupFeedItems(visibleItems),
    [visibleItems],
  );



  const respond = async (id: string, status: "accepted" | "declined") => {
    if (!user) return;
    await responseAction.run(async () => {
      setRespondingId(id);
      try {
        await user.respondToFriendRequest(id, status);
        setRequests((current) => current.filter((request) => request.id !== id));
        refreshFriends();
        refreshFeed();
      } finally {
        setRespondingId(null);
      }
    });
  };

  if (!loading && !user) {
    return (
      <main className="app-page-gutter w-full pt-[max(1.5rem,var(--native-safe-top))] text-foreground md:pt-8">
        <h1 className="text-xl font-bold">{t("feed.socialTitle")}</h1>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("feed.signInHint")}
        </p>
        <UIActionLink
          href="/login"
          className="mt-4 inline-flex  bg-[var(--ui-action)] px-4 py-2 text-xs font-medium  shadow-sm transition hover:opacity-90"
        >
          {t("social.signIn")}
        </UIActionLink>
      </main>
    );
  }

  return (
    <main className="app-page-gutter mx-auto w-full max-w-3xl pb-32 pt-[max(1.5rem,var(--native-safe-top))] text-foreground md:pt-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-[-0.04em]">
          {t("feed.socialTitle")}
        </h1>
        {!isOrganizer && (
          <button
            type="button"
            onClick={() => setFriendsOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-white/75 hover:text-white"
          >
            <UsersRound className="h-5 w-5" />
            {t("friends.title")}
            {requests.length > 0 && (
              <span className="grid min-h-5 min-w-5 place-items-center rounded-full bg-[var(--ui-action)] px-1 text-[11px] font-semibold text-white">
                {requests.length}
              </span>
            )}
          </button>
        )}
      </header>
      {!isOrganizer && (
        <FriendsSheet
          open={friendsOpen}
          onOpenChange={setFriendsOpen}
          friends={friends}
          loading={friendsLoading}
          error={Boolean(friendsError)}
          onRetry={refreshFriends}
          requests={requests}
          requestsLoading={requestsLoading}
          requestsError={Boolean(requestsError)}
          onRetryRequests={requestsQuery.retry}
          respondingId={respondingId}
          onRespond={respond}
        />
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

        {loading || feedLoading ? (
          <div role="status" aria-label={t("common.loading")} className="space-y-6">
            <FeedActivitySkeleton />
            <FeedActivitySkeleton />
            <FeedActivitySkeleton />
          </div>
        ) : feedError ? (
          <RequestError onRetry={refreshFeed} />
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
          <div className="space-y-6">
            {groupedItems.slice(0, visibleCount).map((item) => (
              <FeedActivityCard
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
