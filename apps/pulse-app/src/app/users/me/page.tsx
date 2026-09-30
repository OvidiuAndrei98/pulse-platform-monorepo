"use client";

import { useCachedClientQuery } from "@/lib/useCachedClientQuery";
import { RequestError } from "@/components/ui/RequestFeedback";
import { SavedEventCard } from "@/components/profile/SavedEventCard";

import { useNavigationState } from "@/lib/navigation/useNavigationState";
import { routeForPlatform } from "@/lib/native/navigation";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDataProvider } from "@/core/DataProviderContext";
import { Event } from "@/core/DataProvider";
import { ApiClient, ReadableSchema } from "@packages/api-client/src/Client";
import { TicketPreview } from "@/components/tickets/TicketPreview";
import { ProfileConnectionQr } from "@/components/social/ProfileConnectionQr";
import { ProfileAvatarUpload } from "@/components/profile/ProfileAvatarUpload";
import { PersonalDetailsForm } from "@/components/profile/PersonalDetailsForm";
import { PasswordResetRequest } from "@/components/profile/PasswordResetRequest";
import { LanguagePreferenceRow } from "@/components/profile/LanguagePreferenceRow";
import { AttendancePrivacyRow } from "@/components/profile/AttendancePrivacyRow";
import { HiddenEventCategories } from "@/components/profile/HiddenEventCategories";
import {
  formatEventDate,
  formatEventTime,
} from "@/features/events/dateFormat";
import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ProfileLoadingState } from "@/components/ui/loading";
import {
  QrCode,
  Ticket,
  Receipt,
  ChevronRight,
  MapPin,
  Calendar,
  User,
  Lock,
  Trash2,
  LogOut,
  Mail,
  Sparkles,
  Bookmark,
  ShieldCheck,
} from "lucide-react";

type TicketData = {
  source: UserTicket;
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
  priceRon?: number;
  organizerCompanyName?: string;
  organizerCui?: string;
  organizerFiscalAddress?: string;
};

