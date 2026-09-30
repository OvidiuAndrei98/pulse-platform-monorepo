import type { Event, InvitationTicket } from "@/core/DataProvider";
import { createTicketPdf, downloadPdf, safeFileName } from "./ticketPdf";

export async function createInvitationBatchPdf(
  event: Event,
  invitations: InvitationTicket[],
  t: (key: string) => string,
  language: string,
) {
  const activeInvitations = invitations.filter(invitation => invitation.status === "active").sort((a, b) => a.batchIndex - b.batchIndex);
  if (!activeInvitations.length) throw new Error("NO_ACTIVE_INVITATIONS");
  const pdf = await createTicketPdf(activeInvitations.map(invitation => ({
    id: invitation.id,
    eventTitle: event.title,
    ticketTypeName: [invitation.ticketType || t("invitations.general"), invitation.label].filter(Boolean).join(" · "),
    startTime: event.startTime,
    locationName: event.locationName,
    validationHash: invitation.validationHash,
    // Invitations are complimentary, not a purchase at today's ticket price.
    ticketPriceBani: 0,
    ticketingFeeBani: 0,
    paidTotalBani: 0,
  })), t, language);
  return { ...pdf, fileName: `${safeFileName(event.title)}-${safeFileName(activeInvitations[0].label)}.pdf` };
}

export { downloadPdf as downloadPdfBlob };
