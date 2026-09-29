"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Calendar, ChevronLeft, ChevronRight, MapPin, QrCode, Ticket, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ApiClient, type ReadableSchema } from "@packages/api-client/src/Client";
import { useDataProvider } from "@/core/DataProviderContext";
import { useBackLayer } from "@/lib/navigation/useBackLayer";
import { useNavigationState } from "@/lib/navigation/useNavigationState";
import { useClientQuery } from "@/lib/useClientQuery";
import { BackLink } from "@/components/BackLink";
import { RequestError } from "@/components/ui/RequestFeedback";
import { Skeleton } from "@/components/ui/loading";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { TicketPass } from "@/components/tickets/TicketPass";
import { TicketPdfButton } from "@/components/tickets/TicketPdfButton";
import { formatEventDateTime } from "@/features/events/dateFormat";

type UserTicket = ReadableSchema<"UserTicketResponse">;
type TicketTab = "active" | "history" | "used" | "expired";

function ticketStatus(ticket: UserTicket, now: number) {
  if (ticket.isValidated) return "used";
  return new Date(ticket.endTime).getTime() <= now ? "expired" : "active";
}

function groupByEvent(tickets: UserTicket[], ascending: boolean) {
  const groups = new Map<string, UserTicket[]>();
  for (const ticket of tickets) {
    const group = groups.get(ticket.eventId) ?? [];
    group.push(ticket);
    groups.set(ticket.eventId, group);
  }
  return [...groups.values()].sort((left, right) => {
    const difference = new Date(left[0].startTime).getTime() - new Date(right[0].startTime).getTime();
    return Number.isFinite(difference) ? difference * (ascending ? 1 : -1) : 0;
  });
}

