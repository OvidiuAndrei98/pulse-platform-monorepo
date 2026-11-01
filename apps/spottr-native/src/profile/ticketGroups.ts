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
    const group = groups.get(ticket.eventId);
    if (group) group.tickets.push(ticket);
    else
      groups.set(ticket.eventId, {
        eventId: ticket.eventId,
        tickets: [ticket],
      });
  }
  return [...groups.values()].filter(group =>
    group.tickets.some(ticket => ticketStatus(ticket, now) === 'active') === (tab === 'active')
  ).sort((a, b) => {
    const difference =
      Date.parse(a.tickets[0]!.startTime) - Date.parse(b.tickets[0]!.startTime);
    return (
      difference * (tab === "active" ? 1 : -1) ||
      a.eventId.localeCompare(b.eventId)
    );
  });
}

/** Calendar grouping is in the event timezone, never the device's timezone. */
export function historyMonths(groups: readonly TicketGroup[], language: string) {
  const months = new Map<string, { key: string; label: string; groups: TicketGroup[] }>();
  const format = new Intl.DateTimeFormat(language === 'ro' ? 'ro-RO' : 'en-GB', {
    timeZone: 'Europe/Bucharest', month: 'long', year: 'numeric',
  });
  const keyFormat = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit' });
  for (const group of groups) {
    const date = new Date(group.tickets[0]!.startTime);
    const parts = keyFormat.formatToParts(date);
    const key = parts.find(part => part.type === 'year')!.value + '-' + parts.find(part => part.type === 'month')!.value;
    const month = months.get(key);
    if (month) month.groups.push(group);
    else months.set(key, { key, label: format.format(date), groups: [group] });
  }
  return [...months.values()].sort((a, b) => b.key.localeCompare(a.key));
}

export function ticketTypeSummary(tickets: readonly UserTicket[]) {
  const types = new Map<string, number>();
  for (const ticket of tickets) types.set(ticket.ticketTypeName, (types.get(ticket.ticketTypeName) ?? 0) + 1);
  return [...types].map(([name, count]) => `${count} × ${name}`).join(' · ');
}
