"use client";

import { BackLink } from "@/components/BackLink";
import { RequestError } from "@/components/ui/RequestFeedback";
import { useClientQuery } from "@/lib/useClientQuery";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ChevronLeft, ExternalLink, MapPin, Receipt } from "lucide-react";
import { ApiClient, type ReadableSchema } from "@packages/api-client/src/Client";
import { useDataProvider } from "@/core/DataProviderContext";
import { formatEventDate } from "@/features/events/dateFormat";
import { formatRon } from "@/features/events/serviceFee";
import { useTranslation } from "react-i18next";

type UserOrder = ReadableSchema<"UserOrderResponse">;

export default function InvoicesPage() {
  const { user, loading } = useDataProvider();
  const { t } = useTranslation();
  const router = useRouter();
  const { data: orders, pending, error, retry } = useClientQuery<UserOrder[]>(
    user ? `invoices:${user.properties.id}` : null,
    () => ApiClient.instance.get("/users/me/orders"), [],
  );

  useEffect(() => {
    if (!loading && !user) router.replace("/login?returnTo=%2Fusers%2Fme%2Finvoices");
  }, [loading, router, user]);

  const invoiceOrders = orders.filter((order) => order.invoiceRequested);

  return (
    <main className="app-page-spacing mx-auto min-h-screen max-w-3xl text-foreground">
      <BackLink
        href="/users/me"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-primary"
      >
        <ChevronLeft className="h-4 w-4" /> {t("tickets.profile")}
      </BackLink>
      <div className="mt-5">
        <h1 className="text-2xl font-semibold">{t("orders.invoiceTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("orders.invoiceHistory")}
        </p>
      </div>

      {loading || !user || pending ? (
        <div className="mt-7 h-48 animate-pulse border border-white/10 bg-white/[0.03]" />
      ) : error ? (
        <RequestError onRetry={retry} className="mt-7" />
      ) : invoiceOrders.length === 0 ? (
        <div className="mt-7 border border-dashed border-white/15 px-5 py-12 text-center">
          <Receipt className="mx-auto h-6 w-6 text-primary" />
          <p className="mt-3 text-sm font-semibold">{t("orders.invoiceEmpty")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("orders.invoiceEmptyHint")}
          </p>
        </div>
      ) : (
        <div className="mt-7 divide-y divide-white/10 border-y border-white/10">
          {invoiceOrders.map((order) => {
            const paidTotal = Number(order.paidTotalBani) / 100;
            const refundedAmount = Number(order.refundedAmountBani) / 100;
            const isRefunded = order.status === "refunded" || refundedAmount > 0;
            return (
              <article key={order.id} className="flex gap-3 py-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center bg-primary/10 text-primary">
                  <Receipt className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{order.eventTitle}</p>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatEventDate(order.createdAt)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {order.locationName}
                    </span>
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {t("orders.order", { id: order.id })}
                  </p>
                </div>
                <div className="flex max-w-[46%] shrink-0 flex-col items-end text-right">
                  <p className="text-sm font-semibold">{formatRon(paidTotal)}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{t("orders.paidTotal")}</p>
                  {isRefunded && (
                    <p className="mt-1 text-[11px] font-semibold text-primary">
                      {t("orders.refunded")}
                    </p>
                  )}
                  {refundedAmount > 0 && (
                    <p className="text-[11px] font-semibold text-primary">
                      {t("orders.refundedAmount", { amount: formatRon(refundedAmount) })}
                    </p>
                  )}
                  {order.invoiceDocumentUrl ? (
                    <a
                      href={order.invoiceDocumentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[11px] font-semibold text-primary transition hover:bg-white/5"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {order.invoiceSeries} {order.invoiceNumber}
                    </a>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t(`orders.invoiceStatus.${order.invoiceStatus || "pending"}`)}
                    </p>
                  )}
                  {isRefunded &&
                    (order.refundInvoiceDocumentUrl ? (
                      <a
                        href={order.refundInvoiceDocumentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/25 px-2.5 text-[11px] font-semibold text-primary transition hover:bg-primary/10"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t("orders.storno")} {order.refundInvoiceSeries} {order.refundInvoiceNumber}
                      </a>
                    ) : (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {t(`orders.refundInvoiceStatus.${order.refundInvoiceStatus || "pending"}`)}
                      </p>
                    ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
