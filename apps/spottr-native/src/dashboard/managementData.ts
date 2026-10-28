import type { components } from "@packages/api-client/src/schema";
import type { PrintableTicket } from "../../../pulse-app/src/components/tickets/ticketDesign";
type S = components["schemas"];
export function financeSummary(
  rows: readonly S["OrganizerFinanceEventResponse"][],
) {
  return rows.reduce(
    (total, row) => ({
      customerTotal:
        total.customerTotal +
        row.grossRevenueRon +
        row.customerTicketingFeeBani / 100,
      platformFee: total.platformFee + row.platformFeeBani / 100,
      tickets: total.tickets + row.ticketsSold,
      refunds: total.refunds + row.refundsNeedingAttention,
    }),
    { customerTotal: 0, platformFee: 0, tickets: 0, refunds: 0 },
  );
}
export function invoiceStats(rows: readonly S["BillingInvoiceResponse"][]) {
  return {
    issued: rows.filter((row) => row.status === "issued").length,
    inProgress: rows.filter((row) =>
      [row.status, row.refundStatus].some(
        (value) => value === "pending" || value === "processing" || value === "dispatching",
      ),
    ).length,
    attention: rows.filter((row) =>
      [row.status, row.refundStatus].some(
        (value) => value === "failed" || value === "needs_review",
      ),
    ).length,
  };
}
export function invitationBatches(
  rows: readonly S["InvitationTicketResponse"][],
) {
  const groups = new Map<string, S["InvitationTicketResponse"][]>();
  for (const row of rows) {
    const key = row.batchId || row.id;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return Array.from(groups, ([id, items]) => ({
    id,
    label: items[0]!.label,
    ticketType: items[0]!.ticketType,
    items: items.sort((a, b) => a.batchIndex - b.batchIndex),
  }));
}
export const invitationQuantity = (value: string) =>
  Math.min(100, Math.max(1, Number.parseInt(value, 10) || 1));
export function invitationTickets(
  event: Pick<S["EventResponse"], "title" | "startTime" | "locationName">,
  rows: readonly S["InvitationTicketResponse"][],
  general: string,
): PrintableTicket[] {
  return rows
    .filter((row) => row.status === "active")
    .slice()
    .sort((a, b) => a.batchIndex - b.batchIndex)
    .map((row) => ({
      id: row.id,
      eventTitle: event.title,
      ticketTypeName: [row.ticketType || general, row.label]
        .filter(Boolean)
        .join(" · "),
      validationHash: row.validationHash,
      startTime: event.startTime,
      locationName: event.locationName,
      ticketPriceBani: 0,
      ticketingFeeBani: 0,
      paidTotalBani: 0,
    }));
}
