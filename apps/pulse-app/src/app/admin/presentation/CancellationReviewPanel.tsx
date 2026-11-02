"use client";

import { Ban, ExternalLink } from "lucide-react";

import { ActionButton as UIActionButton } from '@/components/ui/ActionButton';

import type { AdminOperationsPageModel } from "../useAdminOperations";
import { FinancialStat } from "./primitives";

export function CancellationReviewPanel({model}: {model: Pick<AdminOperationsPageModel, "cancellations" | "cancellationsLoading" | "retryCancellation" | "retryingCancellationId" | "reviewing" | "setCancellationTarget" | "t">}) {
 const { cancellations, cancellationsLoading, retryCancellation, retryingCancellationId, reviewing, setCancellationTarget, t }=model;
 const busy=reviewing||retryingCancellationId!==undefined;

 return (<section className="space-y-3">
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
              {request.failedRefunds ? <button type="button" disabled={busy} onClick={()=>{void retryCancellation(request.id);}} className="mt-3 h-10 rounded-lg border border-red-400/25 px-4 text-xs font-semibold text-red-300 disabled:opacity-50">{t("adminCancellations.retry")}</button> : null}
              {request.status === "pending" && (
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  <button type="button" disabled={busy} onClick={() => setCancellationTarget({ request, action: "reject" })} className="h-10 rounded-lg border border-white/10 text-xs font-semibold">{t("adminCancellations.reject")}</button>
                  <button type="button" disabled={busy} onClick={() => setCancellationTarget({ request, action: "refund" })} className="h-10 rounded-lg border border-amber-300/20 bg-amber-300/10 text-xs font-semibold text-amber-200">{t("adminCancellations.approveRefundFee")}</button>
                  <UIActionButton type="button" disabled={busy} onClick={() => setCancellationTarget({ request, action: "retain" })} className="h-10 text-xs font-semibold">{t("adminCancellations.approveRetainFee")}</UIActionButton>
                </div>
              )}
            </article>
          )) : <div className="rounded-2xl border border-dashed border-white/15 px-5 py-10 text-center text-sm text-muted-foreground">{t("adminCancellations.empty")}</div>}
        </section>);
}
