"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PrintableTicket } from "./ticketDesign";
import { createTicketPdf, downloadPdf } from "./ticketPdf";

type TicketPdfButtonProps = {
  ticket: PrintableTicket;
  className?: string;
};

export function TicketPdfButton({ ticket, className }: TicketPdfButtonProps) {
  const { t, i18n } = useTranslation();
  const [isPreparing, setIsPreparing] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleDownload = async () => {
    setIsPreparing(true);
    setHasError(false);
    try {
      const pdf = await createTicketPdf([ticket], t, i18n.language);
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
