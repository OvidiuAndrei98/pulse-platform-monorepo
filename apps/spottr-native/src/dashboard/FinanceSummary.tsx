import React, { useEffect, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import {
  AlertTriangle,
  BadgeDollarSign,
  BookOpenText,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  ReceiptText,
  RefreshCw,
  Ticket,
  WalletCards,
} from "lucide-react-native";
import type { components } from "@packages/api-client/src/schema";
import { accountApi } from "../auth/AuthProvider";
import { usePreferences } from "../usePreferences";
import { Text } from "../ui/Text";
import { Feedback, Loading, useOpenLink } from "../ui/common";
import { formatDate } from "../data/events";
import { dColors as colors, useAction, useDashboardQuery } from "./common";
import { Grid, SmallButton, SectionTitle, Status, p } from "./managementUi";
import { financeSummary } from "./managementData";
import type { OrganizerProfile } from "./data";
type S = components["schemas"];
const money = (value: number) =>
  new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "RON",
    maximumFractionDigits: 2,
  }).format(value);

export function Finance() {
  const { copy, language } = usePreferences(),
    { width } = useWindowDimensions(),
    desktop = width >= 768;
  const sales = useDashboardQuery<S["OrganizerFinanceEventResponse"][] | null>(
      "/dashboard/finance",
    ),
    invoices = useDashboardQuery<
      S["PlatformCommissionInvoiceResponse"][] | null
    >("/dashboard/finance/invoices"),
    refunds = useDashboardQuery<S["RefundAttentionResponse"][] | null>(
      "/dashboard/finance/refunds-attention",
    ),
    stripe = useDashboardQuery<OrganizerProfile>("/dashboard/stripe/status"),
    action = useAction(),
    link = useOpenLink(),
    [page, setPage] = useState(1),
    [refundMessage, setRefundMessage] = useState("");
  const totals = financeSummary(sales.data ?? []),
    rows = (sales.data ?? []).filter(
      (row) => row.ticketsSold > 0 || row.platformFeeBani > 0,
    ),
    pages = Math.max(1, Math.ceil(rows.length / 10));
  const stripeReady =
    stripe.data?.verificationStatus === "approved" &&
    stripe.data.stripeChargesEnabled &&
    stripe.data.stripePayoutsEnabled;
  useEffect(() => setPage((value) => Math.min(value, pages)), [pages]);
  const invoiceFee = (sales.data ?? []).reduce((sum, row) => sum + (row.invoiceServiceFeeBani ?? 0), 0) / 100;
  const hasHistoricalInvoiceFees = invoiceFee > 0;
  const headers = ["event", "tickets", "revenue", "commission", ...(hasHistoricalInvoiceFees ? ["invoiceServiceFee"] : []), "estimate"];
  return (
    <View style={{ gap: 28 }} testID="dashboard-finance">
      <View
        style={{
          flexDirection: width >= 640 ? "row" : "column",
          justifyContent: "space-between",
          alignItems: width >= 640 ? "flex-end" : "stretch",
          gap: 16,
        }}
      >
        <View style={{ flex: width >= 640 ? 1 : undefined, gap: 4 }}>
          <Text
            style={[p.title, width >= 640 && { fontSize: 30, lineHeight: 36 }]}
          >
            {copy("finance.title")}
          </Text>
          <Text style={p.muted}>{copy("finance.subtitle")}</Text>
        </View>
        {stripeReady && (
          <SmallButton
            title={copy("dashboard.openStripeDashboard")}
            icon={ExternalLink}
            disabled={action.busy}
            style={{ minHeight: 40 }}
            onPress={() =>
              void action.run(
                () =>
                  accountApi<{ url: string }>("/dashboard/stripe/login-link", {
                    method: "POST",
                  }),
                undefined,
                (value) => void link.open(value.url),
              )
            }
          />
        )}
      </View>
      {sales.isPending ? (
        <Loading />
      ) : sales.isError ? (
        <Feedback
          title={copy("finance.loadFailed")}
          retry={() => void sales.refetch()}
        />
      ) : (
        <>
          <View style={{ gap: 16 }}>
            <Grid sm={2} lg={4} testID="finance-metrics">
              {[
                {
                  key: "grossRevenue",
                  value: money(totals.customerTotal),
                  detail: "customerTotalDetail",
                  Icon: CircleDollarSign,
                },
                {
                  key: "glowFee",
                  value: money(totals.platformFee - invoiceFee),
                  detail: "feeFormula",
                  Icon: BadgeDollarSign,
                },
                ...(hasHistoricalInvoiceFees ? [{
                  key: "invoiceServiceFee", value: money(invoiceFee), detail: "invoiceServiceFeeHint", Icon: ReceiptText,
                }] : []),
                {
                  key: "estimatedPayout",
                  value: money(totals.customerTotal - totals.platformFee),
                  detail: "afterGlowFee",
                  Icon: WalletCards,
                },
                {
                  key: "ticketsSold",
                  value: totals.tickets.toLocaleString("ro-RO"),
                  detail: "confirmedPayments",
                  Icon: Ticket,
                },
              ].map(({ key, value, detail, Icon }) => (
                <View
                  key={key}
                  style={[
                    p.panel,
                    {
                      borderRadius: 0,
                      backgroundColor: "#ffffff09",
                      flexGrow: 1,
                    },
                  ]}
                >
                  <View style={p.row}>
                    <Icon size={16} color={colors.accent} />
                    <Text style={[p.tiny, { fontWeight: "600", flex: 1 }]}>
                      {copy("finance." + key)}
                    </Text>
                  </View>
                  <Text
                    testID={"finance-" + key}
                    style={{
                      marginTop: 16,
                      color:
                        key === "estimatedPayout" ? colors.accent : colors.text,
                      fontSize: 20,
                      fontWeight: "700",
                    }}
                  >
                    {value}
                  </Text>
                  <Text style={[p.tiny, { marginTop: 4 }]}>
                    {copy("finance." + detail)}
                  </Text>
                </View>
              ))}
            </Grid>
            <Text style={p.tiny}>{copy("finance.estimateNote")}</Text>
            {totals.refunds > 0 && (
              <Text style={p.warning}>
                {copy("finance.refundsNeedAttention", {
                  count: totals.refunds,
                })}
              </Text>
            )}
          </View>
          <View style={p.divider}>
            <SectionTitle
              title={copy("refundAttention.title")}
              subtitle={copy("refundAttention.organizerSubtitle")}
              icon={AlertTriangle}
              warning
            />
            {refunds.isPending ? (
              <Loading />
            ) : refunds.isError ? (
              <Feedback
                title={copy("refundAttention.loadFailed")}
                retry={() => void refunds.refetch()}
              />
            ) : !refunds.data?.length ? (
              <View style={p.empty}>
                <Text style={p.muted}>{copy("refundAttention.empty")}</Text>
              </View>
            ) : (
              <Grid lg={2}>
                {refunds.data.map((item) => (
                  <View
                    key={item.orderId}
                    style={[p.panel, { borderColor: "#fcd34d26", gap: 16 }]}
                  >
                    <View
                      style={[
                        p.row,
                        {
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                        },
                      ]}
                    >
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={p.label}>{item.eventTitle}</Text>
                        <Text style={p.tiny}>
                          {copy("refundAttention.order", {
                            id: item.orderId.slice(0, 8).toUpperCase(),
                          })}
                        </Text>
                      </View>
                      <View style={[p.row, { flexWrap: "wrap" }]}>
                        <Status
                          label={copy(
                            item.stripeLivemode
                              ? "refundAttention.live"
                              : "refundAttention.test",
                          )}
                          tone={item.stripeLivemode ? "muted" : "blue"}
                        />
                        <Status
                          label={copy(
                            "refundAttention.status." + item.stripeRefundStatus,
                          )}
                          tone="amber"
                        />
                      </View>
                    </View>
                    <View
                      style={{
                        borderTopWidth: 1,
                        borderBottomWidth: 1,
                        borderColor: "#ffffff1a",
                        paddingVertical: 12,
                        gap: 8,
                      }}
                    >
                      <Text style={p.tiny}>
                        {copy("refundAttention.buyer")}: {item.buyerEmail}
                      </Text>
                      <Text style={p.tiny}>
                        {copy("refundAttention.purchasedAt", {
                          date: new Date(item.purchasedAt).toLocaleString(
                            language,
                          ),
                        })}
                      </Text>
                      <Text style={p.tiny}>
                        {copy("refundAttention.updatedAt", {
                          date: new Date(item.updatedAt).toLocaleString(
                            language,
                          ),
                        })}
                      </Text>
                    </View>
                    <Grid columns={2} sm={4} gap={8}>
                      {[
                        ["customerTotal", item.customerTotalBani],
                        ["refunded", item.refundedAmountBani],
                        ["remaining", item.remainingAmountBani],
                        ["spottrFee", item.platformFeeBani],
                      ].map(([key, amount]) => (
                        <View
                          key={key}
                          style={{
                            padding: 10,
                            backgroundColor: "#00000033",
                            borderRadius: 10,
                            gap: 5,
                          }}
                        >
                          <Text style={[p.tiny, { fontSize: 10 }]}>
                            {copy("refundAttention." + key)}
                          </Text>
                          <Text
                            style={[
                              p.label,
                              {
                                color:
                                  key === "refunded"
                                    ? "#6ee7b7"
                                    : key === "remaining"
                                      ? "#fcd34d"
                                      : colors.text,
                              },
                            ]}
                          >
                            {money(Number(amount) / 100)}
                          </Text>
                        </View>
                      ))}
                    </Grid>
                    <View
                      style={{
                        flexDirection: width >= 640 ? "row" : "column",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <Text style={p.tiny}>
                        {copy("refundAttention.tickets")}: {item.ticketCount}
                      </Text>
                      <SmallButton
                        title={copy("refundAttention.checkStripe")}
                        icon={RefreshCw}
                        disabled={action.busy}
                        onPress={() =>
                          void action.run(
                            () =>
                              accountApi<{ requiresAttention: boolean }>(
                                `/dashboard/finance/refunds-attention/${item.orderId}/reconcile`,
                                { method: "POST" },
                              ),
                            undefined,
                            (result) =>
                              setRefundMessage(
                                copy(
                                  result.requiresAttention
                                    ? "refundAttention.stillPartial"
                                    : "refundAttention.fullyRefunded",
                                ),
                              ),
                          )
                        }
                      />
                    </View>
                    {item.errorMessage && (
                      <Text
                        style={[
                          p.warning,
                          {
                            borderColor: "#ef444444",
                            backgroundColor: "#ef444414",
                            color: "#fca5a5",
                          },
                        ]}
                      >
                        {item.errorMessage}
                      </Text>
                    )}
                  </View>
                ))}
              </Grid>
            )}
            {refundMessage && <Text style={p.tiny}>{refundMessage}</Text>}
          </View>
          <View style={{ gap: 12 }}>
            <SectionTitle
              title={copy("finance.salesByEvent")}
              subtitle={copy("finance.successfulOrders")}
              right={
                <Text style={p.tiny}>
                  {copy("finance.withSales", { count: rows.length })}
                </Text>
              }
            />
            {!rows.length ? (
              <View style={p.empty}>
                <Text style={p.muted}>{copy("finance.noSales")}</Text>
              </View>
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: "#ffffff1a",
                  backgroundColor: "#ffffff06",
                }}
                testID="finance-sales-table"
              >
                {desktop && (
                  <View
                    style={[
                      p.row,
                      { paddingHorizontal: 16, paddingVertical: 12, gap: 16 },
                    ]}
                  >
                    {headers.map((key, index) => (
                      <Text
                        key={key}
                        style={[
                          p.tiny,
                          {
                            flex: index === 0 ? 1.6 : index === 1 ? 0.7 : 0.9,
                            fontSize: 10,
                            fontWeight: "700",
                            textTransform: "uppercase",
                          },
                        ]}
                      >
                        {copy("finance." + key)}
                      </Text>
                    ))}
                  </View>
                )}
                {rows.slice((page - 1) * 10, page * 10).map((row, index) => (
                  <View
                    key={row.eventId}
                    testID="finance-sale-row"
                    style={{
                      borderTopWidth: desktop || index ? 1 : 0,
                      borderTopColor: "#ffffff1a",
                      padding: 16,
                      flexDirection: desktop ? "row" : "column",
                      gap: desktop ? 16 : 12,
                      alignItems: desktop ? "center" : "stretch",
                    }}
                  >
                    <View
                      style={desktop ? { flex: 1.6, minWidth: 0 } : undefined}
                    >
                      <Text style={p.label} numberOfLines={1}>
                        {row.eventTitle}
                      </Text>
                      <View style={[p.row, { marginTop: 4, gap: 6 }]}>
                        <CalendarDays size={14} color={colors.muted} />
                        <Text style={p.tiny}>
                          {formatDate(row.startTime, language, false, {
                            year: true,
                            deviceTime: true,
                          })}
                        </Text>
                      </View>
                    </View>
                    {[
                      row.ticketsSold.toLocaleString("ro-RO"),
                      money(
                        row.grossRevenueRon +
                          row.customerTicketingFeeBani / 100,
                      ),
                      money((row.platformFeeBani - (row.invoiceServiceFeeBani ?? 0)) / 100),
                      ...(hasHistoricalInvoiceFees ? [money((row.invoiceServiceFeeBani ?? 0) / 100)] : []),
                      money(
                        row.grossRevenueRon +
                          row.customerTicketingFeeBani / 100 -
                          row.platformFeeBani / 100,
                      ),
                    ].map((value, index) => (
                      <View
                        key={index}
                        style={
                          desktop
                            ? { flex: index === 0 ? 0.7 : 0.9 }
                            : [p.row, { justifyContent: "space-between" }]
                        }
                      >
                        {!desktop && (
                          <Text style={p.tiny}>
                            {copy("finance." + headers[index + 1])}
                          </Text>
                        )}
                        <Text
                          style={[
                            p.label,
                            {
                              color:
                                index === headers.length - 2
                                  ? colors.accent
                                  : index === 2
                                    ? colors.muted
                                    : colors.text,
                            },
                          ]}
                        >
                          {value}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
                {pages > 1 && (
                  <View
                    style={[
                      p.line,
                      p.row,
                      {
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        justifyContent: "space-between",
                      },
                    ]}
                  >
                    <Text style={p.tiny}>
                      {copy("finance.page", { current: page, total: pages })}
                    </Text>
                    <View style={p.row}>
                      <SmallButton
                        label={copy("finance.previousPage")}
                        icon={ChevronLeft}
                        disabled={page === 1}
                        onPress={() => setPage((value) => value - 1)}
                      />
                      <SmallButton
                        label={copy("finance.nextPage")}
                        icon={ChevronRight}
                        disabled={page === pages}
                        onPress={() => setPage((value) => value + 1)}
                      />
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
          <View style={p.divider}>
            <SectionTitle
              title={copy("finance.glowInvoices")}
              subtitle={copy("finance.invoiceHint")}
              icon={ReceiptText}
            />
            {invoices.isPending ? (
              <Loading />
            ) : invoices.isError ? (
              <Feedback
                title={copy("finance.invoiceLoadFailed")}
                retry={() => void invoices.refetch()}
              />
            ) : !invoices.data?.length ? (
              <View style={[p.empty, p.row, { alignItems: "flex-start" }]}>
                <BookOpenText size={16} color={colors.accent} />
                <Text style={[p.muted, { flex: 1 }]}>
                  {copy("finance.noInvoices")}
                </Text>
              </View>
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: "#ffffff1a",
                  backgroundColor: "#ffffff06",
                }}
              >
                {invoices.data.map((invoice, index) => (
                  <View
                    key={invoice.id}
                    style={{
                      borderTopWidth: index ? 1 : 0,
                      borderTopColor: "#ffffff1a",
                      padding: 16,
                      flexDirection: width >= 640 ? "row" : "column",
                      gap: 16,
                      justifyContent: "space-between",
                    }}
                  >
                    <View style={{ gap: 4, flex: width >= 640 ? 1 : undefined }}>
                      <View style={[p.row, { flexWrap: "wrap" }]}>
                        <Text
                          style={[p.label, { textTransform: "capitalize" }]}
                        >
                          {new Intl.DateTimeFormat(language, {
                            month: "long",
                            year: "numeric",
                            timeZone: "UTC",
                          }).format(
                            new Date(invoice.periodStart + "T00:00:00Z"),
                          )}
                        </Text>
                        <Status
                          label={copy("invoicing.status." + invoice.status)}
                        />
                      </View>
                      <Text style={p.tiny}>
                        {copy("finance.invoiceTransactions", {
                          count: invoice.transactionCount,
                        })}{" "}
                        · {money(invoice.totalFeeBani / 100)}
                      </Text>
                    </View>
                    {invoice.documentUrl && (
                      <SmallButton
                        icon={ExternalLink}
                        title={copy("finance.downloadInvoice", {
                          series: invoice.series ?? "",
                          number: invoice.number ?? "",
                        })}
                        onPress={() => void link.open(invoice.documentUrl!)}
                      />
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        </>
      )}
      {action.feedback}
      {link.error && (
        <Text style={{ color: colors.danger }}>
          {copy("feedback.loadFailed")}
        </Text>
      )}
    </View>
  );
}
