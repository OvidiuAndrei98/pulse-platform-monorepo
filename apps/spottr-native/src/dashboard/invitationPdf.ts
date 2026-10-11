import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { File } from "expo-file-system";
import type { PrintableTicket } from "../../../pulse-app/src/components/tickets/ticketDesign";
import { renderInvitationPdf } from "./invitationPdfHtml";
export async function exportInvitationBatch(
  tickets: PrintableTicket[],
  qrs: string[],
  copy: (key: string) => string,
  language: string,
  share: boolean,
  isActive: () => boolean,
) {
  if (!isActive()) return;
  const result = await Print.printToFileAsync({
      html: renderInvitationPdf(tickets, qrs, copy, language),
      width: 595,
      height: 842,
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
    }),
    file = new File(result.uri);
  try {
    if (!isActive()) return;
    const available = await Sharing.isAvailableAsync();
    if (!isActive()) return;
    if (available)
      await Sharing.shareAsync(result.uri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: tickets[0]?.eventTitle,
      });
    else await Print.printAsync({ uri: result.uri });
  } finally {
    if (file.exists) file.delete();
  }
}
