"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BadgeCheck, Ticket, UsersRound, X } from "lucide-react";
import {
  type EventAttendee,
  type PublicProfile,
  User,
} from "@/core/DataProvider";

export function EventFriendProfilePopup({
  attendee,
  viewerId,
  onClose,
}: {
  attendee: EventAttendee;
  viewerId: string;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<PublicProfile | null>(attendee);

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

  return createPortal(
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-black/65 p-5 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Profilul lui ${displayName}`}
        className="relative w-full max-w-sm border border-white/15 bg-[#101311] p-5 text-foreground shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Inchide profilul"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
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

        <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-4 text-xs font-medium text-muted-foreground">
          {attendee.attendanceStatus === "has_ticket" ? (
            <>
              <Ticket className="h-4 w-4 text-primary" /> Are bilet pentru acest eveniment
            </>
          ) : (
            <>
              <UsersRound className="h-4 w-4 text-primary" /> Merge la acest eveniment
            </>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
