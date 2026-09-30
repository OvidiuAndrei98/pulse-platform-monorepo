"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { escapeTicketHtml as escapeHtml, formatTicketDate, type PrintableTicket } from "./ticketDesign";

type TicketPdfButtonProps = {
  ticket: PrintableTicket;
  className?: string;
};

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "ticket";
}

async function createTicketPdf(
  ticket: PrintableTicket,
  t: (key: string, options?: Record<string, unknown>) => string,
  language: string,
) {
  const [{ jsPDF }, { default: QRCode }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("qrcode"),
    import("html2canvas"),
  ]);
  const qrCode = await QRCode.toDataURL(ticket.validationHash, {
    width: 720,
    margin: 4,
    errorCorrectionLevel: "M",
    color: { dark: "#050505", light: "#ffffff" },
  });
  const locale = language === "ro" ? "ro-RO" : "en-GB";
  const formatMoney = (bani: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "RON" }).format(bani / 100);
  const price = ticket.ticketPriceBani !== undefined ? formatMoney(ticket.ticketPriceBani) : ticket.priceRon === undefined
    ? "—"
    : `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ticket.priceRon)} RON`;
  const date = formatTicketDate(ticket.startTime, t("date.unknown"));
  const fee = ticket.ticketingFeeBani === undefined ? "—" : formatMoney(ticket.ticketingFeeBani);
  const total = ticket.paidTotalBani === undefined ? "—" : formatMoney(ticket.paidTotalBani);
  const vat = ticket.vatAmountBani === undefined ? t("ticketPdf.vatOnInvoice") : formatMoney(ticket.vatAmountBani);
  const vatLabel = t("ticketPdf.includedVat") + (ticket.vatPercentage === undefined ? "" : ` (${new Intl.NumberFormat(locale).format(ticket.vatPercentage)}%)`);
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
    page.write(`<!doctype html>
      <html lang="${escapeHtml(language)}">
        <head>
          <meta charset="utf-8" />
          <style>
            * { box-sizing: border-box; }
            html, body { margin: 0; width: 794px; height: 1123px; background: #eef0f2; color: #111111; }
            body { font-family: Arial, Helvetica, sans-serif; }
            .page { display: flex; flex-direction: column; width: 794px; min-height: 1123px; padding: 54px 58px 44px; background: #ffffff; }
            .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 28px; padding-bottom: 28px; border-bottom: 2px solid #111111; }
            .brand { font-size: 24px; font-weight: 900; letter-spacing: 5px; }
            .brand-dot { color: #ff174f; }
            .eyebrow { color: #666666; }
            .document { text-align: right; }
            .document strong { display: block; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; }
            .document span { display: block; margin-top: 7px; color: #6a6a6a; font: 12px/1.4 monospace; }
            .hero { padding: 34px 0 28px; }
            .eyebrow { font-size: 12px; font-weight: 800; letter-spacing: 2.4px; text-transform: uppercase; }
            h1 { max-width: 610px; margin: 10px 0 0; font-size: 40px; line-height: 1.08; letter-spacing: -1.2px; overflow-wrap: anywhere; }
            .ticket-type { margin-top: 16px; color: #333333; font-size: 16px; line-height: 1.5; overflow-wrap: anywhere; }
            .ticket { display: flex; border-top: 1px solid #cccccc; border-bottom: 1px solid #cccccc; }
            .details { min-width: 0; flex: 1; padding: 28px 28px 8px 0; }
            .details h2 { margin: 0 0 20px; font-size: 13px; letter-spacing: 1.8px; text-transform: uppercase; }
            .field { padding: 0 0 20px; margin: 0 0 20px; border-bottom: 1px solid #dddddd; }
            .field:last-of-type { margin-bottom: 0; }
            .label { color: #777777; font-size: 10px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase; }
            .value { margin-top: 7px; font-size: 17px; font-weight: 700; line-height: 1.35; overflow-wrap: anywhere; }
            .qr { display: flex; flex: 0 0 270px; flex-direction: column; align-items: center; justify-content: center; padding: 20px 12px; border-left: 1px dashed #bcbcbc; background: #ffffff; text-align: center; }
            .qr img { display: block; width: 224px; height: 224px; }
            .qr-label { margin-top: 15px; color: #777777; font-size: 9px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase; }
            .qr-code { max-width: 238px; margin-top: 6px; color: #333333; font: 10px/1.45 monospace; overflow-wrap: anywhere; word-break: break-all; }
            .payment { margin-top: 30px; width: 100%; border-collapse: collapse; font-size: 14px; }
            .payment td { padding: 10px 0; vertical-align: top; }
            .payment td:last-child { text-align: right; padding-left: 24px; font-weight: 600; white-space: nowrap; }
            .payment .vat { color: #666666; font-size: 12px; }
            .payment .total td { border-top: 1px solid #111111; padding-top: 16px; font-size: 19px; font-weight: 800; }
            .entry-note { margin: 28px 0 40px; color: #666666; font-size: 12px; line-height: 1.6; }
            .footer { margin-top: auto; padding-top: 15px; border-top: 1px solid #dddddd; color: #777777; font-size: 10px; }
          </style>
        </head>
        <body>
          <main class="page" data-ticket-pdf="true">
            <header class="top">
              <div class="brand">SPOTTR<span class="brand-dot">.</span></div>
              <div class="document">
                <strong>${escapeHtml(t("ticketPdf.accessTicket"))}</strong>
                <span>${escapeHtml(ticket.id)}</span>
              </div>
            </header>
            <section class="hero">
              <div class="eyebrow">${escapeHtml(t("ticketPdf.admitOne"))}</div>
              <h1>${escapeHtml(ticket.eventTitle)}</h1>
              <div class="ticket-type">${escapeHtml(t("ticketPdf.ticketType"))}: <strong>${escapeHtml(ticket.ticketTypeName)}</strong></div>
            </section>
            <section class="ticket">
              <div class="details">
                <h2>${escapeHtml(t("ticketPdf.eventDetails"))}</h2>
                <div class="field"><div class="label">${escapeHtml(t("ticketPdf.dateAndTime"))}</div><div class="value">${escapeHtml(date)}</div></div>
                <div class="field"><div class="label">${escapeHtml(t("ticketPdf.location"))}</div><div class="value">${escapeHtml(ticket.locationName)}</div></div>
              </div>
              <div class="qr">
                <img src="${qrCode}" alt="${escapeHtml(t("ticketPdf.ticketQr"))}" />
                <div class="qr-label">${escapeHtml(t("ticketPdf.ticketCode"))}</div>
                <div class="qr-code">${escapeHtml(ticket.id)}</div>
              </div>
            </section>
            <table class="payment">
              <tr><td>${escapeHtml(t("ticketPdf.ticketValue"))}</td><td>${escapeHtml(price)}</td></tr>
              <tr><td>${escapeHtml(t("ticketPdf.ticketingFee"))}</td><td>${escapeHtml(fee)}</td></tr>
              <tr class="vat"><td>${escapeHtml(vatLabel)}</td><td>${escapeHtml(vat)}</td></tr>
              <tr class="total"><td>${escapeHtml(t("ticketPdf.totalPaid"))}</td><td>${escapeHtml(total)}</td></tr>
            </table>
            <p class="entry-note">${escapeHtml(t("ticketPdf.validationHint"))}</p>
            <footer class="footer">spottr.ro</footer>
          </main>
        </body>
      </html>`);
    page.close();
    await page.fonts.ready;
    const image = page.querySelector("img");
    if (image) await image.decode();
    const surface = page.querySelector<HTMLElement>(".page");
    if (!surface) throw new Error("PDF_SURFACE_UNAVAILABLE");
    const canvas = await html2canvas(surface, { scale: 2, backgroundColor: "#ffffff", logging: false, useCORS: false });
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    const width = Math.min(210, 297 * canvas.width / canvas.height);
    doc.addImage(canvas.toDataURL("image/png"), "PNG", (210 - width) / 2, 0, width, width * canvas.height / canvas.width, undefined, "FAST");
    return {
      blob: doc.output("blob"),
      fileName: `${safeFileName(ticket.eventTitle)}-${safeFileName(ticket.ticketTypeName)}-${ticket.id.slice(0, 8)}.pdf`,
    };
  } finally {
    frame.remove();
  }
}

function downloadPdf(blob: Blob, fileName: string) {
  const objectURL = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectURL;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectURL), 1_000);
}

export function TicketPdfButton({ ticket, className }: TicketPdfButtonProps) {
  const { t, i18n } = useTranslation();
  const [isPreparing, setIsPreparing] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleDownload = async () => {
    setIsPreparing(true);
    setHasError(false);
    try {
      const pdf = await createTicketPdf(ticket, t, i18n.language);
      downloadPdf(pdf.blob, pdf.fileName);
    } catch {
      setHasError(true);
    } finally {
      setIsPreparing(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleDownload()}
      disabled={isPreparing}
      title={hasError ? t("ticketPdf.generationFailed") : undefined}
      className={className ?? "flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-medium text-white transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"}
    >
      <Download className="h-4 w-4" />
      {isPreparing ? t("ticketPdf.preparing") : hasError ? t("ticketPdf.tryAgain") : t("ticketPdf.downloadPdf")}
    </button>
  );
}
