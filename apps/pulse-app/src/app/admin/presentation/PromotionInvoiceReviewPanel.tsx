"use client";

import type { AdminOperationsPageModel } from "../useAdminOperations";
import { FinancialStat } from "./primitives";

export function PromotionInvoiceReviewPanel({model}: {model: Pick<AdminOperationsPageModel, "promotionInvoiceAttention" | "promotionInvoiceAttentionLoading" | "t">}) {
 const { promotionInvoiceAttention, promotionInvoiceAttentionLoading, t }=model;

 return (<section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">{t("adminPromotionInvoices.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("adminPromotionInvoices.subtitle")}</p>
          </div>
          {promotionInvoiceAttentionLoading ? (
            <div className="h-32 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
          ) : promotionInvoiceAttention.length ? (
            promotionInvoiceAttention.map((item) => (
              <article key={item.id} className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{item.eventTitle}</h3>
                    <p className="mt-1 break-all text-xs text-muted-foreground">{item.customerEmail} · {item.paymentIntentId || item.campaignId}</p>
                  </div>
                  <span className="w-fit rounded-full border border-amber-300/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                    {t("adminPromotionInvoices.needsReview")}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <FinancialStat label={t("adminPromotionInvoices.paid")} value={`${item.amountRon.toFixed(2)} RON`} />
                  <FinancialStat label={t("adminPromotionInvoices.refunded")} value={`${item.refundedAmountRon.toFixed(2)} RON`} />
                  <FinancialStat label={t("adminPromotionInvoices.invoiceStatus")} value={item.invoiceStatus || "—"} />
                  <FinancialStat label={t("adminPromotionInvoices.refundStatus")} value={item.refundStatus || "—"} />
                </dl>
                <p className="mt-3 rounded-xl bg-black/20 p-3 text-xs leading-5 text-amber-100/80">{item.reason}</p>
              </article>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/15 px-5 py-8 text-center text-sm text-muted-foreground">
              {t("adminPromotionInvoices.empty")}
            </div>
          )}
        </section>);
}
