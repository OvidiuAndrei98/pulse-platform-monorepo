"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Check,
  CircleCheck,
  CircleX,
  Clock3,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { type OrganizerVerificationRequest } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";

type VerificationStatus = "pending" | "approved" | "rejected";
type StatusFilter = "all" | VerificationStatus;

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
              onClick={() => void loadRequests()}
              disabled={loading}
              className="grid h-10 w-10 place-items-center rounded-lg border border-white/15 transition hover:bg-white/5 disabled:opacity-50"
              aria-label={t("admin.refresh")}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
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

        <section>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("admin.subtitle")}
          </p>
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
    </main>
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
