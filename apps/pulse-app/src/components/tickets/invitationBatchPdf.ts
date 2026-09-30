import type { Event, InvitationTicket } from "@/core/DataProvider";
import { renderTicketPass } from "./ticketDesign";

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

export async function createInvitationBatchPdf(
  event: Event,
  invitations: InvitationTicket[],
  copy: PdfCopy,
) {
  const [{ jsPDF }, { default: QRCode }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("qrcode"), import("html2canvas")]);
  const activeInvitations = invitations.filter(invitation => invitation.status === "active").sort((a, b) => a.batchIndex - b.batchIndex);
  if (!activeInvitations.length) throw new Error("NO_ACTIVE_INVITATIONS");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  // A clean document avoids importing app CSS into the canvas renderer and
  // preserves Unicode text (names/diacritics) in the generated PDF.
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  Object.assign(frame.style, { position: "fixed", left: "-10000px", top: "0", width: "480px", height: "1200px", border: "0" });
  document.body.appendChild(frame);
  try {
    const page = frame.contentDocument!;
    page.open();
    page.write('<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:white}*{box-sizing:border-box}</style></head><body><main style="width:440px"></main></body></html>');
    page.close();
    const surface = page.querySelector("main")!;
    const labels: Record<string, string> = { "ticketPdf.dateAndTime": copy.dateAndTime, "ticketPdf.location": copy.location, "ticketPdf.ticketCode": copy.ticketCode, "ticketPdf.ticketQr": copy.invitation, "ticketPdf.validationHint": copy.validationHint, "date.unknown": "—" };
    for (const [index, invitation] of activeInvitations.entries()) {
      const qr = await QRCode.toDataURL(invitation.validationHash, { width: 700, margin: 4, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
      surface.innerHTML = renderTicketPass({ id: invitation.id, eventTitle: event.title, ticketTypeName: [invitation.ticketType || copy.invitation, invitation.label].filter(Boolean).join(" · "), startTime: event.startTime, locationName: event.locationName, validationHash: invitation.validationHash }, qr, key => labels[key] ?? key);
      await Promise.all([...surface.querySelectorAll("img")].map(image => image.decode()));
      const canvas = await html2canvas(surface, { scale: 3, backgroundColor: "#ffffff", logging: false });
      if (index) doc.addPage();
      // Fit the complete ticket, including long event names, on one A4 page.
      const width = Math.min(150, 265 * canvas.width / canvas.height);
      doc.addImage(canvas.toDataURL("image/png"), "PNG", (210 - width) / 2, 16, width, width * canvas.height / canvas.width);
    }
  } finally {
    frame.remove();
  }

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
