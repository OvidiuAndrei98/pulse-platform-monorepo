"use client";
import { CancellationReviewPanel } from "./presentation/CancellationReviewPanel";
import { PromotionInvoiceReviewPanel } from "./presentation/PromotionInvoiceReviewPanel";
import { OrganizerVerificationOverview } from "./presentation/OrganizerVerificationOverview";
import { OrganizerReviewDialog } from "./presentation/OrganizerReviewDialog";

import { useAdminOperations } from "./useAdminOperations";
import { VerificationStatus, getStripeStatus, StripeStatus } from "./useAdminOperations.contracts";

import { ModalFrame } from "@/components/ui/ModalFrame";
import { Field } from "@/components/ui/Field";
import { Building2, Check, Clock3, CreditCard, Loader2, LogOut, RefreshCw, ShieldCheck, Ticket, X } from "lucide-react";

import { useTranslation } from "react-i18next";
import { type OrganizerVerificationRequest } from "@/core/DataProvider";

import { RefundAttentionList } from "@/app/dashboard/components/RefundAttentionList";
import { CommissionsPanel } from './CommissionsPanel';
import { ClientErrorsPanel } from './ClientErrorsPanel';
import { adminLabel } from '@packages/app-core/admin/navigation';
import { ActionButton as UIActionButton } from '@/components/ui/ActionButton';
import { TextArea as UITextArea } from '@/components/ui/Field';

export function AdminOperationsPage(props: Parameters<typeof useAdminOperations>[0]) {
  const model = useAdminOperations(props);
  const {
    adminNote,
    cancellationTarget,
    cancellationsLoading,
    confirmCancellation,
    i18n,
    loadCancellations,
    loadPromotionInvoiceAttention,
    loadRefunds,
    loadRequests,
    loading,
    locale,
    logout,
    promotionInvoiceAttentionLoading,
    reconcileRefund,
    reconcilingOrderId,
    refunds,
    refundsError,
    refundsLoading,
    reviewTarget,
    reviewing,
    section,
    setAdminNote,
    setCancellationTarget,
    setReviewTarget,
    t,
    visibleRequests,
  } = model;

  return (
    <div className="text-foreground">
      <div className="space-y-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
                {t("admin.eyebrow")}
              </p>
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
                {adminLabel(section, i18n.language.startsWith('ro'))}
              </h1>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { void loadRequests(); void loadCancellations(); void loadRefunds(); void loadPromotionInvoiceAttention(); }}
              disabled={section === 'verifications' ? loading : section === 'cancellations' ? cancellationsLoading : section === 'refunds' ? refundsLoading : section === 'invoices' ? promotionInvoiceAttentionLoading : false}
              className="grid h-10 w-10 place-items-center rounded-lg border border-white/15 transition hover:bg-white/5 disabled:opacity-50"
              aria-label={t("admin.refresh")}
            >
              <RefreshCw className={`h-4 w-4 ${(section === 'verifications' ? loading : section === 'cancellations' ? cancellationsLoading : section === 'refunds' ? refundsLoading : section === 'invoices' ? promotionInvoiceAttentionLoading : false) ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={logout}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-semibold transition hover:bg-white/5"
            >
              <LogOut className="h-4 w-4" />
              {t("dashboardNav.logout")}
            </button>
          </div>
        </header>

        {section === 'commissions' && <CommissionsPanel initiallyOpen />}
        {section === 'errors' && <ClientErrorsPanel initiallyOpen />}
        {section === 'cancellations' && <CancellationReviewPanel model={model} />}

        {section === 'refunds' && <RefundAttentionList
          items={refunds}
          loading={refundsLoading}
          error={refundsError}
          admin
          reconcilingOrderId={reconcilingOrderId}
          onReconcile={(orderId) => void reconcileRefund(orderId)}
        />}

        {section === 'invoices' && <PromotionInvoiceReviewPanel model={model} />}

        {section === 'verifications' && <><OrganizerVerificationOverview model={model} />

        {loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-52 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
            ))}
          </div>
        ) : visibleRequests.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {visibleRequests.map((request) => (
              <article key={request.userId} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/5 text-primary">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold">{request.companyName}</h2>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{request.email}</p>
                    </div>
                  </div>
                  <StatusBadge status={request.verificationStatus} />
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-4 border-y border-white/10 py-4 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("admin.cui")}</dt>
                    <dd className="mt-1 font-semibold">{request.cui}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("admin.account")}</dt>
                    <dd className="mt-1 truncate font-semibold">@{request.username}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground">{t("admin.submittedAt")}</dt>
                    <dd className="mt-1 flex items-center gap-1.5 font-medium">
                      <Clock3 className="h-3.5 w-3.5 text-primary" />
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(request.submittedAt))}
                    </dd>
                  </div>
                </dl>

                <StripeAccountStatus request={request} />

                <div className="mt-4 flex gap-2">
                  {request.verificationStatus !== "rejected" && (
                    <button
                      type="button"
                      onClick={() => setReviewTarget({ request, status: "rejected" })}
                      className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-red-500/30 text-xs font-semibold text-red-300 transition hover:bg-red-500/10"
                    >
                      <X className="h-4 w-4" /> {t("admin.reject")}
                    </button>
                  )}
                  {request.verificationStatus !== "approved" && (
                    <UIActionButton
                      type="button"
                      onClick={() => setReviewTarget({ request, status: "approved" })}
                      className="inline-flex h-10 flex-1 items-center justify-center gap-2 text-xs font-semibold transition hover:opacity-90"
                    >
                      <Check className="h-4 w-4" /> {t("admin.approve")}
                    </UIActionButton>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/15 px-5 py-14 text-center">
            <ShieldCheck className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">{t("admin.empty")}</p>
          </div>
        )}
        </>}
      </div>

      {reviewTarget && (
        <OrganizerReviewDialog model={model} />
      )}

      {cancellationTarget && (
        <ModalFrame open onClose={()=>setCancellationTarget(undefined)} dismissible={!reviewing} label={t(`adminCancellations.confirm.${cancellationTarget.action}`)}>
          <div className="p-5">
            <div className="flex items-center gap-3"><Ticket className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">{t(`adminCancellations.confirm.${cancellationTarget.action}`)}</h2></div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{t(`adminCancellations.confirmHint.${cancellationTarget.action}`)}</p>
            <Field label={t("adminCancellations.note")} className="mt-4"><UITextArea value={adminNote} onChange={(event) => setAdminNote(event.target.value)} placeholder={t("adminCancellations.note")} rows={3} className="w-full resize-none" /></Field>
            <div className="mt-5 flex gap-2">
              <button data-dialog-initial-focus type="button" onClick={() => setCancellationTarget(undefined)} disabled={reviewing} className="h-10 flex-1 rounded-lg border border-white/10 text-sm font-semibold">{t("common.cancel")}</button>
              <UIActionButton type="button" onClick={() => void confirmCancellation()} disabled={reviewing} className="inline-flex h-10 flex-1 items-center justify-center gap-2 text-sm font-semibold disabled:opacity-50">{reviewing && <Loader2 className="h-4 w-4 animate-spin" />}{t("common.confirm")}</UIActionButton>
            </div>
          </div>
        </ModalFrame>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: VerificationStatus }) {
  const { t } = useTranslation();
  const styles = {
    pending: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    approved: "border-primary/25 bg-primary/10 text-primary",
    rejected: "border-red-400/25 bg-red-500/10 text-red-300",
  };
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${styles[status]}`}>
      {t(`admin.filters.${status}`)}
    </span>
  );
}

