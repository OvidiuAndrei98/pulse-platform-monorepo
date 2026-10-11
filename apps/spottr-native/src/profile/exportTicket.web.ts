import {
  createTicketPdf,
  downloadPdf,
} from "../../../pulse-app/src/components/tickets/ticketPdf";
import type { PrintableTicket } from "../../../pulse-app/src/components/tickets/ticketDesign";
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
