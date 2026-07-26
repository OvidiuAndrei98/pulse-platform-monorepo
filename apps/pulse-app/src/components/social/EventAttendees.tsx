"use client";

import { useEffect, useState } from "react";
import { Ticket, UsersRound } from "lucide-react";
import { type EventAttendee, User } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { EventFriendProfilePopup } from "@/components/social/EventFriendProfilePopup";

export function EventAttendees({ eventId }: { eventId: string }) {
  const { user } = useDataProvider();
  const { friends } = User.useEventFriends(user, eventId);
  const [selectedFriend, setSelectedFriend] = useState<EventAttendee | null>(
    null,
  );

  useEffect(() => {
    setSelectedFriend(null);
  }, [eventId]);

  if (!user || friends.length === 0) return null;

  return (
    <section className="border-b border-white/10 pb-5">
      <div className="flex items-center gap-2">
        <UsersRound className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Prietenii tai care merg</h2>
        <span className="text-xs text-muted-foreground">{friends.length}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {friends.slice(0, 12).map((person) => (
          <button
            key={person.id}
            type="button"
            onClick={() => setSelectedFriend(person)}
            title={`@${person.username}`}
            className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-white/15 bg-surface text-xs font-semibold text-primary transition hover:border-primary"
          >
            {person.avatarUrl ? (
              <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              person.username.slice(0, 1).toUpperCase()
            )}
            {person.attendanceStatus === "has_ticket" && (
              <span className="absolute bottom-0 right-0 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground">
                <Ticket className="h-2.5 w-2.5" />
              </span>
            )}
          </button>
        ))}
      </div>

      {selectedFriend && (
        <EventFriendProfilePopup
          attendee={selectedFriend}
          viewerId={user.properties.id}
          onClose={() => setSelectedFriend(null)}
        />
      )}
    </section>
  );
}
