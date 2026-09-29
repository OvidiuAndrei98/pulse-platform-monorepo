"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { Download } from "lucide-react";
import { renderTicketPass, escapeTicketHtml as escapeHtml, type PrintableTicket } from "./ticketDesign";
import { useTranslation } from "react-i18next";

type TicketPdfButtonProps = {
  ticket: PrintableTicket;
  className?: string;
};

async function openTicketPdf(ticket: PrintableTicket, t: (key: string, options?: Record<string, unknown>) => string, language: string) {
  const printWindow = window.open("", "_blank", "popup,width=760,height=900");
  if (!printWindow) throw new Error("PRINT_POPUP_BLOCKED");

  printWindow.document.write(`<!doctype html><title>${escapeHtml(t("ticketPdf.preparingTitle"))}</title><body style="margin:0;background:#101311"></body>`);
  printWindow.document.close();

  const qrCode = await QRCode.toDataURL(ticket.validationHash, {
    width: 480,
    margin: 4,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
  const card = renderTicketPass(ticket, qrCode, t);
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
          @page { size: A4; margin: 12mm; }
          * { box-sizing: border-box; }
          body { margin: 0; background: #000; color: #fff; font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          main { max-width: 440px; margin: 24px auto; }
          [data-ticket-pass] { break-inside: avoid; }
          .details { padding: 20px 22px; margin-top: 16px; border: 1px solid #343434; border-radius: 24px; background: #0a0a0a; break-inside: avoid; }
          .details h2 { margin: 0 0 12px; color: #ff0044; font-size: 13px; }
          dl { margin: 0; } dt { margin-top: 12px; color: #999; font-size: 10px; } dd { margin: 4px 0 0; color: #fff; font-size: 12px; overflow-wrap: anywhere; }
          @media print { body { background: #fff; } main { margin: 0 auto; } }
          @media (max-width: 480px) { main { margin: 12px; } }
        </style>
      </head>
      <body>
        <main>
          ${card}
          ${organizerDetails}
          ${paymentDetails}
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
