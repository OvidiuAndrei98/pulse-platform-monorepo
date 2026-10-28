"use client";

import { useEffect, useState } from "react";
import { CalendarDays, MapPin, Ticket } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ApiClient, type OperationResponse } from "@packages/api-client/src/Client";
import styles from "./checkoutResult.module.css";

type EventSummary = Pick<OperationResponse<"/events/{id}", "get">, "title" | "startTime" | "locationName" | "city">;

export function PaymentSuccessCheck() {
  return <div data-testid="checkout-success-check" className={styles.icon} aria-hidden="true">
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <path className={styles.checkPath} d="M9 20.5 16.5 28 31 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>;
}

/** Same confirmed-purchase summary as Native. This is not an entry QR code. */
export function CheckoutSuccessTicket({ eventId, orderId }: { eventId: string; orderId?: string }) {
  const { t, i18n } = useTranslation();
  const [event, setEvent] = useState<EventSummary>();
  useEffect(() => {
    const controller = new AbortController();
    setEvent(undefined);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
      void ApiClient.instance.get("/events/{id}", { params: { path: { id: eventId } }, signal: controller.signal })
        .then(value => {
          if (!controller.signal.aborted && value && typeof value.title === 'string') setEvent(value);
        }).catch(() => { /* Optional details must never hide a confirmed purchase. */ });
    }
    return () => controller.abort();
  }, [eventId]);
  const date = event?.startTime && Number.isFinite(Date.parse(event.startTime))
    ? new Intl.DateTimeFormat(i18n.language === "ro" ? "ro-RO" : "en-GB", {
      timeZone: "Europe/Bucharest", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(event.startTime)) : undefined;
  const location = [event?.locationName, event?.city].filter(Boolean).join(" · ");
  return <div data-testid="checkout-success-ticket" className={styles.ticket}>
    <div className={styles.ticketTop}>
      <img src="/spottr-logo-desktop.svg" alt="SPOTTR" width="120" height="20" className={styles.logo} draggable={false} />
      <span className={styles.issued}><Ticket size={12} aria-hidden="true" />{t("checkoutResult.issued")}</span>
    </div>
    <h2 className={styles.ticketTitle}>{event?.title || t("checkoutResult.ticketReady")}</h2>
    {(date || location) && <div className={styles.details}>
      {date && <div className={styles.detail}><CalendarDays size={14} aria-hidden="true" /><span>{date}</span></div>}
      {location && <div className={styles.detail}><MapPin size={14} aria-hidden="true" /><span>{location}</span></div>}
    </div>}
    <div className={styles.perforation} aria-hidden="true" />
    <p className={styles.ready}>{t("checkoutResult.readyForTheNight")}</p>
    {orderId && <p className={styles.reference}>{t("checkoutResult.orderReference", { reference: orderId.slice(-8).toUpperCase() })}</p>}
  </div>;
}
