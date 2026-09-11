"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeDollarSign,
  BookOpenText,
  CalendarDays,
  CircleDollarSign,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  ReceiptText,
  Ticket,
  WalletCards,
} from "lucide-react";
import {
  type OrganizerFinanceEvent,
  type PlatformCommissionInvoice,
  type RefundAttentionItem,
} from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { formatEventDate } from "@/features/events/dateFormat";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { RefundAttentionList } from "@/app/dashboard/components/RefundAttentionList";

const formatRon = (amount: number) =>
  new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "RON",
    maximumFractionDigits: 2,
  }).format(amount);

const SALES_PAGE_SIZE = 10;

export default function FinancePage() {
  const { user } = useDataProvider();
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<OrganizerFinanceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [invoices, setInvoices] = useState<PlatformCommissionInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesError, setInvoicesError] = useState("");
  const [salesPage, setSalesPage] = useState(1);
  const [stripeReady, setStripeReady] = useState(false);
  const [stripeDashboardLoading, setStripeDashboardLoading] = useState(false);
  const [stripeDashboardError, setStripeDashboardError] = useState("");
  const [refunds, setRefunds] = useState<RefundAttentionItem[]>([]);
  const [refundsLoading, setRefundsLoading] = useState(true);
  const [refundsError, setRefundsError] = useState("");
  const [reconcilingOrderId, setReconcilingOrderId] = useState<string>();

  const loadFinance = useCallback(async (showLoading = true) => {
    if (!user) return;
    if (showLoading) setLoading(true);
    setError("");
    try {
      setItems(await user.getOrganizerFinance());
    } catch {
      setError(t("finance.loadFailed"));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [t, user]);

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  const loadRefunds = useCallback(async (showLoading = true) => {
    if (!user) return;
    if (showLoading) setRefundsLoading(true);
    setRefundsError("");
    try {
      setRefunds(await user.listOrganizerRefundsRequiringAttention());
    } catch {
      setRefundsError(t("refundAttention.loadFailed"));
    } finally {
      if (showLoading) setRefundsLoading(false);
    }
  }, [t, user]);

  useEffect(() => {
    void loadRefunds();
  }, [loadRefunds]);

  useEffect(() => {
    if (!user) return;

    let active = true;
    setInvoicesLoading(true);
    setInvoicesError("");
    void user
      .getPlatformCommissionInvoices()
      .then((data) => {
        if (active) setInvoices(data);
      })
      .catch(() => {
        if (active) setInvoicesError(t("finance.invoiceLoadFailed"));
      })
      .finally(() => {
        if (active) setInvoicesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [t, user]);

  useEffect(() => {
    if (!user) return;

    let active = true;
    void user
      .refreshStripeAccountStatus()
      .then((profile) => {
        if (active) {
          setStripeReady(
            Boolean(
              profile?.verificationStatus === "approved" &&
              profile?.stripeChargesEnabled &&
              profile?.stripePayoutsEnabled,
            ),
          );
        }
      })
      .catch(() => {
        if (active) setStripeReady(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const openStripeDashboard = async () => {
    if (!user) return;

    setStripeDashboardLoading(true);
    setStripeDashboardError("");
    try {
      const { url } = await user.createStripeDashboardLoginLink();
      window.location.assign(url);
    } catch {
      setStripeDashboardError(t("dashboard.stripeDashboardFailed"));
      setStripeDashboardLoading(false);
    }
  };

  const reconcileRefund = async (orderId: string) => {
    if (!user || reconcilingOrderId) return;
    setReconcilingOrderId(orderId);
    try {
      const result = await user.reconcileOrganizerRefund(orderId);
      toast[result.requiresAttention ? "info" : "success"](
        t(result.requiresAttention ? "refundAttention.stillPartial" : "refundAttention.fullyRefunded"),
      );
      await Promise.all([loadRefunds(false), loadFinance(false)]);
    } catch {
      toast.error(t("refundAttention.checkFailed"));
    } finally {
      setReconcilingOrderId(undefined);
    }
  };

  const totals = useMemo(
    () =>
      items.reduce(
        (result, item) => ({
          grossRevenueRon: result.grossRevenueRon + item.grossRevenueRon,
          customerTicketingFeeBani: result.customerTicketingFeeBani + item.customerTicketingFeeBani,
          platformFeeBani: result.platformFeeBani + item.platformFeeBani,
          ticketsSold: result.ticketsSold + item.ticketsSold,
          refundsNeedingAttention: result.refundsNeedingAttention + item.refundsNeedingAttention,
        }),
        { grossRevenueRon: 0, customerTicketingFeeBani: 0, platformFeeBani: 0, ticketsSold: 0, refundsNeedingAttention: 0 },
      ),
    [items],
  );
  const platformFeeRon = totals.platformFeeBani / 100;
  const customerTotalRon = totals.grossRevenueRon + totals.customerTicketingFeeBani / 100;
  const estimatedPayoutRon = customerTotalRon - platformFeeRon;
  const sales = items.filter((item) => item.ticketsSold > 0 || item.platformFeeBani > 0);
  const salesPageCount = Math.max(1, Math.ceil(sales.length / SALES_PAGE_SIZE));
  const visibleSales = sales.slice(
    (salesPage - 1) * SALES_PAGE_SIZE,
    salesPage * SALES_PAGE_SIZE,
  );

  useEffect(() => {
    setSalesPage((page) => Math.min(page, salesPageCount));
  }, [salesPageCount]);

  return (
    <main className="app-page-spacing mx-auto max-w-5xl text-foreground pb-[110px]">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">
            {t("finance.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("finance.subtitle")}
          </p>
        </div>
        {stripeReady && (
          <button
            type="button"
            onClick={openStripeDashboard}
            disabled={stripeDashboardLoading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-semibold transition hover:bg-white/5 disabled:opacity-50"
          >
            {stripeDashboardLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            {t("dashboard.openStripeDashboard")}
          </button>
        )}
      </header>

      {stripeDashboardError && (
        <p className="mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {stripeDashboardError}
        </p>
      )}

      {loading ? (
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-28 animate-pulse border border-white/10 bg-white/[0.035]"
            />
          ))}
        </div>
      ) : error ? (
        <p className="mt-7 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : (
        <>
          <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FinanceMetric
              icon={CircleDollarSign}
              label={t("finance.grossRevenue")}
              value={formatRon(customerTotalRon)}
              detail={t("finance.customerTotalDetail")}
            />
            <FinanceMetric
              icon={BadgeDollarSign}
              label={t("finance.glowFee")}
              value={formatRon(platformFeeRon)}
              detail={t("finance.feeFormula")}
              accent="muted"
            />
            <FinanceMetric
              icon={WalletCards}
              label={t("finance.estimatedPayout")}
              value={formatRon(estimatedPayoutRon)}
              detail={t("finance.afterGlowFee")}
              accent="primary"
            />
            <FinanceMetric
              icon={Ticket}
              label={t("finance.ticketsSold")}
              value={totals.ticketsSold.toLocaleString("ro-RO")}
              detail={t("finance.confirmedPayments")}
            />
          </section>

          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            {t("finance.estimateNote")}
          </p>

          {totals.refundsNeedingAttention > 0 && (
            <p className="mt-4 border border-amber-400/25 bg-amber-400/[0.08] px-4 py-3 text-sm text-amber-100">
              {t("finance.refundsNeedAttention", { count: totals.refundsNeedingAttention })}
            </p>
          )}

          <div className="mt-8">
            <RefundAttentionList
              items={refunds}
              loading={refundsLoading}
              error={refundsError}
              reconcilingOrderId={reconcilingOrderId}
              onReconcile={(orderId) => void reconcileRefund(orderId)}
            />
          </div>

          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {t("finance.salesByEvent")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("finance.successfulOrders")}
                </p>
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {t("finance.withSales", { count: sales.length })}
              </span>
            </div>

            {sales.length ? (
              <div className="overflow-hidden border border-white/10 bg-white/[0.025]">
                <div className="hidden grid-cols-[minmax(0,1.6fr)_0.7fr_0.9fr_0.9fr_0.9fr] gap-4 border-b border-white/10 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground md:grid">
                  <span>{t("finance.event")}</span>
                  <span>{t("finance.tickets")}</span>
                  <span>{t("finance.revenue")}</span>
                  <span>{t("finance.commission")}</span>
                  <span>{t("finance.estimate")}</span>
                </div>
                <div className="divide-y divide-white/10">
                  {visibleSales.map((item) => {
                    const commissionRon = item.platformFeeBani / 100;
                    const eventCustomerTotalRon =
                      item.grossRevenueRon + item.customerTicketingFeeBani / 100;
                    return (
                      <article
                        key={item.eventId}
                        className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.6fr)_0.7fr_0.9fr_0.9fr_0.9fr] md:items-center md:gap-4"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {item.eventTitle}
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CalendarDays className="h-3.5 w-3.5" />{" "}
                            {formatEventDate(item.startTime)}
                          </p>
                        </div>
                        <FinanceCell
                          label={t("finance.tickets")}
                          value={item.ticketsSold.toLocaleString("ro-RO")}
                        />
                        <FinanceCell
                          label={t("finance.revenue")}
                          value={formatRon(eventCustomerTotalRon)}
                        />
                        <FinanceCell
                          label={t("finance.commission")}
                          value={formatRon(commissionRon)}
                          muted
                        />
                        <FinanceCell
                          label={t("finance.estimate")}
                          value={formatRon(eventCustomerTotalRon - commissionRon)}
                          primary
                        />
                      </article>
                    );
                  })}
                </div>
                {salesPageCount > 1 && (
                  <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
                    <span className="text-xs text-muted-foreground">
                      {t("finance.page", {
                        current: salesPage,
                        total: salesPageCount,
                      })}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setSalesPage((page) => Math.max(1, page - 1))
                        }
                        disabled={salesPage === 1}
                        aria-label={t("finance.previousPage")}
                        className="grid h-8 w-8 place-items-center rounded-md border border-white/15 text-muted-foreground transition hover:bg-white/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSalesPage((page) =>
                            Math.min(salesPageCount, page + 1),
                          )
                        }
                        disabled={salesPage === salesPageCount}
                        aria-label={t("finance.nextPage")}
                        className="grid h-8 w-8 place-items-center rounded-md border border-white/15 text-muted-foreground transition hover:bg-white/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="border border-dashed border-white/15 px-5 py-8 text-sm text-muted-foreground">
                {t("finance.noSales")}
              </div>
            )}
          </section>

          <section className="mt-8 border-t border-white/10 pt-6">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                <ReceiptText className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-lg font-semibold">
                  {t("finance.glowInvoices")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("finance.invoiceHint")}
                </p>
              </div>
            </div>
            {invoicesLoading ? (
              <div className="mt-4 h-24 animate-pulse border border-white/10 bg-white/[0.025]" />
            ) : invoicesError ? (
              <p className="mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {invoicesError}
              </p>
            ) : invoices.length ? (
              <div className="mt-4 divide-y divide-white/10 border border-white/10 bg-white/[0.025]">
                {invoices.map((invoice) => (
                  <article
                    key={invoice.id}
                    className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold capitalize">
                          {new Intl.DateTimeFormat(i18n.language, {
                            month: "long",
                            year: "numeric",
                            timeZone: "UTC",
                          }).format(new Date(`${invoice.periodStart}T00:00:00Z`))}
                        </p>
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          {t(`invoicing.status.${invoice.status}`)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("finance.invoiceTransactions", {
                          count: invoice.transactionCount,
                        })}
                        {" · "}
                        {formatRon(invoice.totalFeeBani / 100)}
                      </p>
                    </div>
                    {invoice.documentUrl && (
                      <a
                        href={invoice.documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-semibold transition hover:bg-white/5"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t("finance.downloadInvoice", {
                          series: invoice.series,
                          number: invoice.number,
                        })}
                      </a>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-4 border border-dashed border-white/15 px-5 py-6">
                <div className="flex items-start gap-3">
                  <BookOpenText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-sm leading-6 text-muted-foreground">
                    {t("finance.noInvoices")}
                  </p>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function FinanceMetric({
  icon: Icon,
  label,
  value,
  detail,
  accent = "default",
}: {
  icon: typeof CircleDollarSign;
  label: string;
  value: string;
  detail: string;
  accent?: "default" | "muted" | "primary";
}) {
  const valueColor =
    accent === "primary"
      ? "text-primary"
      : accent === "muted"
        ? "text-foreground"
        : "text-foreground";
  return (
    <article className="border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold">{label}</p>
      </div>
      <p className={`mt-4 text-xl font-bold ${valueColor}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </article>
  );
}

function FinanceCell({
  label,
  value,
  muted,
  primary,
}: {
  label: string;
  value: string;
  muted?: boolean;
  primary?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 md:block">
      <span className="text-xs text-muted-foreground md:hidden">{label}</span>
      <span
        className={`text-sm font-semibold ${primary ? "text-primary" : muted ? "text-muted-foreground" : "text-foreground"}`}
      >
        {value}
      </span>
    </div>
  );
}
