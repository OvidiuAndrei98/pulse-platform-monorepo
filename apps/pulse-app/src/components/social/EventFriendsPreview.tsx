"use client";

import { useEffect, useState } from "react";
import { UsersRound } from "lucide-react";
import { ApiClient, type ReadableSchema } from "@packages/api-client/src/Client";

type EventSocial = ReadableSchema<"EventSocialResponse">;

export function EventFriendsPreview({ eventId, className = "" }: { eventId: string; className?: string }) {
  const [social, setSocial] = useState<EventSocial | null>(null);

  useEffect(() => {
    let active = true;
    ApiClient.instance.get("/events/{id}/social", { params: { path: { id: eventId } } })
      .then((response) => { if (active) setSocial(response as EventSocial); })
      .catch(() => { if (active) setSocial(null); });
    return () => { active = false; };
  }, [eventId]);

  if (!social) return null;

  const attendingFriends = social.friends.filter((friend) => friend.status !== "interested");
  const attendanceCount = social.ticketsSoldCount === undefined ? social.goingCount : social.ticketsSoldCount + social.manualGoingCount;

  if (attendanceCount === 0 && attendingFriends.length === 0) return null;

  const visibleFriends = attendingFriends.slice(0, 2);
  const remainingAttendees = Math.max(0, attendanceCount - visibleFriends.length);

  return <div className={`flex min-w-0 items-center gap-1.5 ${className}`}>
    {visibleFriends.length > 0 ? <div className="flex -space-x-1.5">{visibleFriends.map((friend) => <span key={friend.id} title={friend.username} className="grid h-5 w-5 place-items-center overflow-hidden rounded-full border border-background bg-surface text-[8px] font-bold text-primary">{friend.avatarUrl ? <img src={friend.avatarUrl} alt="" className="h-full w-full object-cover" /> : friend.username.slice(0, 1).toUpperCase()}</span>)}</div> : <span className="grid h-5 w-5 place-items-center rounded-full border border-white/15 bg-white/[0.04] text-primary"><UsersRound className="h-3 w-3" /></span>}
    {remainingAttendees > 0 ? <span className="whitespace-nowrap text-[10px] font-semibold text-zinc-300">+ {remainingAttendees}</span> : null}
  </div>;
}
