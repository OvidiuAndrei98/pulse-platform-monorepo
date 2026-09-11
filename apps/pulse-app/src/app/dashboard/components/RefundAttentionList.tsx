"use client";

import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Loader2,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { RefundAttentionItem } from "@/core/DataProvider";

export function RefundAttentionList({
  items,
  loading,
  error,
  admin = false,
  reconcilingOrderId,
  onReconcile,
}: {
  items: RefundAttentionItem[];
  loading: boolean;
  error?: string;
  admin?: boolean;
  reconcilingOrderId?: string;
  onReconcile: (orderId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ro" ? "ro-RO" : "en-GB";
  const formatMoney = (amountBani: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "RON",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amountBani / 100);
  const formatDateTime = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));

  return (
    <section className="border-t border-white/10 pt-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-amber-300/20 bg-amber-300/[0.08] text-amber-200">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">{t("refundAttention.title")}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            {t(admin ? "refundAttention.adminSubtitle" : "refundAttention.organizerSubtitle")}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {[0, 1].map((item) => (
            <div key={item} className="h-64 animate-pulse rounded-2xl border border-white/10 bg-white/[0.025]" />
          ))}
        </div>
      ) : error ? (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : items.length ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {items.map((item) => {
            const checking = reconcilingOrderId === item.orderId;
            return (
              <article key={item.orderId} className="min-w-0 rounded-2xl border border-amber-300/15 bg-white/[0.025] p-4 sm:p-5">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground">{item.eventTitle}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("refundAttention.order", { id: item.orderId.slice(0, 8).toUpperCase() })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${
                      item.stripeLivemode
                        ? "border-white/10 text-muted-foreground"
                        : "border-sky-300/20 bg-sky-300/[0.08] text-sky-200"
                    }`}>
                      {t(item.stripeLivemode ? "refundAttention.live" : "refundAttention.test")}
                    </span>
                    <span className="rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-amber-100">
                      {t(`refundAttention.status.${item.stripeRefundStatus}`)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 space-y-2 border-y border-white/10 py-3 text-xs">
                  <DetailRow icon={UserRound} label={t("refundAttention.buyer")} value={item.buyerEmail} />
                  {admin && (
                    <DetailRow
                      icon={Building2}
                      label={t("refundAttention.organizer")}
                      value={[item.companyName, item.organizerEmail].filter(Boolean).join(" · ")}
                    />
                  )}
                  <DetailRow
                    icon={CalendarClock}
                    label={t("refundAttention.purchasedAt", { date: formatDateTime(item.purchasedAt) })}
                    value={t("refundAttention.updatedAt", { date: formatDateTime(item.updatedAt) })}
                  />
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Amount label={t("refundAttention.customerTotal")} value={formatMoney(item.customerTotalBani)} />
                  <Amount label={t("refundAttention.refunded")} value={formatMoney(item.refundedAmountBani)} accent />
                  <Amount label={t("refundAttention.remaining")} value={formatMoney(item.remainingAmountBani)} warning />
                  <Amount label={t("refundAttention.spottrFee")} value={formatMoney(item.platformFeeBani)} />
                </dl>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    {t("refundAttention.tickets")}: <span className="font-semibold text-foreground">{item.ticketCount}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => onReconcile(item.orderId)}
                    disabled={Boolean(reconcilingOrderId)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/15 px-4 text-xs font-semibold transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {t(checking ? "refundAttention.checking" : "refundAttention.checkStripe")}
                  </button>
                </div>

                {item.errorMessage && (
                  <p className="mt-3 rounded-lg border border-red-400/15 bg-red-400/[0.06] px-3 py-2 text-xs leading-5 text-red-200">
                    {t("refundAttention.operationError", { message: item.errorMessage })}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-white/15 px-5 py-8 text-sm text-muted-foreground">
          {t("refundAttention.empty")}
        </div>
      )}
    </section>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
      <span className="min-w-0 max-w-[55%] truncate font-medium text-foreground">{value}</span>
    </div>
  );
}

function Amount({
  label,
  value,
  accent,
  warning,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="rounded-xl bg-black/20 p-2.5">
      <dt className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-1 text-xs font-bold ${accent ? "text-primary" : warning ? "text-amber-200" : "text-foreground"}`}>
        {value}
      </dd>
    </div>
  );
}
