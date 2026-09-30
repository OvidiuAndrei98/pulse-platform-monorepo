"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Search, X, Loader2 } from "lucide-react";
import { RequestError } from "@/components/ui/RequestFeedback";
import { useTranslation } from "react-i18next";
import type { PublicProfile } from "@/core/DataProvider";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { routeForPlatform } from "@/lib/native/navigation";
import { SocialAvatar } from "./SocialAvatar";

export function FriendsSheet({
  open,
  onOpenChange,
  friends,
  loading,
  requests,
  requestsLoading,
  respondingId,
  onRespond,
  error, onRetry, requestsError, onRetryRequests,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  friends: readonly PublicProfile[];
  loading: boolean;
  requests: readonly PublicProfile[];
  requestsLoading: boolean;
  respondingId: string | null;
  onRespond: (id: string, status: "accepted" | "declined") => Promise<void>;
  error?: boolean;
  onRetry: () => void;
  requestsError?: boolean;
  onRetryRequests: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const matches = friends.filter((friend) =>
    friend.username
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const profile = (friend: PublicProfile) => (
    <Link
      href={routeForPlatform(`/users/${friend.id}`)}
      onClick={() => onOpenChange(false)}
      className="flex min-w-0 flex-1 items-center gap-3"
    >
      <SocialAvatar profile={friend} size="h-11 w-11" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">
          {friend.username}
        </span>
        {friend.bio && (
          <span className="mt-1 block truncate text-xs text-white/45">
            {friend.bio}
          </span>
        )}
      </span>
    </Link>
  );
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
      fixed
    >
      <DrawerContent className="mx-auto h-[85dvh] max-h-[48rem] max-w-2xl border-white/10 bg-[#0b0b0c]">
        <header data-drawer-keyboard-header className="flex shrink-0 items-start justify-between px-5 pb-4 pt-5">
          <div>
            <DrawerTitle className="text-left text-2xl font-semibold tracking-tight">
              {t("friends.title")}
            </DrawerTitle>
            <DrawerDescription className="text-left">
              {loading ? t("common.loading") : error ? "—" : t("friends.count", { count: friends.length })}
            </DrawerDescription>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t("common.close")}
            className="grid h-10 w-10 place-items-center rounded-full bg-white/5"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div
          data-vaul-no-drag
          data-drawer-keyboard-scroll
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(2rem,env(safe-area-inset-bottom))]"
        >
          {requestsLoading ? (
            <div className="mb-5 h-14 animate-pulse rounded-xl bg-white/5" />
          ) : requestsError ? <RequestError onRetry={onRetryRequests} className="mb-5" /> : (
            requests.length > 0 && (
              <section className="mb-6">
                <h3 className="mb-2 text-xs font-medium text-white/45">
                  {t("feed.friendRequests")}
                </h3>
                {requests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center gap-3 border-b border-white/[0.06] py-3"
                  >
                    {profile(request)}
                    <button
                      type="button"
                      disabled={Boolean(respondingId)}
                      aria-busy={respondingId === request.id}
                      onClick={() => void onRespond(request.id, "accepted")}
                      aria-label={t("feed.acceptRequest", {
                        name: request.username,
                      })}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary disabled:opacity-40"
                    >
                      {respondingId === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(respondingId)}
                      aria-busy={respondingId === request.id}
                      onClick={() => void onRespond(request.id, "declined")}
                      aria-label={t("feed.declineRequest", {
                        name: request.username,
                      })}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/5 disabled:opacity-40"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </section>
            )
          )}
          <label className="mb-3 flex items-center gap-3 rounded-xl bg-white/5 px-4">
            <Search className="h-4 w-4 shrink-0 text-white/40" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("friends.searchPlaceholder")}
              aria-label={t("friends.searchPlaceholder")}
              className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none"
            />
          </label>
          {loading ? (
            <div className="h-28 animate-pulse rounded-xl bg-white/5" />
          ) : error ? <RequestError onRetry={onRetry} /> : matches.length ? (
            matches.map((friend) => (
              <div
                key={friend.id}
                className="flex items-center border-b border-white/[0.06] py-4"
              >
                {profile(friend)}
              </div>
            ))
          ) : (
            <p className="py-8 text-center text-sm leading-6 text-white/45">
              {t(friends.length ? "friends.noMatch" : "friends.emptyHint")}
            </p>
          )}
          <Link
            href="/users/me/friends"
            onClick={() => onOpenChange(false)}
            className="mt-5 inline-flex min-h-11 items-center text-sm text-white/60 underline underline-offset-4"
          >
            {t("feed.manageFriends")}
          </Link>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
