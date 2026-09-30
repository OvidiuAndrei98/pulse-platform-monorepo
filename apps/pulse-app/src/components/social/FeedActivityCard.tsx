"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  Calendar,
  ImageIcon,
  Loader2,
  Ticket,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { User } from "@/core/DataProvider";
import { useEventDetails } from "@/components/EventDetailsSheet";
import { formatEventDate } from "@/features/events/dateFormat";
import { routeForPlatform } from "@/lib/native/navigation";
import { SocialAvatar } from "./SocialAvatar";
import type { FeedGroup } from "./feedTypes";

export function FeedActivityCard({ item }: { item: FeedGroup }) {
  const { t, i18n } = useTranslation();
  const { open } = useEventDetails();
  const [opening, setOpening] = useState(false);
  const actor = item.actors[0];
  const isUpdate = item.kind === "update";
  const actorName =
    item.kind === "friends"
      ? item.actors.length > 1
        ? t("feed.andOtherFriends", {
            name: actor.actorUsername,
            count: item.actors.length - 1,
          })
        : actor.actorUsername
      : item.organizerName || actor.actorUsername;
  const copy = isUpdate
    ? t("feed.publishedUpdate")
    : item.kind === "organizer"
      ? t("feed.publishedEvent")
      : item.ticketActors.length && item.goingActors.length
        ? t("feed.gettingReady")
        : item.ticketActors.length
          ? t("feed.haveTickets")
          : t("feed.goingTo");
  const openEvent = async () => {
    if (opening) return;
    setOpening(true);
    try {
      open(await User.getPublicEventById(item.eventId));
    } catch {
      toast.error(t("error.somethingWrong"));
    } finally {
      setOpening(false);
    }
  };

  return (
    <article className="border-b border-white/[0.08] pb-6 last:border-b-0">
      <header className="flex items-center gap-3 pb-4">
        <Link
          href={routeForPlatform(`/users/${actor.actorId}`)}
          aria-label={t("feed.viewProfile", { name: actor.actorUsername })}
          className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-primary"
        >
          <SocialAvatar
            profile={{
              username: actor.actorUsername,
              avatarUrl: actor.actorAvatarUrl,
            }}
            size="h-10 w-10"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={routeForPlatform(`/users/${actor.actorId}`)}
            className="block truncate text-sm font-semibold text-white hover:text-primary"
          >
            {actorName}
          </Link>
          <p className="mt-0.5 text-xs leading-5 text-white/45">{copy}</p>
        </div>
        <time
          dateTime={item.occurredAt}
          className="shrink-0 self-start pt-0.5 text-[11px] text-white/35"
        >
          {new Date(item.occurredAt).toLocaleDateString(i18n.language, {
            day: "numeric",
            month: "short",
          })}
        </time>
      </header>

      {isUpdate && item.organizerUpdateCaption && (
        <p className="pb-4 text-sm leading-6 text-white/75 whitespace-pre-line break-words">
          {item.organizerUpdateCaption}
        </p>
      )}
      <button
        type="button"
        onClick={() => void openEvent()}
        disabled={opening}
        aria-label={`${t("feed.viewTickets")}: ${item.eventTitle}`}
        aria-busy={opening}
        className="group block w-full rounded-2xl text-left transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary disabled:cursor-wait"
      >
        {isUpdate && item.organizerUpdateImageUrl && (
          <FeedImage
            src={item.organizerUpdateImageUrl}
            className="mb-4 aspect-[4/3] max-h-[30rem] w-full overflow-hidden rounded-2xl bg-white/[0.025]"
            contain
          />
        )}
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.035] p-3">
          <FeedImage
            src={item.eventBannerUrl}
            className="h-16 w-14 shrink-0 overflow-hidden rounded-lg bg-white/[0.035]"
          />
          <div className="min-w-0 flex-1">
            <span className="mb-2 flex items-center gap-1.5 text-xs font-medium text-white/50">
              <Calendar className="h-3 w-3 shrink-0" />
              {formatEventDate(item.eventStartTime)}
            </span>
            <span className="block break-words text-base font-semibold leading-snug tracking-tight text-white transition group-hover:text-primary">
              {item.eventTitle}
            </span>
            {item.kind === "friends" && (
              <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/50">
                {item.ticketActors.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Ticket className="h-3 w-3" />
                    {t("feed.withTicket", { count: item.ticketActors.length })}
                  </span>
                )}
                {item.goingActors.length > 0 && (
                  <span>
                    {t("feed.going", { count: item.goingActors.length })}
                  </span>
                )}
              </span>
            )}
          </div>
          <span className="grid h-8 w-8 shrink-0 place-items-center text-white/40 transition group-hover:text-primary">
            {opening ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUpRight className="h-4 w-4" />
            )}
          </span>
        </div>
      </button>
    </article>
  );
}

function FeedImage({
  src,
  className,
  contain = false,
}: {
  src?: string;
  className: string;
  contain?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string>();
  return (
    <span className={`relative grid place-items-center ${className}`}>
      {src && src !== failedSrc ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailedSrc(src)}
          className={`absolute inset-0 h-full w-full ${contain ? "object-contain" : "object-cover"}`}
        />
      ) : (
        <ImageIcon className="h-6 w-6 text-primary/35" />
      )}
    </span>
  );
}
