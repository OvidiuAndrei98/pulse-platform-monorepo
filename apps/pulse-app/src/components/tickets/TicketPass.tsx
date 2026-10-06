"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";
import { formatTicketDate, type PrintableTicket } from "./ticketDesign";
import { RequestError } from "@/components/ui/RequestFeedback";
import styles from "./ticketPass.module.css";

export function TicketPass({ ticket, status = "active" }: {
  ticket: PrintableTicket;
  status?: "active" | "used" | "expired";
}) {
  const { t } = useTranslation();
  const [result, setResult] = useState({ hash: "", image: "", failed: false });
  const [attempt, setAttempt] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const passRef = useRef<HTMLElement>(null);
  useEffect(() => {
    let active = true;
    setResult({ hash: ticket.validationHash, image: "", failed: false });
    QRCode.toDataURL(ticket.validationHash, { width: 480, margin: 4, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then(image => { if (active) setResult({ hash: ticket.validationHash, image, failed: false }); })
      .catch(() => { if (active) setResult({ hash: ticket.validationHash, image: "", failed: true }); });
    return () => { active = false; };
  }, [ticket.validationHash, attempt]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const pass = passRef.current;
    if (!viewport || !pass) return;
    const fit = () => {
      // Compact with CSS first; fit any remaining overflow without dropping data.
      const scale = Math.min(1, Math.max(0, viewport.clientHeight - 2) / Math.max(1, pass.offsetHeight),
        Math.max(0, viewport.clientWidth - 2) / Math.max(1, pass.offsetWidth));
      pass.style.setProperty("--ticket-scale", String(scale));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    observer.observe(pass);
    return () => observer.disconnect();
  }, []);

  const current = result.hash === ticket.validationHash;
  const ready = current && Boolean(result.image);
  return (
    <div ref={viewportRef} className={styles.viewport}>
      <article ref={passRef} data-ticket-pass className={styles.pass}>
        <header className={styles.header}>
          <img className={styles.logo} src="/spottr-logo-desktop.svg" width="120" height="20" alt="SPOTTR" draggable={false} />
          <p className={styles.type}>{ticket.ticketTypeName}</p>
          <h2 className={styles.title}>{ticket.eventTitle}</h2>
          <p className={styles.date}>
            <span className="sr-only">{t("ticketPdf.dateAndTime")}: </span>
            {formatTicketDate(ticket.startTime, t("date.unknown"))}
          </p>
        </header>
        <div className={styles.tear} aria-hidden="true" />
        <div className={styles.code}>
          <p className={styles.label}>{t("ticketPdf.ticketCode")}</p>
          <div className={styles.qr} aria-busy={!ready && !(current && result.failed)}>
            {current && result.failed ? (
              <RequestError onRetry={() => setAttempt(value => value + 1)} className={styles.qrError} />
            ) : ready ? (
              <img data-ticket-qr src={result.image} width="480" height="480" alt={t("ticketPdf.ticketQr")} draggable={false} />
            ) : (
              <div role="status" aria-label={t("common.loading")} className={styles.qrLoading} />
            )}
          </div>
          <p className={styles.id}>{ticket.id}</p>
        </div>
        <footer className={styles.details}>
          <a href={`https://maps.google.com/?q=${encodeURIComponent(ticket.locationName)}`} target="_blank" rel="noreferrer" className={styles.location}>
            <MapPin aria-hidden="true" />
            <span><span className="sr-only">{t("ticketPdf.location")}: </span>{ticket.locationName}</span>
          </a>
          {status !== "active" && <p role="status" className={styles.status}>
            {t(status === "used" ? "tickets.alreadyUsed" : "tickets.eventEnded")}
          </p>}
          <p className={styles.hint}>{t("ticketPdf.validationHint")}</p>
        </footer>
      </article>
    </div>
  );
}
