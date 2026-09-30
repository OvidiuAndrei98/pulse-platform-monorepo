"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, MapPin, QrCode, Receipt, Ticket } from "lucide-react";
import {
  ApiClient,
  type ReadableSchema,
} from "@packages/api-client/src/Client";
import { useDataProvider } from "@/core/DataProviderContext";
import { TicketPreview } from "@/components/tickets/TicketPreview";
import { formatEventDate } from "@/features/events/dateFormat";
import { formatRon } from "@/features/events/serviceFee";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/loading";

type UserTicket = ReadableSchema<"UserTicketResponse">;
type UserOrder = ReadableSchema<"UserOrderResponse">;
type PurchaseTab = "tickets" | "orders";

export default function DashboardPurchasesPage() {
  const { t } = useTranslation();
  const { user } = useDataProvider();
  const [tab, setTab] = useState<PurchaseTab>("tickets");
  const [tickets, setTickets] = useState<UserTicket[]>([]);
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTicket, setOpenTicket] = useState<UserTicket | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    Promise.all([
      ApiClient.instance.get("/users/me/tickets") as Promise<UserTicket[]>,
      ApiClient.instance.get("/users/me/orders") as Promise<UserOrder[]>,
    ])
      .then(([nextTickets, nextOrders]) => {
        if (!active) return;
        setTickets(nextTickets);
        setOrders(nextOrders);
      })
      .catch(() => {
        if (!active) return;
        setTickets([]);
        setOrders([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  return (
    <main className="text-foreground pb-[110px]">
      <div className="app-page-spacing mx-auto max-w-5xl">
        <header>
          <h1 className="text-2xl font-bold sm:text-3xl">
            {t("purchases.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("purchases.subtitle")}
          </p>
        </header>

        <div className="relative mt-6 grid h-11 max-w-sm grid-cols-2 rounded-xl border border-white/10 bg-white/[0.035] p-1">
          <PurchaseTabButton
            active={tab === "tickets"}
            onClick={() => setTab("tickets")}
            icon={Ticket}
            label={t("purchases.tickets")}
            count={tickets.length}
          />
          <PurchaseTabButton
            active={tab === "orders"}
            onClick={() => setTab("orders")}
            icon={Receipt}
            label={t("purchases.invoices")}
            count={orders.length}
          />
        </div>

        {loading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                className="space-y-3 rounded-lg border border-white/10 bg-white/[0.03] p-4"
              >
                <Skeleton className="h-4 w-2/5 rounded-full" />
                <Skeleton className="h-3 w-4/5 rounded-full" />
                <Skeleton className="h-3 w-1/3 rounded-full" />
              </div>
            ))}
          </div>
        ) : tab === "tickets" ? (
          <TicketsList tickets={tickets} onOpen={setOpenTicket} />
        ) : (
          <OrdersList orders={orders} />
        )}
      </div>
        {openTicket && (
          <TicketPreview
            ticket={openTicket}
            onClose={() => setOpenTicket(null)}
          />
        )}
    </main>
  );
}

function PurchaseTabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Ticket;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative z-10 flex h-full items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors ${active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
    >
      {active && (
        <motion.span
          layoutId="dashboard-purchases-tab"
          className="absolute inset-0 -z-10 rounded-lg bg-primary"
          transition={{ type: "spring", stiffness: 450, damping: 32 }}
        />
      )}
      <Icon className="h-3.5 w-3.5" />
      {label}
      <span className="text-[10px] opacity-80">{count}</span>
    </button>
  );
}

function TicketsList({
  tickets,
  onOpen,
}: {
  tickets: UserTicket[];
  onOpen: (ticket: UserTicket) => void;
}) {
  const { t } = useTranslation();
  if (tickets.length === 0) {
    return (
      <EmptyState
        icon={Ticket}
        title={t("purchases.noTickets")}
        description={t("purchases.noTicketsHint")}
      />
    );
  }
  return (
    <div className="mt-6 space-y-3">
      {tickets.map((ticket) => {
        const expired = new Date(ticket.endTime).getTime() < Date.now();
        const status = ticket.isValidated
          ? t("purchases.used")
          : expired
            ? t("purchases.expired")
            : t("purchases.active");
        return (
          <button
            key={ticket.id}
            type="button"
            onClick={() => onOpen(ticket)}
            className="flex w-full items-center gap-4 rounded-lg border border-white/10 bg-white/[0.025] p-4 text-left transition hover:border-primary/25 hover:bg-white/[0.05]"
          >
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border ${ticket.isValidated || expired ? "border-white/10 bg-white/[0.04] text-muted-foreground" : "border-primary/30 bg-primary/10 text-primary"}`}
            >
              <Ticket className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {ticket.eventTitle}
              </span>
              <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatEventDate(ticket.startTime)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {ticket.locationName}
                </span>
              </span>
            </span>
            <span className="hidden text-right sm:block">
              <span className="block text-xs font-semibold">
                {ticket.ticketTypeName}
              </span>
              <span className="mt-1 block text-[11px] text-muted-foreground">
                {status}
              </span>
            </span>
            <QrCode className="h-4 w-4 shrink-0 text-primary" />
          </button>
        );
      })}
    </div>
  );
}

function OrdersList({ orders }: { orders: UserOrder[] }) {
  const { t } = useTranslation();
  if (orders.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title={t("purchases.noOrders")}
        description={t("purchases.noOrdersHint")}
      />
    );
  }
  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-white/10 bg-white/[0.025]">
      {orders.map((order) => {
        const paidTotal = Number(order.paidTotalBani) / 100;
        const refundedAmount = Number(order.refundedAmountBani) / 100;
        return (
          <article
            key={order.id}
            className="flex gap-3 border-b border-white/10 p-4 last:border-b-0"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
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
                {t("purchases.order", { id: order.id })}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold">{formatRon(paidTotal)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {order.status === "completed"
                  ? t("orders.completed")
                  : order.status === "pending"
                    ? t("orders.pending")
                    : order.status === "canceled"
                      ? t("orders.canceled")
                      : order.status === "refunded"
                        ? t("orders.refunded")
                        : order.status}
              </p>
              {refundedAmount > 0 && (
                <p className="mt-1 text-[11px] font-semibold text-primary">
                  {t("orders.refundedAmount", { amount: formatRon(refundedAmount) })}
                </p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Ticket;
  title: string;
  description: string;
}) {
  return (
    <div className="mt-6 border border-dashed border-white/15 px-5 py-12 text-center">
      <Icon className="mx-auto h-6 w-6 text-primary" />
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
