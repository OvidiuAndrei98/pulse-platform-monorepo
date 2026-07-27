"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDataProvider } from "@/core/DataProviderContext";
import { Event } from "@/core/DataProvider";
import { ApiClient, ReadableSchema } from "@packages/api-client/src/Client";
import { TicketQrCode } from "@/components/tickets/TicketQrCode";
import { ProfileConnectionQr } from "@/components/social/ProfileConnectionQr";
import { ProfileAvatarUpload } from "@/components/profile/ProfileAvatarUpload";
import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import {
  QrCode,
  Ticket,
  Receipt,
  ChevronRight,
  MapPin,
  Calendar,
  Download,
  Wallet,
  User,
  Lock,
  Trash2,
  LogOut,
  Mail,
  Sparkles,
  Bookmark,
  X,
} from "lucide-react";

type TicketData = {
  id: string;
  eventId: string;
  event: string;
  date: string;
  time: string;
  location: string;
  type: string;
  hash: string;
  startTime?: string;
  endTime?: string;
  isValidated?: boolean;
};

type UserTicket = ReadableSchema<"UserTicketResponse">;
type ValidationEvent = ReadableSchema<"ValidationEventResponse">;

const sampleTickets: TicketData[] = [
  {
    id: "TCK-8821",
    eventId: "sample-neon-warehouse",
    event: "Neon Warehouse — Techno Night",
    date: "Sat, 21 Nov 2026",
    time: "23:00",
    location: "Expirat, Str. Halelor 5, București",
    type: "VIP",
    hash: "a1f4c9b2e8d7",
  },
  {
    id: "TCK-8734",
    eventId: "sample-sunset-rooftop",
    event: "Sunset Rooftop w/ Barac",
    date: "Fri, 04 Dec 2026",
    time: "20:30",
    location: "Nomad Skybar, București",
    type: "Regular",
    hash: "77bde12aa903",
  },
];

type Order = {
  id: string;
  event: string;
  date: string;
  amount: string;
  status: "completed" | "refunded" | "failed";
  stripeId: string;
};

const orderHistory: Order[] = [
  {
    id: "ORD-1042",
    event: "Neon Warehouse",
    date: "12 Nov 2026",
    amount: "220.00 RON",
    status: "completed",
    stripeId: "pi_3PxQ2k…9f",
  },
  {
    id: "ORD-1039",
    event: "Sunset Rooftop",
    date: "08 Nov 2026",
    amount: "150.00 RON",
    status: "completed",
    stripeId: "pi_3PwLm1…2c",
  },
];

function groupTicketsByEvent(tickets: TicketData[]) {
  const groups = new Map<string, TicketData[]>();
  tickets.forEach((ticket) => {
    groups.set(ticket.eventId, [...(groups.get(ticket.eventId) ?? []), ticket]);
  });
  return Array.from(groups.values());
}

