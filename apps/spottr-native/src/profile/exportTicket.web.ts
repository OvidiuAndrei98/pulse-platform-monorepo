import {
  createTicketPdf,
  downloadPdf,
} from "@packages/browser-core/tickets/ticketPdf";
import type { PrintableTicket } from "@packages/app-core/tickets/design";
export async function exportTicket(
  ticket: PrintableTicket,
  _qr: string,
  copy: (key: string) => string,
  language: string,
  isActive: () => boolean = () => true,
) {
  const result = await createTicketPdf([ticket], copy, language);
  if (isActive()) downloadPdf(result.blob, result.fileName);
}