export default function TicketsPage() {
  const { user, loading } = useDataProvider();
  const { t } = useTranslation();
  const router = useRouter();
  const { data: tickets, pending, error, retry } = useClientQuery<UserTicket[]>(
    user ? `tickets:${user.properties.id}` : null,
    async () => (await ApiClient.instance.get("/users/me/tickets")) ?? [], [],
  );
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [tab, setTab] = useNavigationState<TicketTab>("tickets-tab:" + (user?.properties.id ?? "guest"), "active");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!loading && !user) router.replace("/login?returnTo=%2Fusers%2Fme%2Ftickets");
  }, [loading, router, user]);

  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, []);

  const activeTickets = tickets.filter(ticket => ticketStatus(ticket, now) === "active");
  const historyTickets = tickets.filter(ticket => ticketStatus(ticket, now) !== "active");
  const selectedTickets = tab === "active" ? activeTickets : tab === "history" ? historyTickets : historyTickets.filter(ticket => ticketStatus(ticket, now) === tab);
  const groups = groupByEvent(selectedTickets, tab === "active");
  const isLoading = loading || !user || pending;
  const openTicket = tickets.find(ticket => ticket.id === openTicketId);
  // Page through the same event group shown in the list, including mixed history.
  const previewTickets = openTicket ? selectedTickets.filter(ticket => ticket.eventId === openTicket.eventId) : [];

  return (
    <main className="app-page-spacing mx-auto min-h-screen max-w-3xl pb-32 text-foreground">
      <BackLink href="/users/me" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-muted-foreground transition hover:text-primary">
        <ChevronLeft className="h-4 w-4" /> {t("tickets.profile")}
      </BackLink>
      <div className="mt-4">
        <h1 className="text-3xl font-bold tracking-tight">{t("tickets.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isLoading ? t("common.loading") : error ? "" : t("tickets.count", { count: tickets.length })}
        </p>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1" role="group" aria-label={t("tickets.title")}>
        {(["active", "history"] as const).map(item => {
          const selected = item === "active" ? tab === "active" : tab !== "active";
          const count = item === "active" ? activeTickets.length : historyTickets.length;
          return (
            <button key={item} type="button" aria-pressed={selected} onClick={() => setTab(item)}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary ${selected ? "bg-primary text-white" : "text-muted-foreground hover:text-white"}`}>
              {t(item === "active" ? "tickets.upcoming" : "tickets.history")}
              {!isLoading && !error && <span className={`rounded-full px-2 py-0.5 text-[11px] tabular-nums ${selected ? "bg-black/20" : "bg-white/5"}`}>{count}</span>}
            </button>
          );
        })}
      </div>

      {tab !== "active" && <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t("tickets.history")}>
        {(["history", "used", "expired"] as const).map(item => (
          <button key={item} type="button" aria-pressed={tab === item} onClick={() => setTab(item)}
            className={`min-h-10 rounded-full border px-4 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary ${tab === item ? "border-white/25 bg-white/10 text-white" : "border-white/10 text-muted-foreground hover:text-white"}`}>
            {t(item === "history" ? "tickets.allHistory" : `tickets.${item}`)}
          </button>
        ))}
      </div>}

      {isLoading ? (
        <div role="status" aria-label={t("common.loading")} className="mt-6 space-y-5">
          {[0, 1].map(index => <section key={index} className="space-y-5 rounded-[26px] border border-white/10 bg-white/[0.025] p-5">
            <Skeleton className="h-3 w-24 rounded-full" />
            <Skeleton className="h-7 w-3/4 rounded-lg" />
            <Skeleton className="h-4 w-1/2 rounded-full" />
            <Skeleton className="h-12 w-full rounded-full" />
          </section>)}
        </div>
      ) : error ? <RequestError onRetry={retry} className="mt-7" /> : selectedTickets.length === 0 ? (
        <div className="mt-7 rounded-[26px] border border-dashed border-white/15 px-5 py-12 text-center">
          <Ticket className="mx-auto h-7 w-7 text-primary" />
          <p className="mt-4 text-sm font-semibold">{t(tab === "active" ? "tickets.noUpcoming" : "tickets.noHistory")}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{t(tab === "active" ? "tickets.noUpcomingHint" : "tickets.emptyHint")}</p>
          {tab === "active" && <Link href="/events" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white">{t("tickets.exploreEvents")}<ChevronRight className="h-4 w-4" /></Link>}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {groups.map((eventTickets, index) => (
            <TicketEventGroup key={eventTickets[0].eventId} tickets={eventTickets} now={now} featured={tab === "active" && index === 0} onOpen={ticket => setOpenTicketId(ticket.id)} />
          ))}
        </div>
      )}
      {openTicket && user && <TicketPreview key={user.properties.id} tickets={previewTickets} ticket={openTicket} now={now} onSelect={ticket => setOpenTicketId(ticket.id)} onClose={() => setOpenTicketId(null)} />}
    </main>
  );
}

function TicketEventGroup({ tickets, now, featured, onOpen }: {
  tickets: UserTicket[];
  now: number;
  featured: boolean;
  onOpen: (ticket: UserTicket) => void;
}) {
  const { t } = useTranslation();
  const event = tickets[0];
  const happening = new Date(event.startTime).getTime() <= now && new Date(event.endTime).getTime() > now;
  return (
    <section data-ticket-event={event.eventId} data-featured={featured || undefined} className={`overflow-hidden rounded-[26px] border ${featured ? "border-primary/30 bg-gradient-to-br from-primary/[0.12] via-[#111111] to-[#0a0a0a]" : "border-white/10 bg-white/[0.025]"}`}>
      <div className="p-5">
        {featured && <p className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" />{t(happening ? "tickets.happeningNow" : "tickets.nextEvent")}</p>}
        <h2 className={`${featured ? "text-2xl" : "text-lg"} break-words font-bold leading-tight tracking-tight`}>{event.eventTitle}</h2>
        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
          <p className="flex items-start gap-2"><Calendar className="h-4 w-4 shrink-0" />{formatEventDateTime(event.startTime)}</p>
          <p className="flex items-start gap-2"><MapPin className="h-4 w-4 shrink-0 text-primary" />{event.locationName}</p>
        </div>
        {featured && <button type="button" onClick={() => onOpen(event)} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
          <QrCode className="h-4 w-4" />{t("tickets.showQr")}{tickets.length > 1 && <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs tabular-nums">{tickets.length}</span>}
        </button>}
      </div>
      <div className="divide-y divide-white/10 border-t border-dashed border-white/15">
        {tickets.map((ticket, index) => {
          const status = ticketStatus(ticket, now);
          return (
            <button key={ticket.id} type="button" data-ticket-id={ticket.id} onClick={() => onOpen(ticket)} className="flex min-h-20 w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${status === "active" ? "bg-primary/10 text-primary" : "bg-white/5 text-muted-foreground"}`}><QrCode className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{ticket.ticketTypeName}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{t("tickets.ticketNumber", { count: index + 1 })}</span>
              </span>
              {status !== "active" && <span className="text-xs text-muted-foreground">{t(`tickets.${status}`)}</span>}
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TicketPreview({
  ticket,
  tickets,
  now,
  onSelect,
  onClose,
}: {
  ticket: UserTicket;
  tickets: UserTicket[];
  now: number;
  onSelect: (ticket: UserTicket) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [isDesktop, setIsDesktop] = useState(false);
  const reducedMotion = useReducedMotion();
  const index = tickets.findIndex(item => item.id === ticket.id);
  const status = ticketStatus(ticket, now);
  useBackLayer(true, onClose);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const content = (
    <div data-ticket-preview={ticket.id} className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5 md:px-6 md:pt-6">
      <button
        type="button"
        onClick={onClose}
        aria-label={t("tickets.close")}
        className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
      {tickets.length > 1 && <div className="mt-8 flex items-center justify-between gap-3">
        <button type="button" aria-label={t("tickets.previousTicket")} disabled={index <= 0} onClick={() => onSelect(tickets[index - 1])} className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 disabled:opacity-25 focus-visible:outline-2 focus-visible:outline-primary"><ChevronLeft className="h-5 w-5" /></button>
        <p aria-live="polite" className="text-sm font-semibold tabular-nums">{t("tickets.ticketPosition", { current: index + 1, total: tickets.length })}</p>
        <button type="button" aria-label={t("tickets.nextTicket")} disabled={index >= tickets.length - 1} onClick={() => onSelect(tickets[index + 1])} className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 disabled:opacity-25 focus-visible:outline-2 focus-visible:outline-primary"><ChevronRight className="h-5 w-5" /></button>
      </div>}
      {status !== "active" && <p className="mt-5 text-center text-sm font-semibold text-primary">
        {t(status === "used" ? "tickets.alreadyUsed" : "tickets.eventEnded")}
      </p>}
      <div className="mt-5"><TicketPass ticket={ticket} /></div>
      <a href={`https://maps.google.com/?q=${encodeURIComponent(ticket.locationName)}`} target="_blank" rel="noreferrer" className="mt-4 flex min-h-11 items-center gap-2 text-sm text-primary"><MapPin className="h-4 w-4" />{ticket.locationName}</a>
      <TicketPdfButton
        key={ticket.id}
        ticket={ticket}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-medium text-white transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
      />
    </div>
  );

  if (!isDesktop) {
    return (
      <Drawer
        historyBack={false}
        open
        onOpenChange={(open) => !open && onClose()}
        shouldScaleBackground={false}
      >
        <DrawerContent className="h-[min(84svh,46rem)] border-white/10 bg-neutral-950 p-0">
          <DrawerTitle className="sr-only">{ticket.eventTitle}</DrawerTitle>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] hidden bg-black/70 backdrop-blur-sm md:block"
      onClick={onClose}
    >
      <motion.aside
        initial={{ x: reducedMotion ? 0 : "100%" }}
        animate={{ x: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
        onClick={(event) => event.stopPropagation()}
        className="relative ml-auto flex h-full w-full max-w-md flex-col border-l border-white/10 bg-neutral-950 shadow-2xl"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0) 40%)",
        }}
      >
        {content}
      </motion.aside>
    </div>
  );
}
