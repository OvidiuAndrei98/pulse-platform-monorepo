import type { jsPDF as JsPdfDocument } from "jspdf";
import type { Event, InvitationTicket } from "@/core/DataProvider";
import { formatEventDateTime } from "@/features/events/dateFormat";

type PdfCopy = {
  invitation: string;
  dateAndTime: string;
  location: string;
  ticketCode: string;
  validationHint: string;
};

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "invitations";
}

function fitText(doc: JsPdfDocument, text: string, maxWidth: number) {
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  return lines.slice(0, 2);
}

export async function createInvitationBatchPdf(
  event: Event,
  invitations: InvitationTicket[],
  copy: PdfCopy,
) {
  const [{ jsPDF }, { default: QRCode }] = await Promise.all([import("jspdf"), import("qrcode")]);
  const activeInvitations = invitations
    .filter((invitation) => invitation.status === "active")
    .sort((a, b) => a.batchIndex - b.batchIndex);
  if (activeInvitations.length === 0) throw new Error("NO_ACTIVE_INVITATIONS");

  const qrCodes = await Promise.all(activeInvitations.map((invitation) => QRCode.toDataURL(invitation.validationHash, {
    width: 700,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  })));
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });

  activeInvitations.forEach((invitation, index) => {
    if (index > 0) doc.addPage();
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 297, "F");
    doc.setDrawColor(204, 212, 204);
    doc.roundedRect(16, 16, 178, 265, 5, 5, "S");

    doc.setTextColor(46, 125, 50);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("SPOTTR", 28, 35);

    doc.setTextColor(17, 17, 17);
    doc.setFontSize(25);
    doc.text(fitText(doc, event.title, 150), 28, 51);

    doc.setFontSize(11);
    doc.setTextColor(83, 96, 85);
    doc.text(fitText(doc, invitation.label, 150), 28, 68);

    const ticketType = invitation.ticketType || copy.invitation;
    doc.setDrawColor(46, 125, 50);
    doc.setFillColor(247, 251, 247);
    doc.setFontSize(9);
    const badgeLabel = (doc.splitTextToSize(ticketType, 142) as string[])[0];
    const badgeWidth = Math.min(154, Math.max(34, doc.getTextWidth(badgeLabel) + 12));
    doc.roundedRect(28, 76, badgeWidth, 13, 6, 6, "FD");
    doc.setTextColor(46, 125, 50);
    doc.text(badgeLabel, 34, 84.5);

    doc.addImage(qrCodes[index], "PNG", 55, 101, 100, 100);

    doc.setDrawColor(220, 225, 220);
    doc.line(28, 209, 182, 209);

    doc.setFontSize(8);
    doc.setTextColor(83, 96, 85);
    doc.text(copy.dateAndTime.toUpperCase(), 28, 216);
    doc.text(copy.location.toUpperCase(), 111, 216);
    doc.setFontSize(11);
    doc.setTextColor(17, 17, 17);
    doc.text(fitText(doc, formatEventDateTime(event.startTime), 70), 28, 224);
    doc.text(fitText(doc, event.locationName, 70), 111, 224);

    doc.setFontSize(8);
    doc.setTextColor(83, 96, 85);
    doc.text(copy.ticketCode.toUpperCase(), 28, 244);
    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    doc.setTextColor(17, 17, 17);
    doc.text(invitation.id, 28, 251);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(83, 96, 85);
    doc.text(fitText(doc, copy.validationHint, 154), 28, 265);
  });

  const fileName = `${safeFileName(event.title)}-${safeFileName(activeInvitations[0].label)}.pdf`;
  return { blob: doc.output("blob"), fileName, count: activeInvitations.length };
}

export function downloadPdfBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
