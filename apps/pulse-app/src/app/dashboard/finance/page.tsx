"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeDollarSign,
  BookOpenText,
  CalendarDays,
  CircleDollarSign,
  ChevronLeft,
  ChevronRight,
  ReceiptText,
  Ticket,
  WalletCards,
} from "lucide-react";
import {
  type OrganizerFinanceEvent,
} from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { formatEventDate } from "@/features/events/dateFormat";
import { useTranslation } from "react-i18next";

const formatRon = (amount: number) =>
  new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "RON",
    maximumFractionDigits: 2,
  }).format(amount);

const SALES_PAGE_SIZE = 10;

export default function FinancePage() {
  const { user } = useDataProvider();
  const { t } = useTranslation();
  const [items, setItems] = useState<OrganizerFinanceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [salesPage, setSalesPage] = useState(1);

  useEffect(() => {
    if (!user) return;

    let active = true;
    setLoading(true);
    setError("");

    void user
      .getOrganizerFinance()
      .then((data) => {
        if (active) setItems(data);
      })
      .catch(() => {
        if (active) setError(t("finance.loadFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [t, user]);

  const totals = useMemo(
    () =>
      items.reduce(
        (result, item) => ({
          grossRevenueRon: result.grossRevenueRon + item.grossRevenueRon,
          platformFeeBani: result.platformFeeBani + item.platformFeeBani,
          ticketsSold: result.ticketsSold + item.ticketsSold,
        }),
        { grossRevenueRon: 0, platformFeeBani: 0, ticketsSold: 0 },
      ),
    [items],
  );
  const platformFeeRon = totals.platformFeeBani / 100;
  const estimatedPayoutRon = totals.grossRevenueRon - platformFeeRon;
  const sales = items.filter((item) => item.ticketsSold > 0);
  const salesPageCount = Math.max(1, Math.ceil(sales.length / SALES_PAGE_SIZE));
  const visibleSales = sales.slice((salesPage - 1) * SALES_PAGE_SIZE, salesPage * SALES_PAGE_SIZE);

  useEffect(() => {
    setSalesPage((page) => Math.min(page, salesPageCount));
  }, [salesPageCount]);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-28 pt-7 text-foreground sm:px-6 sm:pt-9">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <WalletCards className="h-4 w-4" />
            <p className="text-[11px] font-bold uppercase tracking-[0.2em]">{t("dashboardNav.organizer")}</p>
          </div>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{t("finance.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
	            Vanzari confirmate, comisioane Glow si documentele tale de comision.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-28 animate-pulse border border-white/10 bg-white/[0.035]" />
          ))}
        </div>
      ) : error ? (
        <p className="mt-7 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : (
        <>
          <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FinanceMetric icon={CircleDollarSign} label={t("finance.grossRevenue")} value={formatRon(totals.grossRevenueRon)} detail={t("finance.completedOrders")} />
            <FinanceMetric icon={BadgeDollarSign} label={t("finance.glowFee")} value={formatRon(platformFeeRon)} detail="4% + 2,50 RON / bilet" accent="muted" />
	            <FinanceMetric icon={WalletCards} label={t("finance.estimatedPayout")} value={formatRon(estimatedPayoutRon)} detail={t("finance.afterGlowFee")} accent="primary" />
            <FinanceMetric icon={Ticket} label={t("finance.ticketsSold")} value={totals.ticketsSold.toLocaleString("ro-RO")} detail={t("finance.confirmedPayments")} />
          </section>

          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            {t("finance.estimateNote")}
          </p>

          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{t("finance.salesByEvent")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("finance.successfulOrders")}</p>
              </div>
              <span className="text-xs font-medium text-muted-foreground">{t("finance.withSales", { count: sales.length })}</span>
            </div>

            {sales.length ? (
              <div className="overflow-hidden border border-white/10 bg-white/[0.025]">
                <div className="hidden grid-cols-[minmax(0,1.6fr)_0.7fr_0.9fr_0.9fr_0.9fr] gap-4 border-b border-white/10 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground md:grid">
                  <span>{t("finance.event")}</span><span>{t("finance.tickets")}</span><span>{t("finance.revenue")}</span><span>{t("finance.commission")}</span><span>{t("finance.estimate")}</span>
                </div>
                <div className="divide-y divide-white/10">
                  {visibleSales.map((item) => {
                    const commissionRon = item.platformFeeBani / 100;
                    return (
                      <article key={item.eventId} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.6fr)_0.7fr_0.9fr_0.9fr_0.9fr] md:items-center md:gap-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{item.eventTitle}</p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> {formatEventDate(item.startTime)}</p>
                        </div>
                        <FinanceCell label={t("finance.tickets")} value={item.ticketsSold.toLocaleString("ro-RO")} />
                        <FinanceCell label={t("finance.revenue")} value={formatRon(item.grossRevenueRon)} />
                        <FinanceCell label={t("finance.commission")} value={formatRon(commissionRon)} muted />
                        <FinanceCell label={t("finance.estimate")} value={formatRon(item.grossRevenueRon - commissionRon)} primary />
                      </article>
                    );
                  })}
                </div>
                {salesPageCount > 1 && (
                  <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
                    <span className="text-xs text-muted-foreground">{t("finance.page", { current: salesPage, total: salesPageCount })}</span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setSalesPage((page) => Math.max(1, page - 1))} disabled={salesPage === 1} aria-label={t("finance.previousPage")} className="grid h-8 w-8 place-items-center rounded-md border border-white/15 text-muted-foreground transition hover:bg-white/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"><ChevronLeft className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setSalesPage((page) => Math.min(salesPageCount, page + 1))} disabled={salesPage === salesPageCount} aria-label={t("finance.nextPage")} className="grid h-8 w-8 place-items-center rounded-md border border-white/15 text-muted-foreground transition hover:bg-white/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"><ChevronRight className="h-4 w-4" /></button>
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
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary"><ReceiptText className="h-4 w-4" /></span>
              <div>
	                <h2 className="text-lg font-semibold">{t("finance.glowInvoices")}</h2>
	                <p className="mt-1 text-sm text-muted-foreground">{t("finance.invoiceHint")}</p>
              </div>
            </div>
            <div className="mt-4 border border-dashed border-white/15 px-5 py-6">
              <div className="flex items-start gap-3">
                <BookOpenText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-sm leading-6 text-muted-foreground">
	                  {t("finance.noInvoices")}
                </p>
              </div>
            </div>
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
  const valueColor = accent === "primary" ? "text-primary" : accent === "muted" ? "text-foreground" : "text-foreground";
  return <article className="border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4 text-primary" /><p className="text-xs font-semibold">{label}</p></div><p className={`mt-4 text-xl font-bold ${valueColor}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>;
}

function FinanceCell({ label, value, muted, primary }: { label: string; value: string; muted?: boolean; primary?: boolean }) {
  return <div className="flex items-center justify-between gap-3 md:block"><span className="text-xs text-muted-foreground md:hidden">{label}</span><span className={`text-sm font-semibold ${primary ? "text-primary" : muted ? "text-muted-foreground" : "text-foreground"}`}>{value}</span></div>;
}
