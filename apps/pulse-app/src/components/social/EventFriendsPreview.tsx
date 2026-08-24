"use client";

import { useEffect, useState } from "react";
import { UsersRound } from "lucide-react";
import {
  ApiClient,
  type ReadableSchema,
} from "@packages/api-client/src/Client";

type EventSocial = ReadableSchema<"EventSocialResponse">;

export function EventFriendsPreview({
  eventId,
  className = "",
}: {
  eventId: string;
  className?: string;
}) {
  const [social, setSocial] = useState<EventSocial | null>(null);

  useEffect(() => {
    let active = true;
    ApiClient.instance
      .get("/events/{id}/social", { params: { path: { id: eventId } } })
      .then((response) => {
        if (active) setSocial(response as EventSocial);
      })
      .catch(() => {
        if (active) setSocial(null);
      });
    return () => {
      active = false;
    };
  }, [eventId]);

  if (!social) return null;

  const attendingFriends = social.friends.filter(
    (friend) => friend.status !== "interested",
  );
  const attendanceCount =
    social.ticketsSoldCount === undefined
      ? social.goingCount
      : social.ticketsSoldCount + social.manualGoingCount;

  if (attendanceCount === 0 && attendingFriends.length === 0) return null;

  const visibleFriends = attendingFriends.slice(0, 3);
  const remainingAttendees = Math.max(
    0,
    attendanceCount - visibleFriends.length,
  );

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      {visibleFriends.length > 0 ? (
        <div className="inline-flex items-center -space-x-2">
          {visibleFriends.map((friend) => (
            <div
              key={friend.id}
              title={friend.username}
              className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800 text-[9px] font-bold text-zinc-200 ring-2 ring-zinc-900/80"
            >
              {friend.avatarUrl ? (
                <img
                  src={friend.avatarUrl}
                  alt={friend.username}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <span className="grid h-full w-full place-items-center rounded-full bg-zinc-700 text-[10px] font-bold text-zinc-100">
                  {friend.username.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <span className="grid h-6 w-6 place-items-center rounded-full border border-white/10 bg-white/5 text-primary">
          <UsersRound className="h-3.5 w-3.5" />
        </span>
      )}

      {/* Aliniere matematică: h-6 + flex items-center fixează linia de text la centrul cercurilor */}
      {remainingAttendees > 0 && (
        <span className="inline-flex h-6 items-center whitespace-nowrap text-[11px] font-semibold text-zinc-300">
          +{remainingAttendees}
        </span>
      )}
    </div>
  );
}
