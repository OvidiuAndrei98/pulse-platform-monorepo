import {
  createTicketPdf,
  downloadPdf,
} from "../../../pulse-app/src/components/tickets/ticketPdf";
import type { PrintableTicket } from "../../../pulse-app/src/components/tickets/ticketDesign";
export async function exportInvitationBatch(
  tickets: PrintableTicket[],
  _qrs: string[],
  copy: (key: string) => string,
  language: string,
  share: boolean,
  isActive: () => boolean,
) {
  const result = await createTicketPdf(tickets, copy, language);
  if (!isActive()) return;
  const file = new File([result.blob], result.fileName, {
    type: "application/pdf",
  });
  if (
    share &&
    navigator.share &&
    (!navigator.canShare || navigator.canShare({ files: [file] }))
  ) {
    try {
      await navigator.share({ title: tickets[0]?.eventTitle, files: [file] });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        throw error;
    }
  } else downloadPdf(result.blob, result.fileName);
}
