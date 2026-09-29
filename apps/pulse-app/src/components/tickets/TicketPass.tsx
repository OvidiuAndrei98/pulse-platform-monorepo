"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";
import { renderTicketPass, type PrintableTicket } from "./ticketDesign";
import { RequestError } from "@/components/ui/RequestFeedback";

export function TicketPass({ ticket }: { ticket: PrintableTicket }) {
  const { t } = useTranslation();
  const [result, setResult] = useState({ hash: "", image: "", failed: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setResult({ hash: ticket.validationHash, image: "", failed: false });
    QRCode.toDataURL(ticket.validationHash, { width: 480, margin: 4, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then(image => { if (active) setResult({ hash: ticket.validationHash, image, failed: false }); })
      .catch(() => { if (active) setResult({ hash: ticket.validationHash, image: "", failed: true }); });
    return () => { active = false; };
  }, [ticket.validationHash, attempt]);
  if (result.hash === ticket.validationHash && result.failed) return <RequestError onRetry={() => setAttempt(value => value + 1)} />;
  if (result.hash !== ticket.validationHash || !result.image) return <div role="status" aria-label={t("common.loading")} className="mx-auto h-[540px] w-full max-w-[440px] animate-pulse rounded-3xl border border-white/10 bg-white/5" />;
  return <div dangerouslySetInnerHTML={{ __html: renderTicketPass(ticket, result.image, t) }} />;
}
