"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Calendar, ChevronLeft, ChevronRight, CircleCheck, Clock3, MapPin, QrCode, Ticket } from "lucide-react";
import { ApiClient, type ReadableSchema } from "@packages/api-client/src/Client";
import { useDataProvider } from "@/core/DataProviderContext";
import { TicketQrCode } from "@/components/tickets/TicketQrCode";
import { formatEventDate } from "@/features/events/dateFormat";
import { useTranslation } from "react-i18next";

type UserTicket = ReadableSchema<"UserTicketResponse">;
type TicketTab = "active" | "used" | "expired";

function isExpired(ticket: UserTicket) {
  const endTime = new Date(ticket.endTime).getTime();
  return Number.isFinite(endTime) && endTime < Date.now();
}

function groupByEvent(tickets: UserTicket[]) {
  return tickets.reduce<Record<string, UserTicket[]>>((groups, ticket) => {
    groups[ticket.eventId] = [...(groups[ticket.eventId] ?? []), ticket];
    return groups;
  }, {});
}

const tabIcons = { active: Ticket, used: CircleCheck, expired: Clock3 };

export default function TicketsPage() {
  const { user, loading } = useDataProvider();
  const { t } = useTranslation();
  const router = useRouter();
  const [tickets, setTickets] = useState<UserTicket[]>([]);
  const [pending, setPending] = useState(true);
  const [openTicket, setOpenTicket] = useState<UserTicket | null>(null);
  const [tab, setTab] = useState<TicketTab>("active");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  useEffect(() => {
    if (!user) return;
    ApiClient.instance.get("/users/me/tickets")
      .then((response) => setTickets(response as UserTicket[]))
      .catch(() => setTickets([]))
      .finally(() => setPending(false));
  }, [user]);

  const activeTickets = useMemo(
    () => tickets.filter((ticket) => !ticket.isValidated && !isExpired(ticket)),
    [tickets],
  );
  const usedTickets = useMemo(
    () => tickets.filter((ticket) => ticket.isValidated),
    [tickets],
  );
  const expiredTickets = useMemo(
    () => tickets.filter((ticket) => !ticket.isValidated && isExpired(ticket)),
    [tickets],
  );
  const selectedTickets = tab === "active" ? activeTickets : tab === "used" ? usedTickets : expiredTickets;
  const groups = useMemo(() => groupByEvent(selectedTickets), [selectedTickets]);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 pb-32 pt-10 text-foreground sm:px-7">
      <Link href="/users/me" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-primary">
        <ChevronLeft className="h-4 w-4" /> {t("tickets.profile")}
      </Link>

      <div className="mt-5">
        <h1 className="text-2xl font-semibold">{t("tickets.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("tickets.count", { count: tickets.length })}
        </p>
      </div>

      <div className="relative mt-5 grid h-[44px] grid-cols-3 rounded-full border border-white/10 bg-[#121418]/85 p-1 shadow-[rgba(255,255,255,0.18)_0px_1px_0px_inset,rgba(0,0,0,0.35)_0px_6px_20px] md:backdrop-blur-md">
        {(["active", "used", "expired"] as const).map((item) => {
          const count = item === "active" ? activeTickets.length : item === "used" ? usedTickets.length : expiredTickets.length;
          const Icon = tabIcons[item];
          const active = tab === item;
          return <button key={item} type="button" onClick={() => setTab(item)} className={`relative z-10 flex h-full items-center justify-center gap-1.5 rounded-full px-2 text-xs font-semibold transition-colors ${active ? "text-black" : "text-white/70 hover:text-white"}`}>
            {active && <motion.span layoutId="ticket-status-pill" className="absolute inset-[1px] -z-10 rounded-full bg-primary" transition={{ type: "spring", stiffness: 500, damping: 35 }} />}
            <Icon className="h-3.5 w-3.5" /> {t(`tickets.${item}`)} <span className="text-[10px] opacity-75">{count}</span>
          </button>;
        })}
      </div>

      {pending ? (
        <div className="mt-6 h-56 animate-pulse rounded-lg border border-white/10 bg-white/[0.03]" />
      ) : selectedTickets.length === 0 ? (
        <div className="mt-7 rounded-lg border border-dashed border-white/15 px-5 py-12 text-center">
          <Ticket className="mx-auto h-6 w-6 text-primary" />
          <p className="mt-3 text-sm font-semibold">{t("tickets.empty", { status: t(`tickets.${tab}`).toLowerCase() })}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("tickets.emptyHint")}</p>
        </div>
      ) : (
        <div className="mt-7 space-y-5">
          {Object.values(groups).map((eventTickets) => <TicketEventGroup key={eventTickets[0].eventId} tickets={eventTickets} tab={tab} onOpen={setOpenTicket} />)}
        </div>
      )}

      {openTicket && <TicketPreview ticket={openTicket} onClose={() => setOpenTicket(null)} />}
    </main>
  );
}

function TicketEventGroup({ tickets, tab, onOpen }: { tickets: UserTicket[]; tab: TicketTab; onOpen: (ticket: UserTicket) => void }) {
  const { t } = useTranslation();
  const event = tickets[0];
  return <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.025]">
    <div className="border-b border-white/10 p-4">
      <p className="text-base font-semibold">{event.eventTitle}</p>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {formatEventDate(event.startTime)}</span>
        <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {event.locationName}</span>
      </p>
    </div>
    <div className="divide-y divide-white/10">
      {tickets.map((ticket, index) => <button key={ticket.id} type="button" onClick={() => onOpen(ticket)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.04]">
        <span className={`grid h-9 w-9 place-items-center rounded-lg border ${tab === "active" ? "border-primary/30 bg-primary/10 text-primary" : "border-white/15 bg-white/[0.04] text-muted-foreground"}`}><QrCode className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{ticket.ticketTypeName}</span><span className="mt-0.5 block text-xs text-muted-foreground">{t("tickets.ticketNumber", { count: index + 1 })}{tab === "used" ? ` - ${t("tickets.validated")}` : tab === "expired" ? ` - ${t("tickets.expiredStatus")}` : ""}</span></span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>)}
    </div>
  </section>;
}

function TicketPreview({ ticket, onClose }: { ticket: UserTicket; onClose: () => void }) {
  const { t } = useTranslation();
  return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
    <div className="w-full max-w-sm rounded-xl border border-white/15 bg-[#101311] p-5" onClick={(event) => event.stopPropagation()}>
      <button type="button" onClick={onClose} className="ml-auto block text-xs text-muted-foreground hover:text-white">{t("tickets.close")}</button>
      <p className="mt-2 text-sm font-semibold">{ticket.eventTitle}</p>
      <p className="mt-1 text-xs text-muted-foreground">{ticket.ticketTypeName}</p>
      <div className="mt-5 flex justify-center bg-white p-4"><TicketQrCode value={ticket.validationHash} size={220} /></div>
    </div>
  </div>;
}