function StripeAccountStatus({ request }: { request: OrganizerVerificationRequest }) {
  const { t } = useTranslation();
  const status = getStripeStatus(request);
  const styles: Record<StripeStatus, string> = {
    active: "border-white/15 bg-white/[0.06] text-foreground",
    onboarding: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    attention: "border-red-400/25 bg-red-500/10 text-red-300",
    notConnected: "border-white/10 bg-white/[0.025] text-muted-foreground",
  };

  return (
    <section className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <CreditCard className="h-4 w-4 text-primary" />
          {t("admin.stripe.title")}
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${styles[status]}`}>
          {t(`admin.stripe.status.${status}`)}
        </span>
      </div>

      {request.stripeAccountId ? (
        <>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
            <StripeCheck label={t("admin.stripe.detailsSubmitted")} ready={request.stripeDetailsSubmitted} />
            <StripeCheck label={t("admin.stripe.payments")} ready={request.stripeChargesEnabled} />
            <StripeCheck label={t("admin.stripe.payouts")} ready={request.stripePayoutsEnabled} />
          </dl>
          <p className="mt-3 truncate font-mono text-[10px] text-muted-foreground" title={request.stripeAccountId}>
            {request.stripeAccountId}
            {request.stripeChargeType ? ` · ${t(`admin.stripe.chargeType.${request.stripeChargeType}`, { defaultValue: request.stripeChargeType })}` : ""}
          </p>
        </>
      ) : (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{t("admin.stripe.notConnectedHint")}</p>
      )}
    </section>
  );
}

function StripeCheck({ label, ready }: { label: string; ready: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-2.5 py-2">
      <dt className="truncate text-muted-foreground">{label}</dt>
      <dd className={`shrink-0 font-semibold ${ready ? "text-foreground" : "text-amber-200"}`}>
        {t(ready ? "admin.stripe.ready" : "admin.stripe.pending")}
      </dd>
    </div>
  );
}
