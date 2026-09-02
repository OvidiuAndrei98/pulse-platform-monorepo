"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { Download } from "lucide-react";
import { formatEventDateTime } from "@/features/events/dateFormat";
import { useTranslation } from "react-i18next";

type PrintableTicket = {
  id: string;
  eventTitle: string;
  ticketTypeName: string;
  validationHash: string;
  startTime: string;
  locationName: string;
  priceRon?: number;
  organizerCompanyName?: string;
  organizerCui?: string;
  organizerFiscalAddress?: string;
};

type TicketPdfButtonProps = {
  ticket: PrintableTicket;
  className?: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;",
  })[character] ?? character);
}

async function openTicketPdf(ticket: PrintableTicket, t: (key: string, options?: Record<string, unknown>) => string, language: string) {
  const printWindow = window.open("", "_blank", "popup,width=760,height=900");
  if (!printWindow) throw new Error("PRINT_POPUP_BLOCKED");

  printWindow.document.write(`<!doctype html><title>${escapeHtml(t("ticketPdf.preparingTitle"))}</title><body style="margin:0;background:#101311"></body>`);
  printWindow.document.close();

  const qrCode = await QRCode.toDataURL(ticket.validationHash, {
    width: 480,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
  const date = formatEventDateTime(ticket.startTime);
  const price = ticket.priceRon;
  const formatRon = (amount: number) => `${new Intl.NumberFormat(language === "ro" ? "ro-RO" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} RON`;
  const organizerDetails = ticket.organizerCompanyName
    ? `<section class="details"><h2>${escapeHtml(t("ticketPdf.organizer"))}</h2><dl><div><dt>${escapeHtml(t("ticketPdf.companyName"))}</dt><dd>${escapeHtml(ticket.organizerCompanyName)}</dd></div><div><dt>${escapeHtml(t("ticketPdf.cui"))}</dt><dd>${escapeHtml(ticket.organizerCui || "-")}</dd></div><div><dt>${escapeHtml(t("ticketPdf.fiscalAddress"))}</dt><dd>${escapeHtml(ticket.organizerFiscalAddress || "-")}</dd></div></dl></section>`
    : "";
  const paymentDetails = price === undefined
    ? ""
    : `<section class="details"><h2>${escapeHtml(t("ticketPdf.ticketValue"))}</h2><dl><div><dt>${escapeHtml(t("ticketPdf.price"))}</dt><dd>${formatRon(price)}</dd></div></dl></section>`;

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html lang="${escapeHtml(language)}">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(ticket.eventTitle)} - ${escapeHtml(t("ticketPdf.ticket"))}</title>
        <style>
          @page { size: A4; margin: 18mm; }
          * { box-sizing: border-box; }
          body { margin: 0; background: #101311; color: #f5f7f5; font-family: Arial, Helvetica, sans-serif; }
          main { width: min(100%, 680px); margin: 40px auto; border: 1px solid #2d3830; background: #111612; }
          header { padding: 32px; border-bottom: 1px solid #2d3830; }
          .eyebrow { margin: 0 0 12px; color: #8cff5a; font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
          h1 { margin: 0; font-size: 28px; line-height: 1.15; }
          .type { display: inline-block; margin-top: 16px; border: 1px solid #4d8d37; border-radius: 999px; padding: 5px 9px; color: #8cff5a; font-size: 12px; font-weight: 700; }
          section { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 28px; padding: 32px; align-items: center; }
          .details { display: block; padding: 24px 32px; border-top: 1px solid #2d3830; }
          .details h2 { margin: 0 0 18px; font-size: 14px; }
          dl { margin: 0; display: grid; gap: 20px; }
          dt { margin-bottom: 5px; color: #aab2ac; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
          dd { margin: 0; font-size: 15px; line-height: 1.45; }
          .id { color: #aab2ac; font-family: monospace; font-size: 11px; overflow-wrap: anywhere; }
          img { display: block; width: 220px; height: 220px; background: white; padding: 10px; }
          footer { padding: 20px 32px; border-top: 1px solid #2d3830; color: #aab2ac; font-size: 12px; }
          @media print { body { background: #fff; color: #111; } main { margin: 0 auto; border-color: #ccd4cc; background: #fff; } header, footer { border-color: #ccd4cc; } .eyebrow, .type { color: #2e7d32; } .type { border-color: #2e7d32; } dt, .id, footer { color: #536055; } }
          @media (max-width: 560px) { main { margin: 0; } section { grid-template-columns: 1fr; } img { width: min(100%, 260px); height: auto; } }
        </style>
      </head>
      <body>
        <main>
          <header>
            <p class="eyebrow">${escapeHtml(t("ticketPdf.glowTicket"))}</p>
            <h1>${escapeHtml(ticket.eventTitle)}</h1>
            <span class="type">${escapeHtml(ticket.ticketTypeName)}</span>
          </header>
          <section>
            <dl>
              <div><dt>${escapeHtml(t("ticketPdf.dateAndTime"))}</dt><dd>${escapeHtml(date)}</dd></div>
              <div><dt>${escapeHtml(t("ticketPdf.location"))}</dt><dd>${escapeHtml(ticket.locationName)}</dd></div>
              <div><dt>${escapeHtml(t("ticketPdf.ticketCode"))}</dt><dd class="id">${escapeHtml(ticket.id)}</dd></div>
            </dl>
            <img src="${qrCode}" alt="${escapeHtml(t("ticketPdf.ticketQr"))}" />
          </section>
          ${organizerDetails}
          ${paymentDetails}
          <footer>${escapeHtml(t("ticketPdf.validationHint"))}</footer>
        </main>
        <script>window.onload = () => window.print(); window.onafterprint = () => window.close();<\/script>
      </body>
    </html>`);
  printWindow.document.close();
}

export function TicketPdfButton({ ticket, className }: TicketPdfButtonProps) {
  const { t, i18n } = useTranslation();
  const [isPreparing, setIsPreparing] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleDownload = async () => {
    setIsPreparing(true);
    setHasError(false);
    try {
      await openTicketPdf(ticket, t, i18n.language);
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
      title={hasError ? t("ticketPdf.popupBlocked") : undefined}
      className={className ?? "flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-medium text-white transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"}
    >
      <Download className="h-4 w-4" />
      {isPreparing ? t("ticketPdf.preparing") : hasError ? t("ticketPdf.allowPopup") : t("ticketPdf.downloadPdf")}
    </button>
  );
}
