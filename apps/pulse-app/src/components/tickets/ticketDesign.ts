// The email service embeds this pass template into its binary. PDF documents
// use the dedicated shared A4 renderer in ticketPdf.ts.
import design from "../../../../../api/internal/email/ticket-design.json";

export { formatTicketDate, type PrintableTicket } from "@packages/app-core/tickets/design";
import { escapeTicketHtml, formatTicketDate, type PrintableTicket } from "@packages/app-core/tickets/design";
export const ticketColors = design.colors;
export function renderTicketPass(ticket: PrintableTicket, qr: string, t: (key: string) => string) {
  // Only locally generated QR images may become image sources in a ticket.
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(qr)) throw new Error("INVALID_TICKET_QR_IMAGE");
  const values: Record<string, string> = {
    type: ticket.ticketTypeName, title: ticket.eventTitle,
    dateLabel: t("ticketPdf.dateAndTime"), date: formatTicketDate(ticket.startTime, t("date.unknown")),
    locationLabel: t("ticketPdf.location"), location: ticket.locationName,
    qr, qrLabel: t("ticketPdf.ticketQr"), codeLabel: t("ticketPdf.ticketCode"), id: ticket.id,
    hint: t("ticketPdf.validationHint"),
  };
  // Single-pass substitution: user text containing {{tokens}} stays literal.
  return design.template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => escapeTicketHtml(values[key] ?? ""));
}
