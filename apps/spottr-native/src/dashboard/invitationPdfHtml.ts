import { renderTicketPdfHtml } from "../../../pulse-app/src/components/tickets/ticketPdfHtml";
import type { PrintableTicket } from "../../../pulse-app/src/components/tickets/ticketDesign";
export function renderInvitationPdf(
  tickets: readonly PrintableTicket[],
  qrs: readonly string[],
  copy: (key: string) => string,
  language: string,
) {
  if (!tickets.length || tickets.length !== qrs.length)
    throw new Error("INVALID_INVITATION_PAGES");
  const pages = tickets.map((ticket, index) =>
    renderTicketPdfHtml(ticket, qrs[index]!, copy, language),
  );
  const first = pages[0]!;
  const styles = first.slice(
    first.indexOf("<style>") + 7,
    first.indexOf("</style>"),
  );
  const contents = pages.map((page) =>
    page.slice(page.indexOf("<main "), page.lastIndexOf("</main>") + 7),
  );
  return `<!doctype html><html><head><meta charset="utf-8"><style>${styles} html,body{height:auto;} .page{break-after:page;page-break-after:always;} .page:last-child{break-after:auto;page-break-after:auto;}</style></head><body>${contents.join("")}</body></html>`;
}
