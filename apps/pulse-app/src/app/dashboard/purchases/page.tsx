"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { Calendar, MapPin, QrCode, Receipt, Ticket, X } from "lucide-react";
import {
  ApiClient,
  type ReadableSchema,
} from "@packages/api-client/src/Client";
import { useDataProvider } from "@/core/DataProviderContext";
import { TicketQrCode } from "@/components/tickets/TicketQrCode";
import { TicketPdfButton } from "@/components/tickets/TicketPdfButton";
import { formatEventDate } from "@/features/events/dateFormat";
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
    <main className="min-h-screen text-foreground pb-[110px]">
      <div className="app-page-spacing mx-auto max-w-5xl">
        <header>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
            {t("purchases.eyebrow")}
          </p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
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
      <AnimatePresence>
        {openTicket && (
          <TicketPreview
            ticket={openTicket}
            onClose={() => setOpenTicket(null)}
          />
        )}
      </AnimatePresence>
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
      {orders.map((order) => (
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
            <p className="text-sm font-semibold">{order.totalAmountRon} RON</p>
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
          </div>
        </article>
      ))}
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

function TicketPreview({
  ticket,
  onClose,
}: {
  ticket: UserTicket;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (window.innerWidth < 768 && info.offset.y > 100) onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center md:justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm md:hidden"
      />
      <motion.section
        initial={window.innerWidth >= 768 ? { x: "100%" } : { y: "100%" }}
        animate={window.innerWidth >= 768 ? { x: 0 } : { y: 0 }}
        exit={window.innerWidth >= 768 ? { x: "100%" } : { y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
        drag={window.innerWidth >= 768 ? false : "y"}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.05, bottom: 0.75 }}
        onDragEnd={handleDragEnd}
        onClick={(event) => event.stopPropagation()}
        className="relative h-[min(46rem,84svh)] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-neutral-950 p-6 pb-10 shadow-2xl sm:rounded-b-3xl md:h-screen md:max-w-md md:rounded-none md:border-y-0 md:border-r-0 md:border-l md:pb-6"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0) 40%)",
        }}
      >
        <div className="absolute left-0 right-0 top-3 flex justify-center md:hidden">
          <div className="h-1.5 w-12 rounded-full bg-white/20" />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("purchases.closeTicket")}
          className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/5 p-1.5 text-muted-foreground transition hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mt-4 flex items-center gap-2 md:mt-6">
          <span className="rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
            {ticket.ticketTypeName}
          </span>
          <span className="text-[11px] text-muted-foreground">{ticket.id}</span>
        </div>
        <h2 className="mt-2 text-xl font-bold leading-snug tracking-tight text-white">
          {ticket.eventTitle}
        </h2>
        <div className="mt-6 flex justify-center">
          <div className="rounded-2xl bg-white p-4 shadow-xl">
            <TicketQrCode
              value={ticket.validationHash}
              size={220}
              alt={t("purchases.ticketQr")}
            />
          </div>
        </div>
        <div className="mt-6 space-y-3 border-y border-white/5 py-4 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4 shrink-0" />
            <span>{formatEventDate(ticket.startTime)}</span>
          </div>
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(ticket.locationName)}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-2 text-primary underline-offset-2 hover:underline"
          >
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="leading-tight">{ticket.locationName}</span>
          </a>
        </div>
        <TicketPdfButton
          ticket={ticket}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-medium text-white transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
        />
      </motion.section>
    </div>
  );
}
