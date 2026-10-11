import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { File } from "expo-file-system";
import { renderTicketPdfHtml } from "../../../pulse-app/src/components/tickets/ticketPdfHtml";
import type { PrintableTicket } from "../../../pulse-app/src/components/tickets/ticketDesign";
export async function exportTicket(
  ticket: PrintableTicket,
  qr: string,
  copy: (key: string) => string,
  language: string,
  isActive: () => boolean = () => true,
) {
  const html = renderTicketPdfHtml(ticket, qr, copy, language);
  const result = await Print.printToFileAsync({
    html,
    width: 595,
    height: 842,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  const file = new File(result.uri);
  try {
    if (!isActive()) return;
    const sharingAvailable = await Sharing.isAvailableAsync();
    if (!isActive()) return;
    if (sharingAvailable)
      await Sharing.shareAsync(result.uri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: ticket.eventTitle,
      });
    else await Print.printAsync({ uri: result.uri });
  } finally {
    if (file.exists) file.delete();
  }
}
