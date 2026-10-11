import type { PrintableTicket } from "./ticketDesign";
import { renderTicketPdfHtml } from "./ticketPdfHtml";

export function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "ticket";
}

export async function createTicketPdf(
  tickets: readonly PrintableTicket[],
  t: (key: string, options?: Record<string, unknown>) => string,
  language: string,
) {
  if (!tickets.length) throw new Error("NO_TICKETS");
  const [{ jsPDF }, { default: QRCode }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("qrcode"),
    import("html2canvas"),
  ]);
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  for (const [index, ticket] of tickets.entries()) {
    const qrCode = await QRCode.toDataURL(ticket.validationHash, {
      width: 720,
      margin: 4,
      errorCorrectionLevel: "M",
      color: { dark: "#050505", light: "#ffffff" },
    });
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    Object.assign(frame.style, {
      position: "fixed",
      left: "-10000px",
      top: "0",
      width: "794px",
      height: "1123px",
      border: "0",
    });
    document.body.appendChild(frame);

    try {
      const page = frame.contentDocument;
      if (!page) throw new Error("PDF_DOCUMENT_UNAVAILABLE");
      page.open();
      page.write(renderTicketPdfHtml(ticket, qrCode, key => t(key), language));
      page.close();
      await page.fonts.ready;
      const image = page.querySelector("img");
      if (image) await image.decode();
      const surface = page.querySelector<HTMLElement>(".page");
      if (!surface) throw new Error("PDF_SURFACE_UNAVAILABLE");
      const canvas = await html2canvas(surface, { scale: 2, backgroundColor: "#ffffff", logging: false, useCORS: false });
      if (index) doc.addPage();
      const width = Math.min(210, 297 * canvas.width / canvas.height);
      doc.addImage(canvas.toDataURL("image/png"), "PNG", (210 - width) / 2, 0, width, width * canvas.height / canvas.width, undefined, "FAST");
    } finally {
      frame.remove();
    }
  }
  const ticket = tickets[0]!;
  return {
    blob: doc.output("blob"),
    fileName: `${safeFileName(ticket.eventTitle)}-${safeFileName(ticket.ticketTypeName)}-${ticket.id.slice(0, 8)}.pdf`,
    count: tickets.length,
  };
}

export function downloadPdf(blob: Blob, fileName: string) {
  const objectURL = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectURL;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectURL), 1_000);
}