type UserTicket = ReadableSchema<"UserTicketResponse">;
type ValidationEvent = ReadableSchema<"ValidationEventResponse">;

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
  const { t } = useTranslation();
  const { user, loading, logout, isOrganizer, updateSessionUser } =
    useDataProvider();
  const router = useRouter();
  const [tab, setTab] = useNavigationState<"active" | "history">("profile-tab:" + (user?.properties.id ?? "guest"), "active");
  const [openTicket, setOpenTicket] = useState<TicketData | null>(null);
  const savedQuery = useCachedClientQuery<Event[]>(user ? 'saved-events:' + user.properties.id : null, () => user!.getSavedEvents(), []);
  const { data: savedEvents, pending: savedEventsLoading } = savedQuery;
  const ticketsQuery = useCachedClientQuery<TicketData[]>(user ? 'profile-tickets:' + user.properties.id : null, async () => {
    const response: UserTicket[] = await ApiClient.instance.get("/users/me/tickets");
    return response.map((ticket) => ({
      source: ticket,
      id: ticket.id, eventId: ticket.eventId, event: ticket.eventTitle,
      date: formatEventDate(ticket.startTime), time: formatEventTime(ticket.startTime),
      location: ticket.locationName, type: ticket.ticketTypeName, hash: ticket.validationHash,
      startTime: ticket.startTime, endTime: ticket.endTime, isValidated: ticket.isValidated,
      priceRon: ticket.priceRon, organizerCompanyName: ticket.organizerCompanyName,
      organizerCui: ticket.organizerCui, organizerFiscalAddress: ticket.organizerFiscalAddress,
    }));
  }, []);
  const { data: tickets, pending: ticketsLoading } = ticketsQuery;
  const [validationEvents, setValidationEvents] = useState<ValidationEvent[]>(
    [],
  );

  // Stare pentru a ști ce secțiune de setări este extinsă ("details" | "password" | "delete" | null)
  const [activeRow, setActiveRow] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?returnTo=%2Fusers%2Fme");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && isOrganizer) {
      router.replace("/dashboard/profile");
    }
  }, [isOrganizer, loading, router]);



  useEffect(() => {
    if (!user || isOrganizer) return;
    ApiClient.instance
      .get("/dashboard/ticket-validation/events")
      .then((response: ValidationEvent[]) => setValidationEvents(response))
      .catch(() => setValidationEvents([]));
  }, [user, isOrganizer]);



  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  if (loading) {
    return (
      <ProfileLoadingState />
    );
  }

  if (!user) return null;

  const activeTickets = tickets.filter(
    (ticket) =>
      !ticket.isValidated &&
      (!ticket.endTime || new Date(ticket.endTime).getTime() >= Date.now()),
  );
  const activeTicketGroups = groupTicketsByEvent(activeTickets);
  const activeValidatedEvent = tickets.find(
    (ticket) =>
      ticket.isValidated &&
      Boolean(ticket.endTime) &&
      new Date(ticket.endTime!).getTime() + 24 * 60 * 60 * 1000 >= Date.now(),
  );

  const toggleRow = (rowId: string) => {
    setActiveRow(activeRow === rowId ? null : rowId);
  };

  return (
    <div className="relative min-h-screen w-full pb-[110px] text-foreground overflow-y-auto">
      <div className="app-page-gutter mx-auto max-w-md pt-[max(1.5rem,var(--native-safe-top))] md:max-w-7xl md:pt-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12 items-start">
          <div className="md:col-span-4 md:sticky md:top-16 space-y-6">
            <header className="flex items-center gap-4">
              <ProfileAvatarUpload user={user} onUploaded={updateSessionUser} />
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-2xl font-semibold tracking-tight">
                  {user.properties.username}
                </h1>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" /> {user.properties.email}
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground">
                  <Sparkles className="h-3 w-3 text-primary" />
                  {t("userProfile.memberSince", { year: 2026 })}
                </div>
              </div>
            </header>

            {!isOrganizer && activeValidatedEvent && (
              <Link
                href={routeForPlatform(`/events/${activeValidatedEvent.eventId}/group`)}
                className="flex items-center gap-3 rounded-[26px] border border-emerald-400/30 bg-emerald-400/[0.09] p-4 text-left transition hover:bg-emerald-400/[0.14]"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-400 text-black">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {t("safetyGroup.activeEvent", { event: activeValidatedEvent.event })}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t("safetyGroup.openGroup")}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-emerald-300" />
              </Link>
            )}

            {!isOrganizer && validationEvents.length > 0 && (
              <Link
                href="/ticket-validation"
                className="flex items-center gap-3 rounded-[26px] border border-primary/30 bg-primary/10 p-4 text-left transition hover:bg-primary/15"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <QrCode className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {t("userProfile.ticketValidation")}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t("userProfile.validationAccess", {
                      count: validationEvents.length,
                    })}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-primary" />
              </Link>
            )}

            {!isOrganizer && <ProfileConnectionQr />}

            {!isOrganizer && <HiddenEventCategories />}

            {/* Securitatea pe Desktop */}
            <section className="hidden md:block">
              <h2 className="mb-3 text-lg font-semibold">
                {t("userProfile.accountSecurity")}
              </h2>
              <div className="overflow-hidden rounded-[26px] border border-white/10 bg-white/5">
                <Row
                  icon={User}
                  label={t("userProfile.personalDetails")}
                  hint={t("userProfile.personalDetailsHint")}
                  isOpen={activeRow === "details-desktop"}
                  onClick={() => toggleRow("details-desktop")}
                >
                  <div className="pt-2">
                    <PersonalDetailsForm
                      user={user}
                      onSaved={updateSessionUser}
                    />
                  </div>
                </Row>
                <Row
                  icon={Lock}
                  label={t("userProfile.changePassword")}
                  isOpen={activeRow === "password-desktop"}
                  onClick={() => toggleRow("password-desktop")}
                >
                  <div className="pt-2">
                    <PasswordResetRequest email={user.properties.email} />
                  </div>
                </Row>
                <LanguagePreferenceRow />
                <AttendancePrivacyRow />
                <Row
                  icon={Trash2}
                  label={t("userProfile.deleteAccount")}
                  danger
                  isOpen={activeRow === "delete-desktop"}
                  onClick={() => toggleRow("delete-desktop")}
                >
                  <div className="pt-2 space-y-2">
                    <p className="text-xs text-red-400/80 leading-normal">
                      {t("userProfile.deleteWarning")}
                    </p>
                    <button className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-xs font-semibold py-2 rounded-xl transition">
                      {t("userProfile.confirmDelete")}
                    </button>
                  </div>
                </Row>
              </div>
            </section>

            <button
              className="hidden md:flex mountaineer w-full items-center justify-center gap-2 rounded-[26px] border border-red-500/25 bg-red-500/10 px-4 py-3.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/15"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" /> {t("userProfile.logout")}
            </button>
          </div>

          <div className="md:col-span-8 space-y-8">
            <section className="md:border md:border-white/5 md:bg-white/[0.01] md:p-6 md:rounded-[26px]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Bookmark className="h-4 w-4 text-primary" />{" "}
                  {t("userProfile.savedEvents")}
                </h2>
                {!savedEventsLoading && !savedQuery.error && savedEvents.length > 4 && (
                  <Link
                    href="/users/me/saved-events"
                    className="ml-1 inline-flex h-8 shrink-0 items-center rounded-full text-xs font-semibold text-primary transition-opacity hover:opacity-80"
                  >
                    {t("common.seeAll")}
                  </Link>
                )}
              </div>
              {Boolean(savedQuery.refreshError) && <RequestError onRetry={savedQuery.retry} className="mb-3" />}
              {savedEventsLoading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="h-20 animate-pulse border border-white/10 bg-white/[0.04]" />
                  <div className="h-20 animate-pulse border border-white/10 bg-white/[0.04]" />
                </div>
              ) : savedQuery.error ? (
                <RequestError onRetry={savedQuery.retry} />
              ) : savedEvents.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("userProfile.noSavedEvents")}
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {savedEvents.slice(0, 4).map((event) => (
                    <SavedEventCard key={event.id} event={event} />
                  ))}
                </div>
              )}
            </section>
            <section className="md:border md:border-white/5 md:bg-white/[0.01] md:p-6 md:rounded-[26px]">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {t("userProfile.ticketsOrders")}
                </h2>

                {/* TAB-URI CU ANIMAȚIE SLIDE & BADGE DE CONTRAST */}
                <div className="relative flex rounded-full border border-white/10 bg-white/5 p-1 md:hidden">
                  {/* TAB 1: ACTIVE */}
                  <button
                    type="button"
                    onClick={() => setTab("active")}
                    className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 z-10 ${
                      tab === "active"
                        ? "text-black"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    {tab === "active" && (
                      <motion.div
                        layoutId="activeTabPill"
                        className="absolute inset-0 rounded-full bg-primary"
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 30,
                        }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-1.5">
                      <Ticket className="h-3.5 w-3.5" />
                      {t("userProfile.active")}

                      {/* Badge cu contrast dinamic */}
                      <span
                        className={`ml-1 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold transition-all duration-200 ${
                          tab === "active"
                            ? "bg-black/90 text-primary" // Fundal inchis pe pastila verde neon
                            : "bg-primary/20 text-primary" // Fundal translucid cand tabul e inactiv
                        }`}
                      >
                        {activeTickets.length}
                      </span>
                    </span>
                  </button>

                  {/* TAB 2: HISTORY */}
                  <button
                    type="button"
                    onClick={() => setTab("history")}
                    className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 z-10 ${
                      tab === "history"
                        ? "text-black"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    {tab === "history" && (
                      <motion.div
                        layoutId="activeTabPill"
                        className="absolute inset-0 rounded-full bg-primary"
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 30,
                        }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-1.5">
                      <Receipt className="h-3.5 w-3.5" />
                      {t("userProfile.history")}
                    </span>
                  </button>
                </div>
              </div>

              {/* RENDER MOBIL */}
              {Boolean(ticketsQuery.refreshError) && <RequestError onRetry={ticketsQuery.retry} className="mb-3" />}
              <div className="md:hidden">
                {tab === "active" ? (
                  ticketsLoading ? (
                    <TicketStackSkeleton />
                  ) : ticketsQuery.error ? (
                    <RequestError onRetry={ticketsQuery.retry} />
                  ) : activeTicketGroups.length ? (
                    <>
                      <div data-nav-scroll="profile-saved-events" className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
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
                        className="mt-3 flex items-center justify-between border border-white/10 px-4 py-3 text-sm font-semibold transition hover:border-primary/50 rounded-[26px]"
                      >
                        <span>{t("userProfile.viewAllTickets")}</span>
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
                      className="flex items-center gap-3 border border-white/10 bg-white/[0.03] px-4 py-4 transition hover:border-primary/50 rounded-[26px]"
                    >
                      <span className="grid h-9 w-9 place-items-center bg-primary/10 text-primary rounded-2xl">
                        <Receipt className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                          {t("userProfile.viewInvoices")}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {t("userProfile.ordersPayments")}
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
                    <Ticket className="h-4 w-4" /> {ticketsLoading ? t("common.loading") : ticketsQuery.error ? t("tickets.title") : t("userProfile.activeTickets", { count: activeTickets.length })}
                  </h3>
                  {ticketsLoading ? (
                    <div className="grid grid-cols-2 gap-3">
                      <TicketStackSkeleton />
                      <TicketStackSkeleton />
                    </div>
                  ) : ticketsQuery.error ? (
                    <RequestError onRetry={ticketsQuery.retry} />
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
                        <span>{t("userProfile.viewAllTickets")}</span>
                        <ChevronRight className="h-4 w-4 text-primary" />
                      </Link>
                    </>
                  ) : (
                    <EmptyTickets />
                  )}
                </div>

                <div className="pt-2">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <Receipt className="h-4 w-4" />{" "}
                    {t("userProfile.orderHistory")}
                  </h3>
                  <Link
                    href="/users/me/invoices"
                    className="flex items-center gap-3 border border-white/10 bg-white/[0.03] px-4 py-4 transition hover:border-primary/50 rounded-lg"
                  >
                    <span className="grid h-9 w-9 place-items-center bg-primary/10 text-primary">
                      <Receipt className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        {t("userProfile.viewInvoices")}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {t("userProfile.ordersPayments")}
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
                  {t("userProfile.accountSecurity")}
                </h2>
                <div className="overflow-hidden rounded-[26px] border border-white/10 bg-white/5">
                  <Row
                    icon={User}
                    label={t("userProfile.personalDetails")}
                    hint={t("userProfile.personalDetailsHint")}
                    isOpen={activeRow === "details-mobile"}
                    onClick={() => toggleRow("details-mobile")}
                  >
                    <div className="pt-2">
                      <PersonalDetailsForm
                        user={user}
                        onSaved={updateSessionUser}
                      />
                    </div>
                  </Row>
                  <Row
                    icon={Lock}
                    label={t("userProfile.changePassword")}
                    isOpen={activeRow === "password-mobile"}
                    onClick={() => toggleRow("password-mobile")}
                  >
                    <div className="pt-2">
                      <PasswordResetRequest email={user.properties.email} />
                    </div>
                  </Row>
                  <LanguagePreferenceRow />
                  <AttendancePrivacyRow />
                  <Row
                    icon={Trash2}
                    label={t("userProfile.deleteAccount")}
                    danger
                    isOpen={activeRow === "delete-mobile"}
                    onClick={() => toggleRow("delete-mobile")}
                  >
                    <div className="pt-2 space-y-2">
                      <p className="text-xs text-red-400/80">
                        {t("userProfile.deleteShortWarning")}
                      </p>
                      <button className="w-full bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold py-2 rounded-xl">
                        {t("userProfile.confirmDelete")}
                      </button>
                    </div>
                  </Row>
                </div>
              </section>
            </div>

            <section>
              <h2 className="mb-3 text-lg font-semibold md:text-sm md:font-medium md:text-muted-foreground">
                {t("userProfile.supportLegal")}
              </h2>
              <div className="overflow-hidden rounded-[26px] border border-white/10 bg-white/5">
                <Row
                  icon={ChevronRight}
                  label={t("userProfile.helpSupport")}
                  hint={t("userProfile.helpHint")}
                  isOpen={activeRow === "help"}
                  onClick={() => toggleRow("help")}
                >
                  <p className="text-xs text-muted-foreground pt-2">
                    {t("userProfile.helpText")}
                  </p>
                </Row>
                <Row icon={ChevronRight} label={t("userProfile.terms")} onClick={() => router.push("/legal/terms")} />
                <Row icon={ChevronRight} label={t("userProfile.privacy")} onClick={() => router.push("/legal/privacy")} />
              </div>
            </section>

            <button
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/15 md:hidden"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" /> {t("userProfile.logout")}
            </button>

            <p className="text-center text-[10px] text-muted-foreground/60 md:text-left">
              SPOTTR · v1.0.0
            </p>
          </div>
        </div>
      </div>

      {openTicket && (
        <TicketPreview
          ticket={openTicket.source}
          onClose={() => setOpenTicket(null)}
        />
      )}
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
        onClick={onClick}
        disabled={!onClick}
        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition ${
          onClick
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
  const { t } = useTranslation();
  return (
    <div className="border border-dashed border-white/15 px-4 py-8 text-center">
      <Ticket className="mx-auto h-5 w-5 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">
        {used
          ? t("userProfile.noUsedTickets")
          : t("userProfile.noActiveTickets")}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {used
          ? t("userProfile.noUsedTicketsHint")
          : t("userProfile.noActiveTicketsHint")}
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
  const { t } = useTranslation();
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
          {t("userProfile.ticketCount", { count: tickets.length })}
        </span>
      </div>
      <div className="max-h-56 divide-y divide-white/10 overflow-y-auto overscroll-contain border-t border-white/10">
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
                {t("userProfile.ticketNumber", { count: index + 1 })}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
      <Link
        href={routeForPlatform(`/events/${event.eventId}/group`)}
        className="flex min-h-12 items-center gap-3 border-t border-white/10 px-4 py-3 text-left text-sm font-semibold text-emerald-300 transition hover:bg-emerald-400/[0.08]"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-400/[0.12]">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">{t("safetyGroup.openOrCreate")}</span>
        <ChevronRight className="h-4 w-4 shrink-0" />
      </Link>
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
