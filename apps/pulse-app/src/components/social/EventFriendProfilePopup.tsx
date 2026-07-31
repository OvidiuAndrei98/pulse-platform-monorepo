"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BadgeCheck, Ticket, UsersRound, X } from "lucide-react";
import {
  type EventAttendee,
  type PublicProfile,
  User,
} from "@/core/DataProvider";
import { useTranslation } from "react-i18next";

export function EventFriendProfilePopup({
  attendee,
  viewerId,
  onClose,
}: {
  attendee: EventAttendee;
  viewerId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<PublicProfile | null>(attendee);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    let active = true;
    setProfile(attendee);

    void User.getPublicProfile(attendee.id, viewerId)
      .then((data) => {
        if (active) setProfile(data);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [attendee, viewerId]);

  const displayedProfile = profile ?? attendee;
  const displayName =
    displayedProfile.role === "organizer"
      ? displayedProfile.organizerName || displayedProfile.username
      : displayedProfile.username;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!isMounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] grid touch-none place-items-center bg-black/65 p-5 backdrop-blur-sm"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
        event.stopPropagation();
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t("social.attendeeProfile", { name: displayName })}
        className="relative w-full max-w-sm touch-auto overflow-hidden rounded-3xl border border-white/15 bg-[#101311] p-5 text-foreground shadow-2xl"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("social.closeProfile")}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3.5 pr-9">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border border-primary/35 bg-primary/10 text-lg font-semibold text-primary">
            {displayedProfile.avatarUrl ? (
              <img
                src={displayedProfile.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              displayedProfile.username.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-lg font-semibold">{displayName}</h3>
              {displayedProfile.organizerVerified && (
                <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              @{displayedProfile.username}
            </p>
          </div>
        </div>

        {displayedProfile.bio && (
          <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">
            {displayedProfile.bio}
          </p>
        )}

        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/15 px-3 py-3 text-xs font-medium text-muted-foreground">
          {attendee.attendanceStatus === "has_ticket" ? (
            <>
              <Ticket className="h-4 w-4 text-primary" /> {t("social.hasTicketForEvent")}
            </>
          ) : (
            <>
              <UsersRound className="h-4 w-4 text-primary" /> {t("social.goingToEvent")}
            </>
          )}
        </div>

      </section>
    </div>,
    document.body,
  );
}
