import type { ReadableSchema } from "@packages/api-client/src/Client";
type TicketTier = Pick<ReadableSchema<"TicketTypeResponse">, "id" | "capacity" | "ticketsSold" | "startSales" | "endSales">;

export type TicketAvailability =
  | "checking"
  | "available"
  | "sold-out"
  | "sales-ended"
  | "sales-not-started";

export function getTicketAvailability(
  ticket: TicketTier,
  nowMs: number | null,
): TicketAvailability {
  if (!Number.isFinite(ticket.capacity) || ticket.capacity <= 0 ||
      !Number.isFinite(ticket.ticketsSold ?? 0) || (ticket.ticketsSold ?? 0) < 0 ||
      (ticket.ticketsSold ?? 0) >= ticket.capacity) {
    return "sold-out";
  }
  if (nowMs === null) {
    return "checking";
  }

  const salesStartMs = Date.parse(ticket.startSales);
  const salesEndMs = Date.parse(ticket.endSales);
  if (!Number.isFinite(nowMs) || !Number.isFinite(salesStartMs) || !Number.isFinite(salesEndMs) || salesEndMs <= salesStartMs) {
    return "sales-ended";
  }
  if (nowMs < salesStartMs) {
    return "sales-not-started";
  }
  if (nowMs >= salesEndMs) {
    return "sales-ended";
  }
  return "available";
}

export function getRemainingTicketCapacity(ticket: TicketTier): number {
  return Math.max(0, ticket.capacity - (ticket.ticketsSold ?? 0));
}

export function isTicketSelectionAvailable(
  tickets: readonly TicketTier[],
  quantities: Record<string, number>,
  nowMs = Date.now(),
): boolean {
  const ticketsById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  if (Object.values(quantities).some((quantity) => !Number.isInteger(quantity) || quantity < 0)) return false;
  const selected = Object.entries(quantities).filter(([, quantity]) => quantity > 0);
  return selected.length > 0 && selected.every(([ticketId, quantity]) => {
    const ticket = ticketsById.get(ticketId);
    return Boolean(
      ticket &&
      getTicketAvailability(ticket, nowMs) === "available" &&
      quantity <= getRemainingTicketCapacity(ticket),
    );
  });
}

