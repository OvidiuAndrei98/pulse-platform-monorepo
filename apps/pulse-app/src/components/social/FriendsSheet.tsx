"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Check, Search, X, Loader2 } from "lucide-react";
import { RequestError } from "@/components/ui/RequestFeedback";
import { useTranslation } from "react-i18next";
import type { PublicProfile } from "@/core/DataProvider";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
  DrawerHandleOverlay,
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
      <span className="min-w-0 flex-1">
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
      closeThreshold={0.35}
      repositionInputs={false}
    >
      <DrawerContent data-friends-sheet sideInset showHandle={false} lockDocument={false} className="mx-auto h-[90svh] max-w-xl rounded-t-4xl border-none bg-black p-0 touch-none">
        <DrawerHandleOverlay />
        <header data-drawer-keyboard-header className="shrink-0 px-5 pb-5 pt-9 text-left">
          <div>
            <DrawerTitle className="text-2xl! font-bold! tracking-[-0.035em] text-white">
              {t("friends.title")}
            </DrawerTitle>
            <DrawerDescription className="mt-2 text-xs text-white/55">
              {loading ? t("common.loading") : error ? "—" : t("friends.count", { count: friends.length })}
            </DrawerDescription>
          </div>
        </header>
        <label data-vaul-no-drag className="mx-5 mb-4 flex shrink-0 items-center gap-3 rounded-2xl bg-[#161616] px-4 focus-within:ring-1 focus-within:ring-primary/60">
          <Search className="h-4 w-4 shrink-0 text-white/40" aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder={t("friends.searchPlaceholder")} aria-label={t("friends.searchPlaceholder")}
            className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none" />
        </label>
        <div
          data-drawer-keyboard-scroll
          className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 pb-7"
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
                    className="mb-2 flex items-center gap-2 rounded-2xl bg-[#141113] p-3"
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
          {loading ? (
            <div className="h-28 animate-pulse rounded-xl bg-white/5" />
          ) : error ? <RequestError onRetry={onRetry} /> : matches.length ? (
            matches.map((friend) => (
              <div
                key={friend.id}
                className="flex items-center gap-3 rounded-2xl px-2 py-3 transition-colors hover:bg-white/[0.04]"
              >
                {profile(friend)}
                <ArrowUpRight aria-hidden="true" className="pointer-events-none h-4 w-4 shrink-0 text-white/25" />
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
            className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#161616] px-4 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            {t("feed.manageFriends")}
            <ArrowUpRight aria-hidden="true" className="h-4 w-4 text-primary" />
          </Link>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
