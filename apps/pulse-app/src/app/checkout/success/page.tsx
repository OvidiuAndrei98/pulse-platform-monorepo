"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, LoaderCircle, Mail, Ticket, UserRoundPlus } from "lucide-react";
import { useDataProvider } from "@/core/DataProviderContext";
import { useTranslation } from "react-i18next";
import { ApiClient } from "@packages/api-client/src/Client";
import { checkPaymentConfirmation, type ConfirmationResult } from "@/features/checkout/confirmation";

type ConfirmationStatus = "checking" | "invalid" | ConfirmationResult;

export default function CheckoutSuccessPage() {
  const { user, loading } = useDataProvider();
  const { t } = useTranslation();
  const [confirmationStatus, setConfirmationStatus] = useState<ConfirmationStatus>("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const eventId = params.get("event_id");
    if (!sessionId || !eventId) {
      setConfirmationStatus("invalid");
      return;
    }

    setConfirmationStatus("checking");
    void checkPaymentConfirmation(
      () => ApiClient.instance.post("/checkout/reconcile", { body: { sessionId, eventId } }),
      () => active,
    ).then((status) => { if (active && status) setConfirmationStatus(status); });
    return () => {
      active = false;
    };
  }, [attempt]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 pb-28">
        <div className="w-full max-w-md space-y-5 border border-white/10 bg-white/[0.03] p-6">
          <div className="mx-auto h-12 w-12 animate-pulse rounded-full bg-white/10" />
          <div className="mx-auto h-5 w-2/3 animate-pulse bg-white/10" />
          <div className="mx-auto h-3 w-full animate-pulse bg-white/[0.06]" />
        </div>
      </main>
    );
  }

  const hasAccount = Boolean(user);
  const isCompleted = confirmationStatus === "completed";
  const isFailed = confirmationStatus === "failed" || confirmationStatus === "invalid";
  const canRetry = confirmationStatus === "pending" || confirmationStatus === "unavailable";
  const titleKey = confirmationStatus === "pending" ? "feedback.confirmationPending"
    : confirmationStatus === "unavailable" ? "feedback.confirmationUnavailable"
    : isCompleted ? "checkoutSuccess.confirmed" : isFailed ? "checkoutSuccess.problem" : "checkoutSuccess.confirming";
  const hintKey = confirmationStatus === "pending" ? "feedback.confirmationPendingHint"
    : confirmationStatus === "unavailable" ? "feedback.confirmationUnavailableHint"
    : confirmationStatus === "invalid" ? "feedback.confirmationInvalid"
    : isCompleted ? "checkoutSuccess.confirmedHint" : isFailed ? "checkoutSuccess.problemHint" : "checkoutSuccess.confirmationHint";

  return (
    <main className="flex min-h-screen items-center justify-center px-5 pb-28 pt-10">
      <section className="w-full max-w-xl border border-primary/25 bg-background/80 p-6 text-center sm:p-8">
        <span className={`mx-auto grid h-14 w-14 place-items-center rounded-full border ${isFailed ? "border-destructive/35 bg-destructive/15 text-destructive" : "border-primary/35 bg-primary/15 text-primary"}`}>
          {isCompleted ? <CheckCircle2 className="h-7 w-7" /> : confirmationStatus === "checking" ? <LoaderCircle className="h-7 w-7 animate-spin" /> : <AlertCircle className="h-7 w-7" />}
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-primary">{t("checkoutSuccess.thanks")}</p>
        <h1 aria-live="polite" className="mt-2 text-2xl font-bold sm:text-3xl">
          {t(titleKey)}
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
          {t(hintKey)}
        </p>
        {canRetry && <button type="button" onClick={() => { setConfirmationStatus("checking"); setAttempt((value) => value + 1); }} className="mt-5 min-h-11 rounded-full bg-primary px-6 font-semibold text-white">{t("feedback.checkAgain")}</button>}

        {isCompleted && hasAccount ? (
          <div className="mt-7 border border-white/10 bg-white/[0.03] p-5 text-left">
            <div className="flex gap-3"><Ticket className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h2 className="font-semibold">{t("checkoutSuccess.ticketsInAccount")}</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">{t("checkoutSuccess.ticketsInAccountHint")}</p></div></div>
            <Link href="/users/me" className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"><Ticket className="h-4 w-4" /> {t("checkoutSuccess.viewTickets")}</Link>
          </div>
        ) : isCompleted ? (
          <div className="mt-7 border border-white/10 bg-white/[0.03] p-5 text-left">
            <div className="flex gap-3"><Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h2 className="font-semibold">{t("checkoutSuccess.ticketsByEmail")}</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">{t("checkoutSuccess.ticketsByEmailHint")}</p></div></div>
            <Link href="/register" className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"><UserRoundPlus className="h-4 w-4" /> {t("auth.createAccount")}</Link>
          </div>
        ) : null}

        <Link href="/events" className="mt-6 inline-block text-sm font-semibold text-primary transition hover:opacity-80">{t("checkoutSuccess.backToEvents")}</Link>
      </section>
    </main>
  );
}