export default function MePage() {
  const { user, loading, logout, isOrganizer, reloadSession } = useDataProvider();
  const router = useRouter();
  const [tab, setTab] = useState<"active" | "history">("active");
  const [openTicket, setOpenTicket] = useState<TicketData | null>(null);
  const [savedEvents, setSavedEvents] = useState<Event[]>([]);
  const [savedEventsLoading, setSavedEventsLoading] = useState(true);
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [validationEvents, setValidationEvents] = useState<ValidationEvent[]>(
    [],
  );

  // Stare pentru a ști ce secțiune de setări este extinsă ("details" | "password" | "delete" | null)
  const [activeRow, setActiveRow] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    user
      .getSavedEvents()
      .then(setSavedEvents)
      .catch((error) =>
        console.error("Nu s-au putut incarca evenimentele salvate:", error),
      )
      .finally(() => setSavedEventsLoading(false));
  }, [user]);

  useEffect(() => {
    if (!user || isOrganizer) return;
    ApiClient.instance
      .get("/dashboard/ticket-validation/events")
      .then((response: ValidationEvent[]) => setValidationEvents(response))
      .catch(() => setValidationEvents([]));
  }, [user, isOrganizer]);

  useEffect(() => {
    if (!user) return;
    ApiClient.instance
      .get("/users/me/tickets")
      .then((response: UserTicket[]) =>
        setTickets(
          response.map((ticket) => {
            const start = new Date(ticket.startTime);
            return {
              id: ticket.id,
              eventId: ticket.eventId,
              event: ticket.eventTitle,
              date: start.toLocaleDateString("ro-RO", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
              time: start.toLocaleTimeString("ro-RO", {
                hour: "2-digit",
                minute: "2-digit",
              }),
              location: ticket.locationName,
              type: ticket.ticketTypeName,
              hash: ticket.validationHash,
              startTime: ticket.startTime,
              endTime: ticket.endTime,
              isValidated: ticket.isValidated,
            };
          }),
        ),
      )
      .catch((error) => console.error("Nu s-au putut incarca biletele:", error))
      .finally(() => setTicketsLoading(false));
  }, [user]);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span className="animate-pulse">Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const activeTickets = tickets.filter(
    (ticket) =>
      !ticket.isValidated &&
      (!ticket.endTime || new Date(ticket.endTime).getTime() >= Date.now()),
  );
  const activeTicketGroups = groupTicketsByEvent(activeTickets);

  const toggleRow = (rowId: string) => {
    setActiveRow(activeRow === rowId ? null : rowId);
  };

  return (
    <div className="relative min-h-screen w-full pb-40 text-foreground overflow-y-auto">
      <div className="mx-auto max-w-md px-5 pt-10 md:max-w-7xl md:px-8 md:pt-16">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12 items-start">
          <div className="md:col-span-4 md:sticky md:top-16 space-y-6">
            <header className="flex items-center gap-4">
              <ProfileAvatarUpload
                user={user}
                showBadge
                onUploaded={() => void reloadSession()}
              />
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-2xl font-semibold tracking-tight">
                  {user.properties.username}
                </h1>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" /> {user.properties.email}
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground">
                  <Sparkles className="h-3 w-3 text-primary" />
                  Member since 2026
                </div>
              </div>
            </header>

            {!isOrganizer && validationEvents.length > 0 && (
              <Link
                href="/ticket-validation"
                className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-left transition hover:bg-primary/15"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <QrCode className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    Validare bilete
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Ai acces la {validationEvents.length}{" "}
                    {validationEvents.length === 1 ? "eveniment" : "evenimente"}
                    .
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-primary" />
              </Link>
            )}

            {!isOrganizer && <ProfileConnectionQr />}

            {/* Securitatea pe Desktop */}
            <section className="hidden md:block">
              <h2 className="mb-3 text-lg font-semibold">Account & Security</h2>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                <Row
                  icon={User}
                  label="Personal details"
                  hint="Name, phone number"
                  isOpen={activeRow === "details-desktop"}
                  onClick={() => toggleRow("details-desktop")}
                >
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="text-[11px] text-muted-foreground block mb-1">
                        Full Name
                      </label>
                      <input
                        type="text"
                        defaultValue={user.properties.username}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground block mb-1">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        placeholder="+40 7xx xxx xxx"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                      />
                    </div>
                    <button className="w-full bg-primary text-primary-foreground text-xs font-semibold py-2 rounded-xl hover:bg-primary/90 transition">
                      Save Changes
                    </button>
                  </div>
                </Row>
                <Row
                  icon={Lock}
                  label="Change password"
                  isOpen={activeRow === "password-desktop"}
                  onClick={() => toggleRow("password-desktop")}
                >
                  <div className="space-y-3 pt-2">
                    <input
                      type="password"
                      placeholder="Current password"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                    />
                    <input
                      type="password"
                      placeholder="New password"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                    />
                    <button className="w-full bg-primary text-primary-foreground text-xs font-semibold py-2 rounded-xl hover:bg-primary/90 transition">
                      Update Password
                    </button>
                  </div>
                </Row>
                <Row
                  icon={Trash2}
                  label="Delete account"
                  danger
                  isOpen={activeRow === "delete-desktop"}
                  onClick={() => toggleRow("delete-desktop")}
                >
                  <div className="pt-2 space-y-2">
                    <p className="text-xs text-red-400/80 leading-normal">
                      This action is permanent. All your active tickets and
                      history will be wiped instantly.
                    </p>
                    <button className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-xs font-semibold py-2 rounded-xl transition">
                      Confirm Delete
                    </button>
                  </div>
                </Row>
              </div>
            </section>

            <button
              className="hidden md:flex mountaineer w-full items-center justify-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/15"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>

          <div className="md:col-span-8 space-y-8">
            <section className="md:border md:border-white/5 md:bg-white/[0.01] md:p-6 md:rounded-3xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Bookmark className="h-4 w-4 text-primary" /> Evenimente
                  salvate
                </h2>
                <span className="text-xs text-muted-foreground">
                  {savedEvents.length}
                </span>
              </div>
              {savedEventsLoading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="h-20 animate-pulse border border-white/10 bg-white/[0.04]" />
                  <div className="h-20 animate-pulse border border-white/10 bg-white/[0.04]" />
                </div>
              ) : savedEvents.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-muted-foreground">
                  Nu ai salvat niciun eveniment inca.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {savedEvents.map((event) => (
                    <Link
                      key={event.id}
                      href={`/events/${event.id}`}
                      className="group flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition hover:bg-white/[0.06]"
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white/5">
                        {event.bannerUrl && (
                          <img
                            src={event.bannerUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {event.title}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {event.locationName} ·{" "}
                          {new Date(event.startTime).toLocaleDateString(
                            "ro-RO",
                            { day: "numeric", month: "short" },
                          )}
                        </p>
                      </div>
                      <Bookmark className="h-4 w-4 shrink-0 fill-primary text-primary" />
                    </Link>
                  ))}
                </div>
              )}
            </section>
            <section className="md:border md:border-white/5 md:bg-white/[0.01] md:p-6 md:rounded-3xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">My Tickets & Orders</h2>
                <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 md:hidden">
                  <TabBtn
                    active={tab === "active"}
                    onClick={() => setTab("active")}
                  >
                    <Ticket className="h-3.5 w-3.5" /> Active
                    <span className="ml-1 rounded-full bg-primary/20 px-1.5 text-[10px] text-primary">
                      {activeTickets.length}
                    </span>
                  </TabBtn>
                  <TabBtn
                    active={tab === "history"}
                    onClick={() => setTab("history")}
                  >
                    <Receipt className="h-3.5 w-3.5" /> History
                  </TabBtn>
                </div>
              </div>

              {/* RENDER MOBIL */}
              <div className="md:hidden">
                {tab === "active" ? (
                  ticketsLoading ? (
                    <TicketStackSkeleton />
                  ) : activeTicketGroups.length ? (
                    <>
                      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
                        {activeTicketGroups.map((group) => (
                          <TicketEventStack
                            key={group[0].eventId}
                            tickets={group}
                            onOpen={setOpenTicket}
                            className="w-[min(86vw,22rem)] shrink-0 snap-start"
                          />
                        ))}
                      </div>
                      <Link
                        href="/users/me/tickets"
                        className="mt-3 flex items-center justify-between border border-white/10 px-4 py-3 text-sm font-semibold transition hover:border-primary/50"
                      >
                        <span>Vezi toate biletele</span>
                        <ChevronRight className="h-4 w-4 text-primary" />
                      </Link>
                    </>
                  ) : (
                    <EmptyTickets />
                  )
                ) : (
                  <>
                    <Link
                      href="/users/me/invoices"
                      className="flex items-center gap-3 border border-white/10 bg-white/[0.03] px-4 py-4 transition hover:border-primary/50"
                    >
                      <span className="grid h-9 w-9 place-items-center bg-primary/10 text-primary">
                        <Receipt className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                          Vezi facturile
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Comenzile si platile tale
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-primary" />
                    </Link>
                    <div className="hidden divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/5">
                      {orderHistory.map((o) => (
                        <div key={o.id} className="flex items-center gap-3 p-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {o.event}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                              {o.date} · {o.id} · {o.stripeId}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-sm font-semibold">
                              {o.amount}
                            </span>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] capitalize ${statusStyles[o.status]}`}
                            >
                              {o.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* RENDER DESKTOP */}
              <div className="hidden md:grid md:grid-cols-1 md:gap-6">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <Ticket className="h-4 w-4" /> Active Tickets (
                    {activeTickets.length})
                  </h3>
                  {ticketsLoading ? (
                    <div className="grid grid-cols-2 gap-3">
                      <TicketStackSkeleton />
                      <TicketStackSkeleton />
                    </div>
                  ) : activeTicketGroups.length ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        {activeTicketGroups.slice(0, 4).map((group) => (
                          <TicketEventStack
                            key={group[0].eventId}
                            tickets={group}
                            onOpen={setOpenTicket}
                          />
                        ))}
                      </div>
                      <Link
                        href="/users/me/tickets"
                        className="mt-3 flex items-center justify-between border border-white/10 px-4 py-3 text-sm font-semibold transition hover:border-primary/50"
                      >
                        <span>Vezi toate biletele</span>
                        <ChevronRight className="h-4 w-4 text-primary" />
                      </Link>
                    </>
                  ) : (
                    <EmptyTickets />
                  )}
                </div>

                <div className="pt-2">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <Receipt className="h-4 w-4" /> Order History
                  </h3>
                  <Link
                    href="/users/me/invoices"
                    className="flex items-center gap-3 border border-white/10 bg-white/[0.03] px-4 py-4 transition hover:border-primary/50"
                  >
                    <span className="grid h-9 w-9 place-items-center bg-primary/10 text-primary">
                      <Receipt className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        Vezi facturile
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Comenzile si platile tale
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-primary" />
                  </Link>
                  <div className="hidden divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/5">
                    {orderHistory.map((o) => (
                      <div key={o.id} className="flex items-center gap-3 p-3.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{o.event}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {o.date} · {o.id} ·{" "}
                            <span className="font-mono text-zinc-500">
                              {o.stripeId}
                            </span>
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-sm font-semibold">
                            {o.amount}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] capitalize ${statusStyles[o.status]}`}
                          >
                            {o.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Secțiunile de Setări de Mobil */}
            <div className="space-y-6 md:hidden">
              <section>
                <h2 className="mb-3 text-lg font-semibold">
                  Account & Security
                </h2>
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                  <Row
                    icon={User}
                    label="Personal details"
                    hint="Name, phone number"
                    isOpen={activeRow === "details-mobile"}
                    onClick={() => toggleRow("details-mobile")}
                  >
                    <div className="space-y-3 pt-2">
                      <input
                        type="text"
                        defaultValue={user.properties.username}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                      />
                      <input
                        type="tel"
                        placeholder="Phone number"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                      />
                      <button className="w-full bg-primary text-primary-foreground text-xs font-semibold py-2 rounded-xl">
                        Save
                      </button>
                    </div>
                  </Row>
                  <Row
                    icon={Lock}
                    label="Change password"
                    isOpen={activeRow === "password-mobile"}
                    onClick={() => toggleRow("password-mobile")}
                  >
                    <div className="space-y-3 pt-2">
                      <input
                        type="password"
                        placeholder="Current password"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                      />
                      <input
                        type="password"
                        placeholder="New password"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                      />
                      <button className="w-full bg-primary text-primary-foreground text-xs font-semibold py-2 rounded-xl">
                        Update
                      </button>
                    </div>
                  </Row>
                  <Row
                    icon={Trash2}
                    label="Delete account"
                    danger
                    isOpen={activeRow === "delete-mobile"}
                    onClick={() => toggleRow("delete-mobile")}
                  >
                    <div className="pt-2 space-y-2">
                      <p className="text-xs text-red-400/80">
                        This action is permanent.
                      </p>
                      <button className="w-full bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold py-2 rounded-xl">
                        Confirm Delete
                      </button>
                    </div>
                  </Row>
                </div>
              </section>
            </div>

            <section>
              <h2 className="mb-3 text-lg font-semibold md:text-sm md:font-medium md:text-muted-foreground">
                Support & Legal
              </h2>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                <Row
                  icon={ChevronRight}
                  label="Help & Support"
                  hint="Ticket or payment issues"
                  isOpen={activeRow === "help"}
                  onClick={() => toggleRow("help")}
                >
                  <p className="text-xs text-muted-foreground pt-2">
                    For any immediate problems, drop us an email at
                    help@pulse.com.
                  </p>
                </Row>
                <Row icon={ChevronRight} label="Terms & Conditions" />
                <Row icon={ChevronRight} label="Privacy policy" />
              </div>
            </section>

            <button
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/15 md:hidden"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>

            <p className="text-center text-[10px] text-muted-foreground/60 md:text-left">
              Pulse · v1.0.0
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {openTicket && (
          <TicketModal
            ticket={openTicket}
            onClose={() => setOpenTicket(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// COMPONENTA ROW MODIFICATĂ PENTRU A SUPORTA DESCHIDEREA SMOOTH
function Row({
  icon: Icon,
  label,
  hint,
  danger,
  isOpen,
  onClick,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  danger?: boolean;
  isOpen?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const isExpandable = !!children;

  return (
    <div className="border-b border-white/5 last:border-b-0">
      {/* Zona superioară interactivă (Butonul standard) */}
      <button
        onClick={isExpandable ? onClick : undefined}
        disabled={!isExpandable}
        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition ${
          isExpandable
            ? "hover:bg-white/[0.04] cursor-pointer"
            : "cursor-default"
        } ${danger ? "text-red-400" : "text-white"}`}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${danger ? "bg-red-500/10" : "bg-white/5"}`}
        >
          <Icon
            className={`h-4 w-4 ${danger ? "text-red-400" : "text-muted-foreground"}`}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{label}</p>
          {hint && !isOpen && (
            <p className="truncate text-[11px] text-muted-foreground mt-0.5">
              {hint}
            </p>
          )}
        </div>

        {/* Schimbăm direcția iconiței/săgeții în funcție de starea acordionului */}
        {isExpandable && (
          <motion.div
            animate={{ rotate: isOpen ? 90 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </motion.div>
        )}
      </button>

      {/* Zona care se lasă în jos la click */}
      <AnimatePresence initial={false}>
        {isOpen && children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0 }}
            className="overflow-hidden bg-white/[0.02]"
          >
            <div className="px-4 pb-4 border-t border-white/[0.02]">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Restul componentelor neschimbate (TicketModal, TabBtn, FauxQR, statusStyles) rămân exact cum erau în codul tău inițial.
function TicketModal({
  ticket,
  onClose,
}: {
  ticket: TicketData;
  onClose: () => void;
}) {
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (window.innerWidth < 768 && info.offset.y > 100) onClose();
  };
  return (
    <>
      <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center md:justify-end">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/70 backdrop-blur-sm md:hidden"
        />
        <motion.div
          initial={window.innerWidth >= 768 ? { x: "100%" } : { y: "100%" }}
          animate={window.innerWidth >= 768 ? { x: 0 } : { y: 0 }}
          exit={window.innerWidth >= 768 ? { x: "100%" } : { y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 260 }}
          drag={window.innerWidth >= 768 ? false : "y"}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.05, bottom: 0.75 }}
          onDragEnd={handleDragEnd}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md bg-neutral-950 p-6 pb-10 border border-white/10 shadow-2xl overflow-y-auto rounded-t-3xl sm:rounded-b-3xl md:rounded-none md:h-screen md:max-w-md md:border-t-0 md:border-b-0 md:border-l md:pb-6"
          style={{
            backgroundImage:
              "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0) 40%)",
          }}
        >
          <div className="absolute left-0 right-0 top-3 flex justify-center md:hidden">
            <div className="h-1.5 w-12 rounded-full bg-white/20" />
          </div>
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/5 p-1.5 text-muted-foreground transition hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="mt-4 flex items-center gap-2 md:mt-6">
            <span className="rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {ticket.type}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {ticket.id}
            </span>
          </div>
          <h3 className="mt-2 text-xl font-bold leading-snug tracking-tight text-white">
            {ticket.event}
          </h3>
          <div className="mt-6 flex justify-center">
            <div className="rounded-2xl bg-white p-4 shadow-xl">
              <TicketQrCode value={ticket.hash} size={220} />
            </div>
          </div>
          <div className="mt-6 space-y-3 border-t border-b border-white/5 py-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4 shrink-0" />
              <span>
                {ticket.date} · {ticket.time}
              </span>
            </div>
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(ticket.location)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-2 text-primary underline-offset-2 hover:underline"
            >
              <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="leading-tight">{ticket.location}</span>
            </a>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-medium transition hover:bg-white/10 text-white">
              <Wallet className="h-4 w-4 text-primary" /> Add to Wallet
            </button>
            <button className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-medium transition hover:bg-white/10 text-white">
              <Download className="h-4 w-4" /> PDF
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
}

function TicketStackSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="space-y-2">
          <div className="h-3 w-32 animate-pulse bg-white/10" />
          <div className="h-2.5 w-48 animate-pulse bg-white/5" />
        </div>
        <div className="h-5 w-10 animate-pulse bg-white/10" />
      </div>
      <div className="border-t border-white/10 px-4 py-3">
        <div className="h-8 animate-pulse bg-white/5" />
      </div>
    </div>
  );
}

function EmptyTickets({ used = false }: { used?: boolean }) {
  return (
    <div className="border border-dashed border-white/15 px-4 py-8 text-center">
      <Ticket className="mx-auto h-5 w-5 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">
        {used ? "Nu ai bilete validate inca." : "Nu ai bilete active."}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {used
          ? "Biletele folosite vor ramane aici ca istoric."
          : "Biletele cumparate vor aparea aici."}
      </p>
    </div>
  );
}

function TicketEventStack({
  tickets,
  onOpen,
  className = "",
}: {
  tickets: TicketData[];
  onOpen: (ticket: TicketData) => void;
  className?: string;
}) {
  const event = tickets[0];
  if (!event) return null;

  return (
    <div
      className={`overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] ${className}`}
    >
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{event.event}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {event.date}, {event.time}
            </span>
            <span className="flex min-w-0 items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" />{" "}
              <span className="truncate">{event.location}</span>
            </span>
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
          {tickets.length} {tickets.length === 1 ? "bilet" : "bilete"}
        </span>
      </div>
      <div className="max-h-56 divide-y divide-white/10 overflow-y-auto overscroll-contain border-t border-white/10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tickets.map((ticket, index) => (
          <button
            key={ticket.id}
            type="button"
            onClick={() => onOpen(ticket)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.05]"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center border border-primary/25 bg-primary/10 text-primary">
              <QrCode className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {ticket.type}
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                Biletul {index + 1}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${active ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-white"}`}
    >
      {children}
    </button>
  );
}

function FauxQR({ seed }: { seed: string }) {
  const size = 21;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const cells: boolean[] = [];
  for (let i = 0; i < size * size; i++) {
    h = (h * 1664525 + 1013904223) >>> 0;
    cells.push((h & 1) === 1);
  }
  const isFinder = (r: number, c: number) => {
    const inBox = (br: number, bc: number) =>
      r >= br && r < br + 7 && c >= bc && c < bc + 7;
    return inBox(0, 0) || inBox(0, size - 7) || inBox(size - 7, 0);
  };
  const finderPixel = (r: number, c: number) => {
    const inRing = (br: number, bc: number) => {
      const rr = r - br,
        cc = c - bc;
      if (rr < 0 || rr > 6 || cc < 0 || cc > 6) return null;
      if (rr === 0 || rr === 6 || cc === 0 || cc === 6) return true;
      if (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4) return true;
      return false;
    };
    return inRing(0, 0) ?? inRing(0, size - 7) ?? inRing(size - 7, 0) ?? false;
  };
  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: `repeat(${size}, 6px)`, gap: 0 }}
    >
      {Array.from({ length: size * size }).map((_, i) => {
        const r = Math.floor(i / size);
        const c = i % size;
        const on = isFinder(r, c) ? finderPixel(r, c) : cells[i];
        return (
          <div
            key={i}
            style={{ width: 6, height: 6, background: on ? "#000" : "#fff" }}
          />
        );
      })}
    </div>
  );
}

const statusStyles: Record<Order["status"], string> = {
  completed: "bg-primary/15 text-primary border-primary/30",
  refunded: "bg-white/10 text-muted-foreground border-white/15",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
};
