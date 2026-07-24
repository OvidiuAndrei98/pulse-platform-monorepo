"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Ticket, UsersRound } from "lucide-react";
import { ApiClient, type ReadableSchema } from "@packages/api-client/src/Client";

type Attendee = ReadableSchema<"EventAttendeeResponse">;

export function EventAttendees({ eventId }: { eventId: string }) {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  useEffect(() => {
    ApiClient.instance.get("/events/{id}/attendees", { params: { path: { id: eventId } } }).then((data) => setAttendees(data as Attendee[])).catch(() => setAttendees([]));
  }, [eventId]);
  if (!attendees.length) return null;
  return <section className="border-b border-white/10 pb-5"><div className="flex items-center gap-2"><UsersRound className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Cine merge</h2><span className="text-xs text-muted-foreground">{attendees.length}</span></div><div className="mt-3 flex flex-wrap gap-2">{attendees.slice(0, 12).map((person) => <Link key={person.id} href={`/users/${person.id}`} title={`@${person.username}`} className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-white/15 bg-surface text-xs font-semibold text-primary transition hover:border-primary">{person.avatarUrl ? <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" /> : person.username.slice(0, 1).toUpperCase()}{person.attendanceStatus === "has_ticket" && <span className="absolute bottom-0 right-0 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground"><Ticket className="h-2.5 w-2.5" /></span>}</Link>)}</div></section>;
}
