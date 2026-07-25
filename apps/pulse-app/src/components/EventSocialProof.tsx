"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Ticket, UsersRound } from "lucide-react";
import { ApiClient, type ReadableSchema } from "@packages/api-client/src/Client";
import { useDataProvider } from "@/core/DataProviderContext";

type EventSocial = ReadableSchema<"EventSocialResponse">;
type RsvpStatus = "interested" | "going";

const statusLabel: Record<RsvpStatus, string> = {
  interested: "Interesat",
  going: "Merg",
};

export function EventSocialProof({ eventId }: { eventId: string }) {
  const { user } = useDataProvider();
  const [social, setSocial] = useState<EventSocial | null>(null);
  const [updating, setUpdating] = useState(false);

  const loadSocial = useCallback(async () => {
    try {
      const response = await ApiClient.instance.get("/events/{id}/social", {
        params: { path: { id: eventId } },
      });
      setSocial(response as EventSocial);
    } catch {
      setSocial(null);
    }
  }, [eventId]);

  useEffect(() => {
    setSocial(null);
    void loadSocial();
  }, [loadSocial]);

  const updateRsvp = async (status: RsvpStatus) => {
    if (!user || updating) return;
    setUpdating(true);
    try {
      const response =
        social?.currentUserStatus === status
          ? await ApiClient.instance.delete("/events/{id}/rsvp", {
              params: { path: { id: eventId } },
            })
          : await ApiClient.instance.put("/events/{id}/rsvp", {
              params: { path: { id: eventId } },
              body: { status },
            });
      setSocial(response as EventSocial);
    } finally {
      setUpdating(false);
    }
  };

  if (!social) {
    return <div className="h-20 animate-pulse border border-white/10 bg-white/[0.035]" />;
  }

  const isTicketHolder = social.currentUserStatus === "has_ticket";
  const followingFriends = social.friends.filter(
    (friend) => friend.status !== "has_ticket",
  );
  const attendanceCount =
    social.ticketsSoldCount === undefined
      ? social.goingCount
      : social.ticketsSoldCount + social.manualGoingCount;

  return (
    <section className="border-y border-white/10 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <UsersRound className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">
            {attendanceCount} merg
            <span className="text-muted-foreground"> · {social.interestedCount} interesati</span>
          </p>
        </div>

        {isTicketHolder ? (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-3 text-xs font-semibold text-primary">
            <Ticket className="h-3.5 w-3.5" /> Ai bilet
          </span>
        ) : user ? (
          <div className="flex h-9 items-center rounded-full border border-white/15 bg-white/[0.04] p-0.5">
            {(["interested", "going"] as const).map((status) => {
              const active = social.currentUserStatus === status;
              return (
                <button
                  key={status}
                  type="button"
                  disabled={updating}
                  onClick={() => void updateRsvp(status)}
                  className={`h-full rounded-full px-3 text-xs font-semibold transition disabled:opacity-50 ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {statusLabel[status]}
                </button>
              );
            })}
          </div>
        ) : (
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-full border border-white/15 px-3 text-xs font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-primary"
          >
            Conecteaza-te pentru RSVP
          </Link>
        )}
      </div>

      {followingFriends.length > 0 && (
        <div className="mt-3 flex items-center gap-3">
          <div className="flex -space-x-2">
            {followingFriends.slice(0, 3).map((friend) => (
              <div
                key={friend.id}
                title={friend.username}
                className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-full border-2 border-background bg-surface text-[10px] font-bold text-primary"
              >
                {friend.avatarUrl ? (
                  <img src={friend.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  friend.username.slice(0, 1).toUpperCase()
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {`${followingFriends[0].username}${followingFriends.length > 1 ? ` si alti ${followingFriends.length - 1} prieteni urmaresc evenimentul` : " urmareste evenimentul"}`}
          </p>
        </div>
      )}
    </section>
  );
}
