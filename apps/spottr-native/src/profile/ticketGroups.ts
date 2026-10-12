import { ticketStatus, type UserTicket } from "../data/tickets";

export type ProfileTicketTab = "active" | "history";
export type TicketGroup = { eventId: string; tickets: UserTicket[] };

/** Keep every admission in its event, without mutating the cached API/offline data. */
export function profileTicketGroups(
  tickets: readonly UserTicket[],
  tab: ProfileTicketTab,
  now: number,
): TicketGroup[] {
  const groups = new Map<string, TicketGroup>();
  for (const ticket of tickets) {
    if ((ticketStatus(ticket, now) === "active") !== (tab === "active"))
      continue;
    const group = groups.get(ticket.eventId);
    if (group) group.tickets.push(ticket);
    else
      groups.set(ticket.eventId, {
        eventId: ticket.eventId,
        tickets: [ticket],
      });
  }
  return [...groups.values()].sort((a, b) => {
    const difference =
      Date.parse(a.tickets[0]!.startTime) - Date.parse(b.tickets[0]!.startTime);
    return (
      difference * (tab === "active" ? 1 : -1) ||
      a.eventId.localeCompare(b.eventId)
    );
  });
}
