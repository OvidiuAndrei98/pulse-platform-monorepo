import { ticketStatus, type UserTicket } from "../data/tickets";

export type ProfileTicketTab = "active" | "history";
export type TicketGroup = { eventId: string; tickets: UserTicket[] };

/** Pick once on opening. A later admission update must not switch the QR. */
export function initialGroupTicket(tickets: readonly UserTicket[], initialId: string, preferUnused = true, now = Date.now()) {
  const selected = tickets.find(ticket => ticket.id === initialId) ?? tickets[0];
  if (!selected || !preferUnused) return selected?.id ?? initialId;
  return tickets.find(ticket => ticket.eventId === selected.eventId && ticketStatus(ticket, now) === 'active')?.id ?? selected.id;
}

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
