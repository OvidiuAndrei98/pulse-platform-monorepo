"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, ArrowRight, Clock3, LoaderCircle, Mail, Ticket, WifiOff } from "lucide-react";
import { useDataProvider } from "@/core/DataProviderContext";
import { useTranslation } from "react-i18next";
import { ApiClient } from "@packages/api-client/src/Client";
import { checkPaymentConfirmation, type ConfirmationResult } from "@/features/checkout/confirmation";

import { CheckoutSuccessTicket, PaymentSuccessCheck } from "@/features/checkout/CheckoutSuccessTicket";
import styles from "@/features/checkout/checkoutResult.module.css";

type ConfirmationStatus = "checking" | "invalid" | ConfirmationResult;

export default function CheckoutSuccessPage() {
  const { user, loading } = useDataProvider();
  const { t } = useTranslation();
  const [confirmationStatus, setConfirmationStatus] = useState<ConfirmationStatus>("checking");
  const [attempt, setAttempt] = useState(0);
  const [purchase, setPurchase] = useState<{ eventId: string; orderId?: string }>();

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const eventId = params.get("event_id");
    if (!sessionId || !eventId) {
      setConfirmationStatus("invalid");
      return;
    }

    setPurchase({ eventId });
    setConfirmationStatus("checking");
    void checkPaymentConfirmation(
      async () => {
        const response = await ApiClient.instance.post("/checkout/reconcile", { body: { sessionId, eventId } });
        if (active && typeof response.orderId === "string") setPurchase({ eventId, orderId: response.orderId });
        return response;
      },
      () => active,
    ).then((status) => { if (active && status) setConfirmationStatus(status); });
    return () => {
      active = false;
    };
  }, [attempt]);

  const hasAccount = Boolean(user);
  const isCompleted = !loading && confirmationStatus === "completed";
  const isFailed = confirmationStatus === "failed" || confirmationStatus === "invalid";
  const canRetry = confirmationStatus === "pending" || confirmationStatus === "unavailable";
  const titleKey = loading ? "checkoutResult.checkingTitle" : confirmationStatus === "pending" ? "feedback.confirmationPending"
    : confirmationStatus === "unavailable" ? "feedback.confirmationUnavailable"
    : isCompleted ? "checkoutResult.completedTitle" : isFailed ? "checkoutSuccess.problem" : "checkoutSuccess.confirming";
  const hintKey = loading ? "checkoutResult.checkingHint" : confirmationStatus === "pending" ? "feedback.confirmationPendingHint"
    : confirmationStatus === "unavailable" ? "feedback.confirmationUnavailableHint"
    : confirmationStatus === "invalid" ? "feedback.confirmationInvalid"
    : isCompleted ? "checkoutResult.completedHint" : isFailed ? "checkoutSuccess.problemHint" : "checkoutSuccess.confirmationHint";

  return (
    <main data-testid="checkout-return" className={styles.page}>
      <section className={styles.card} aria-labelledby="checkout-result-title">
        {isCompleted ? <PaymentSuccessCheck /> : <div className={styles.icon} aria-hidden="true">
          {loading || confirmationStatus === "checking" ? <LoaderCircle size={28} className={styles.spinner} />
            : confirmationStatus === "pending" ? <Clock3 size={30} />
              : confirmationStatus === "unavailable" ? <WifiOff size={28} /> : <AlertCircle size={28} />}
        </div>}
        <p className={styles.eyebrow}>{t(isCompleted ? "checkoutResult.successEyebrow" : "checkoutResult.paymentEyebrow")}</p>
        <h1 id="checkout-result-title" aria-live="polite" className={styles.title}>{t(titleKey)}</h1>
        <p className={styles.hint}>{t(hintKey)}</p>
        {!loading && canRetry && <button type="button" onClick={() => { setConfirmationStatus("checking"); setAttempt(value => value + 1); }} className={styles.primary}>{t("feedback.checkAgain")}</button>}

        {isCompleted && purchase && <>
          <CheckoutSuccessTicket eventId={purchase.eventId} orderId={purchase.orderId} />
          <Link data-testid="checkout-view-tickets" href={hasAccount ? "/users/me/tickets" : "/register"} className={styles.primary}>
            <Ticket size={17} aria-hidden="true" /><span>{t(hasAccount ? "checkoutSuccess.viewTickets" : "auth.createAccount")}</span><ArrowRight size={17} aria-hidden="true" />
          </Link>
          <p className={styles.delivery}><Mail size={15} aria-hidden="true" /><span>{t(hasAccount ? "checkoutResult.accountDelivery" : "checkoutResult.guestDelivery")}</span></p>
        </>}

        <Link href="/events" className={styles.back}><ArrowLeft size={15} aria-hidden="true" />{t("checkoutSuccess.backToEvents")}</Link>
      </section>
    </main>
  );
}
