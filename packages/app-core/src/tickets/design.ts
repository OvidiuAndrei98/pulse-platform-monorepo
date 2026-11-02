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
