"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Ban,
  Check,
  CircleCheck,
  CircleX,
  Clock3,
  CreditCard,
  ExternalLink,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Ticket,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  type EventCancellationRequest,
  type OrganizerVerificationRequest,
  type RefundAttentionItem,
} from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { RefundAttentionList } from "@/app/dashboard/components/RefundAttentionList";

type VerificationStatus = "pending" | "approved" | "rejected";
type StatusFilter = "all" | VerificationStatus;
type StripeStatus = "active" | "onboarding" | "attention" | "notConnected";

function getStripeStatus(request: OrganizerVerificationRequest): StripeStatus {
  if (!request.stripeAccountId) return "notConnected";
  if (!request.stripeDetailsSubmitted) return "onboarding";
  if (request.stripeChargesEnabled && request.stripePayoutsEnabled) return "active";
  return "attention";
}

export default function AdminPage() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useDataProvider();
  const [requests, setRequests] = useState<OrganizerVerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [reviewTarget, setReviewTarget] = useState<{
    request: OrganizerVerificationRequest;
    status: "approved" | "rejected";
  }>();
  const [reviewing, setReviewing] = useState(false);
  const [cancellations, setCancellations] = useState<EventCancellationRequest[]>([]);
  const [cancellationsLoading, setCancellationsLoading] = useState(true);
  const [cancellationTarget, setCancellationTarget] = useState<{ request: EventCancellationRequest; action: "retain" | "refund" | "reject" }>();
  const [adminNote, setAdminNote] = useState("");
  const [refunds, setRefunds] = useState<RefundAttentionItem[]>([]);
  const [refundsLoading, setRefundsLoading] = useState(true);
  const [refundsError, setRefundsError] = useState("");
  const [reconcilingOrderId, setReconcilingOrderId] = useState<string>();

  const loadRequests = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setRequests(await user.listOrganizerVerifications());
    } catch {
      toast.error(t("admin.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, user]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const loadCancellations = useCallback(async () => {
    if (!user) return;
    setCancellationsLoading(true);
    try {
      setCancellations(await user.listEventCancellationRequests());
    } catch {
      toast.error(t("adminCancellations.loadFailed"));
    } finally {
      setCancellationsLoading(false);
    }
  }, [t, user]);

  useEffect(() => {
    void loadCancellations();
  }, [loadCancellations]);

  const loadRefunds = useCallback(async () => {
    if (!user) return;
    setRefundsLoading(true);
    setRefundsError("");
    try {
      setRefunds(await user.listAdminRefundsRequiringAttention());
    } catch {
      setRefundsError(t("refundAttention.loadFailed"));
    } finally {
      setRefundsLoading(false);
    }
  }, [t, user]);

  useEffect(() => {
    void loadRefunds();
  }, [loadRefunds]);

  const reconcileRefund = async (orderId: string) => {
    if (!user || reconcilingOrderId) return;
    setReconcilingOrderId(orderId);
    try {
      const result = await user.reconcileAdminRefund(orderId);
      if (result.requiresAttention) {
        toast.info(t("refundAttention.stillPartial"));
      } else {
        toast.success(t("refundAttention.fullyRefunded"));
      }
      await Promise.all([loadRefunds(), loadCancellations()]);
    } catch {
      toast.error(t("refundAttention.checkFailed"));
    } finally {
      setReconcilingOrderId(undefined);
    }
  };

  const confirmCancellation = async () => {
    if (!user || !cancellationTarget) return;
    setReviewing(true);
    try {
      if (cancellationTarget.action === "reject") {
        await user.rejectEventCancellation(cancellationTarget.request.id, adminNote);
      } else {
        await user.approveEventCancellation(cancellationTarget.request.id, cancellationTarget.action, adminNote);
      }
      toast.success(t("adminCancellations.saved"));
      setCancellationTarget(undefined);
      setAdminNote("");
      await loadCancellations();
    } catch {
      toast.error(t("adminCancellations.saveFailed"));
    } finally {
      setReviewing(false);
    }
  };

  const counts = useMemo(
    () => ({
      all: requests.length,
      pending: requests.filter((request) => request.verificationStatus === "pending").length,
      approved: requests.filter((request) => request.verificationStatus === "approved").length,
      rejected: requests.filter((request) => request.verificationStatus === "rejected").length,
    }),
    [requests],
  );

  const visibleRequests = useMemo(
    () =>
      filter === "all"
        ? requests
        : requests.filter((request) => request.verificationStatus === filter),
    [filter, requests],
  );

  const stripeCounts = useMemo(
    () =>
      requests.reduce(
        (result, request) => {
          result[getStripeStatus(request)] += 1;
          return result;
        },
        { active: 0, onboarding: 0, attention: 0, notConnected: 0 } satisfies Record<StripeStatus, number>,
      ),
    [requests],
  );

  const confirmReview = async () => {
    if (!user || !reviewTarget) return;
    setReviewing(true);
    try {
      const profile = await user.reviewOrganizerVerification(
        reviewTarget.request.userId,
        reviewTarget.status,
      );
      setRequests((current) =>
        current.map((request) =>
          request.userId === reviewTarget.request.userId
            ? {
                ...request,
                verificationStatus: profile.verificationStatus,
                verifiedAt:
                  profile.verificationStatus === "approved"
                    ? new Date().toISOString()
                    : undefined,
                updatedAt: new Date().toISOString(),
              }
            : request,
        ),
      );
      toast.success(
        reviewTarget.status === "approved"
          ? t("admin.approvedSuccess")
          : t("admin.rejectedSuccess"),
      );
      setReviewTarget(undefined);
    } catch {
      toast.error(t("admin.reviewFailed"));
    } finally {
      setReviewing(false);
    }
  };

  const locale = i18n.language === "ro" ? "ro-RO" : "en-GB";

  return (
    <main className="min-h-dvh bg-background pb-10 text-foreground">
      <div className="app-page-spacing mx-auto max-w-6xl space-y-6">
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
                {t("admin.title")}
              </h1>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { void loadRequests(); void loadCancellations(); void loadRefunds(); }}
              disabled={loading || cancellationsLoading || refundsLoading}
              className="grid h-10 w-10 place-items-center rounded-lg border border-white/15 transition hover:bg-white/5 disabled:opacity-50"
              aria-label={t("admin.refresh")}
            >
              <RefreshCw className={`h-4 w-4 ${loading || cancellationsLoading || refundsLoading ? "animate-spin" : ""}`} />
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

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">{t("adminCancellations.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("adminCancellations.subtitle")}</p>
          </div>
          {cancellationsLoading ? (
            <div className="h-40 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
          ) : cancellations.length ? cancellations.map((request) => (
            <article key={request.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><Ban className="h-4 w-4 text-red-300" /><h3 className="truncate font-semibold">{request.eventTitle}</h3></div>
                  <p className="mt-1 text-xs text-muted-foreground">{request.companyName} · {request.organizerEmail}</p>
                </div>
                <span className="w-fit rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">{t(`adminCancellations.status.${request.status}`)}</span>
              </div>
              <p className="mt-4 rounded-xl bg-black/20 p-3 text-sm leading-6 text-muted-foreground">{request.reason}</p>
              {request.evidenceUrl && <a href={request.evidenceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">{t("eventCancellation.evidence")}<ExternalLink className="h-3.5 w-3.5" /></a>}
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <FinancialStat label={t("adminCancellations.tickets")} value={String(request.ticketCount ?? 0)} />
                <FinancialStat label={t("adminCancellations.customerTotal")} value={`${((request.customerTotalBani ?? 0) / 100).toFixed(2)} RON`} />
                <FinancialStat label={t("adminCancellations.spottrFee")} value={`${((request.platformFeeBani ?? 0) / 100).toFixed(2)} RON`} />
                <FinancialStat label={t("adminCancellations.refundProgress")} value={`${request.succeededRefunds ?? 0}/${request.orderCount ?? 0}`} />
              </dl>
              {request.failedRefunds ? <p className="mt-3 text-xs font-semibold text-red-300">{t("adminCancellations.failedCount", { count: request.failedRefunds })}</p> : null}
              {request.failedRefunds ? <button type="button" onClick={async () => { try { await user?.retryEventCancellation(request.id); toast.success(t("adminCancellations.retryStarted")); await loadCancellations(); } catch { toast.error(t("adminCancellations.saveFailed")); } }} className="mt-3 h-10 rounded-lg border border-red-400/25 px-4 text-xs font-semibold text-red-300">{t("adminCancellations.retry")}</button> : null}
              {request.status === "pending" && (
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  <button type="button" onClick={() => setCancellationTarget({ request, action: "reject" })} className="h-10 rounded-lg border border-white/10 text-xs font-semibold">{t("adminCancellations.reject")}</button>
                  <button type="button" onClick={() => setCancellationTarget({ request, action: "refund" })} className="h-10 rounded-lg border border-amber-300/20 bg-amber-300/10 text-xs font-semibold text-amber-200">{t("adminCancellations.approveRefundFee")}</button>
                  <button type="button" onClick={() => setCancellationTarget({ request, action: "retain" })} className="h-10 rounded-lg bg-primary text-xs font-semibold text-primary-foreground">{t("adminCancellations.approveRetainFee")}</button>
                </div>
              )}
            </article>
          )) : <div className="rounded-2xl border border-dashed border-white/15 px-5 py-10 text-center text-sm text-muted-foreground">{t("adminCancellations.empty")}</div>}
        </section>

        <RefundAttentionList
          items={refunds}
          loading={refundsLoading}
          error={refundsError}
          admin
          reconcilingOrderId={reconcilingOrderId}
          onReconcile={(orderId) => void reconcileRefund(orderId)}
        />

        <section>
          <div>
            <h2 className="text-lg font-semibold">{t("admin.organizersTitle")}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("admin.subtitle")}
            </p>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <FinancialStat label={t("admin.stripe.status.active")} value={String(stripeCounts.active)} />
            <FinancialStat label={t("admin.stripe.status.onboarding")} value={String(stripeCounts.onboarding)} />
            <FinancialStat label={t("admin.stripe.status.attention")} value={String(stripeCounts.attention)} />
            <FinancialStat label={t("admin.stripe.status.notConnected")} value={String(stripeCounts.notConnected)} />
          </dl>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
            {(["pending", "approved", "rejected", "all"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setFilter(status)}
                className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-semibold transition ${
                  filter === status
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                }`}
              >
                {t(`admin.filters.${status}`)}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${filter === status ? "bg-black/20" : "bg-white/10"}`}>
                  {counts[status]}
                </span>
              </button>
            ))}
          </div>
        </section>

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
                    <button
                      type="button"
                      onClick={() => setReviewTarget({ request, status: "approved" })}
                      className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-xs font-semibold text-primary-foreground transition hover:opacity-90"
                    >
                      <Check className="h-4 w-4" /> {t("admin.approve")}
                    </button>
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
      </div>

      {reviewTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-950 p-5 shadow-2xl">
            <div className={`grid h-11 w-11 place-items-center rounded-full ${reviewTarget.status === "approved" ? "bg-primary/15 text-primary" : "bg-red-500/10 text-red-300"}`}>
              {reviewTarget.status === "approved" ? <CircleCheck className="h-5 w-5" /> : <CircleX className="h-5 w-5" />}
            </div>
            <h2 className="mt-4 text-lg font-semibold">
              {reviewTarget.status === "approved" ? t("admin.approveTitle") : t("admin.rejectTitle")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t("admin.reviewHint", { company: reviewTarget.request.companyName })}
            </p>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => setReviewTarget(undefined)}
                disabled={reviewing}
                className="h-10 flex-1 rounded-lg border border-white/15 text-sm font-semibold transition hover:bg-white/5 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void confirmReview()}
                disabled={reviewing}
                className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50 ${reviewTarget.status === "approved" ? "bg-primary" : "bg-red-600 hover:bg-red-500"}`}
              >
                {reviewing && <Loader2 className="h-4 w-4 animate-spin" />}
                {reviewTarget.status === "approved" ? t("admin.approve") : t("admin.reject")}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancellationTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-950 p-5 shadow-2xl">
            <div className="flex items-center gap-3"><Ticket className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">{t(`adminCancellations.confirm.${cancellationTarget.action}`)}</h2></div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{t(`adminCancellations.confirmHint.${cancellationTarget.action}`)}</p>
            <textarea value={adminNote} onChange={(event) => setAdminNote(event.target.value)} placeholder={t("adminCancellations.note")} rows={3} className="mt-4 w-full resize-none rounded-xl border border-white/10 bg-white/[0.035] p-3 text-base outline-none focus:border-primary/50" />
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setCancellationTarget(undefined)} disabled={reviewing} className="h-10 flex-1 rounded-lg border border-white/10 text-sm font-semibold">{t("common.cancel")}</button>
              <button type="button" onClick={() => void confirmCancellation()} disabled={reviewing} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">{reviewing && <Loader2 className="h-4 w-4 animate-spin" />}{t("common.confirm")}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function FinancialStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div>;
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
