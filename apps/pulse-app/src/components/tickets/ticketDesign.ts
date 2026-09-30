// The email service embeds this pass template into its binary. PDF documents
// use the dedicated shared A4 renderer in ticketPdf.ts.
import design from "../../../../../api/internal/email/ticket-design.json";

export type PrintableTicket = {
  id: string;
  eventTitle: string;
  ticketTypeName: string;
  validationHash: string;
  startTime: string;
  locationName: string;
  priceRon?: number;
  ticketPriceBani?: number;
  ticketingFeeBani?: number;
  paidTotalBani?: number;
  vatPercentage?: number;
  vatAmountBani?: number;
  organizerCompanyName?: string;
  organizerCui?: string;
  organizerFiscalAddress?: string;
};

export const ticketColors = design.colors;
export function formatTicketDate(value: string, unknown: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return unknown;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Bucharest", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return `${part("day")}.${part("month")}.${part("year")} · ${part("hour")}:${part("minute")}`;
}
export function escapeTicketHtml(value: string) {
  return value.replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]!);
}

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
