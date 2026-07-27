"use client";

import Link from "next/link";
import { Check, UserMinus, UserPlus } from "lucide-react";
import { ApiClient, type ReadableSchema } from "@packages/api-client/src/Client";
import { useDataProvider } from "@/core/DataProviderContext";

type PublicProfile = ReadableSchema<"PublicProfileResponse">;

export function ProfileActions({
  profile,
  onChange,
}: {
  profile: PublicProfile;
  onChange?: (update: Partial<PublicProfile>) => void;
}) {
  const { user, isOrganizer } = useDataProvider();

  if (profile.relationship === "self") return null;
  if (!user) {
    return <Link href="/login" className="inline-flex h-9 items-center rounded-full border border-white/15 px-3 text-xs font-semibold text-muted-foreground">Conecteaza-te</Link>;
  }

  const updateFriendship = async (relationship: PublicProfile["relationship"]) => {
    onChange?.({ relationship });
  };

  if (profile.role === "organizer") {
    const toggleFollow = async () => {
      const followsOrganizer = !profile.followsOrganizer;
      onChange?.({ followsOrganizer, followerCount: Math.max(0, profile.followerCount + (followsOrganizer ? 1 : -1)) });
      try {
        await ApiClient.instance[followsOrganizer ? "post" : "delete"]("/organizers/{userId}/follow", {
          params: { path: { userId: profile.id } },
        });
      } catch {
        onChange?.({ followsOrganizer: profile.followsOrganizer, followerCount: profile.followerCount });
      }
    };
    return (
      <button type="button" onClick={() => void toggleFollow()} className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition ${profile.followsOrganizer ? "border-primary/40 bg-primary/15 text-primary" : "border-white/15 text-foreground hover:border-primary/50"}`}>
        {profile.followsOrganizer ? <Check className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
        {profile.followsOrganizer ? "Urmaresti" : "Urmareste"}
      </button>
    );
  }

  if (isOrganizer) return null;

  const connect = async () => {
    if (profile.relationship === "pending_received") {
      await ApiClient.instance.put("/friends/request/{userId}", { params: { path: { userId: profile.id } }, body: { status: "accepted" } });
      await updateFriendship("friends");
      return;
    }
    if (profile.relationship === "none") {
      await ApiClient.instance.post("/friends/request/{userId}", { params: { path: { userId: profile.id } } });
      await updateFriendship("pending_sent");
    }
  };

  const removeFriend = async () => {
    try {
      await user.removeFriend(profile.id);
      await updateFriendship("none");
    } catch {
      // The current state remains visible when the request fails.
    }
  };

  const isFriend = profile.relationship === "friends";
  const label = isFriend ? "Scoate din prieteni" : profile.relationship === "pending_sent" ? "Cerere trimisa" : profile.relationship === "pending_received" ? "Accepta" : "Adauga prieten";
  return (
    <button type="button" disabled={profile.relationship === "pending_sent"} onClick={() => void (isFriend ? removeFriend() : connect())} className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition disabled:cursor-default ${isFriend ? "border-white/15 text-muted-foreground hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive" : "border-white/15 text-foreground hover:border-primary/50"}`}>
      {isFriend ? <UserMinus className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}
