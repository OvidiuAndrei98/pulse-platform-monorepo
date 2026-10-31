"use client";

import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { RequestError } from "@/components/ui/RequestFeedback";
import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Search,
  Loader2,
  UserMinus,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { User } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { SocialAvatar } from "@/components/social/SocialAvatar";
import { routeForPlatform } from "@/lib/native/navigation";
import { useTranslation } from "react-i18next";
import {Input as UIInput} from '@/components/ui/Field';

export default function FriendsPage() {
  const { user, isOrganizer, loading } = useDataProvider();
  const { t } = useTranslation();
  const { friends, friendsLoading, friendsError, refresh } = User.useFriends(
    isOrganizer ? undefined : user,
  );
  const [query, setQuery] = useState("");
  const [removedFriendIds, setRemovedFriendIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [removingId, setRemovingId] = useState<string>();
  const removing = useRef(false);
  const [error, setError] = useState<string>();
  const visibleFriends = useMemo(
    () => friends.filter((friend) => !removedFriendIds.has(friend.id)),
    [friends, removedFriendIds],
  );

  const matchingFriends = visibleFriends.filter((friend) =>
    friend.username
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );

  const removeFriend = async (friendId: string) => {
    if (!user || removing.current) return;
    removing.current = true;
    setRemovingId(friendId);
    setError(undefined);
    try {
      await user.removeFriend(friendId);
      setRemovedFriendIds((current) => new Set(current).add(friendId));
    } catch {
      setError(t("friends.removeFailed"));
    } finally {
      removing.current = false;
      setRemovingId(undefined);
    }
  };

  if (isOrganizer) {
    return (
      <main className="app-page-spacing mx-auto min-h-screen max-w-3xl pb-32 text-foreground">
        <Link
          href="/dashboard"
          className="inline-flex h-9 items-center gap-2 text-xs font-semibold text-muted-foreground transition hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> {t("friends.backToDashboard")}
        </Link>
        <div className="mt-8 border border-white/10 bg-white/[0.035] px-5 py-8">
          <h1 className="text-xl font-semibold">
            {t("friends.organizerProfile")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("friends.organizerHint")}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="app-page-spacing mx-auto min-h-screen max-w-3xl pb-32 text-foreground">
      <BackLink
        href="/feed"
        className="inline-flex h-9 items-center gap-2 text-xs font-semibold text-muted-foreground transition hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> {t("friends.backToFeed")}
      </BackLink>
      <header className="mt-5 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary">
          <UsersRound className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold">{t("friends.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {loading || friendsLoading ? t("common.loading") : friendsError ? "" : t("friends.count", { count: visibleFriends.length })}
          </p>
        </div>
      </header>

      <label className="ui-input-shell mt-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-4">
        <Search className="h-4 w-4 text-white/40" />
        <UIInput
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("friends.searchPlaceholder")}
          aria-label={t("friends.searchPlaceholder")}
          className="h-12 min-w-0 flex-1 bg-transparent text-sm  placeholder:text-white/35" bare
        />
      </label>
      {loading || friendsLoading ? (
        <div className="mt-7 h-28 animate-pulse border border-white/10 bg-white/[0.035]" />
      ) : friendsError ? (
        <RequestError onRetry={refresh} className="mt-7" />
      ) : visibleFriends.length === 0 ? (
        <div className="mt-7 border border-dashed border-white/15 px-5 py-10 text-center">
          <UserRoundPlus className="mx-auto h-5 w-5 text-primary" />
          <p className="mt-3 text-sm font-medium">{t("friends.empty")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("friends.emptyHint")}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.025] divide-y divide-white/[0.06]">
          {matchingFriends.map((friend) => (
            <div
              key={friend.id}
              className="flex items-center gap-3 px-4 py-4 transition hover:bg-white/[0.03]"
            >
              <Link
                href={routeForPlatform(`/users/${friend.id}`)}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <SocialAvatar profile={friend} size="h-12 w-12" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {friend.username}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {friend.bio || t("friends.glowProfile")}
                  </p>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => void removeFriend(friend.id)}
                disabled={Boolean(removingId)}
                title={t("friends.remove", { name: friend.username })}
                aria-label={t("friends.remove", { name: friend.username })}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 text-muted-foreground transition hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive disabled:cursor-wait disabled:opacity-60"
              >
                {removingId === friend.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserMinus className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
      {!loading && !friendsLoading &&
        visibleFriends.length > 0 &&
        matchingFriends.length === 0 && (
          <p className="py-8 text-center text-sm text-white/50">
            {t("friends.noMatch")}
          </p>
        )}
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </main>
  );
}
