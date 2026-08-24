"use client";

import Link from "next/link";
import { Plus, Search, Calendar, MapPin, Ticket, Euro, Heart, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { User } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { formatEventDateShort } from "@/features/events/dateFormat";
import { useTranslation } from "react-i18next";
import { routeForPlatform } from "@/lib/native/navigation";
import { useEventDetails } from "@/components/EventDetailsSheet";

type Filter = "all" | "published" | "draft";

function EventRowSkeleton() {
  return (
    <div className="event-card flex items-center gap-4 border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <div className="h-16 w-16 shrink-0 animate-pulse bg-white/[0.07]" />
      <div className="min-w-0 flex-1 space-y-2"><div className="h-3 w-20 animate-pulse bg-white/[0.08]" /><div className="h-4 w-2/5 animate-pulse bg-white/[0.1]" /><div className="h-3 w-1/3 animate-pulse bg-white/[0.06]" /></div>
    </div>
  );
}

export default function EventsListPage() {
  const { t, i18n } = useTranslation();
  const { user } = useDataProvider();
  const { close: closeEventDetails } = useEventDetails();
  const { events, eventsLoading, eventsError } = User.useOrganizerEvents(user);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return (events || []).filter((e) => {
      if (filter === "published" && e.status !== "published") return false;
      if (filter === "draft" && e.status !== "draft") return false;
      if (q && !e.title.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [filter, q, events]);

  const filterOptions = [
    { id: "all", label: t("organizerEvents.all") },
    { id: "published", label: t("organizerEvents.published") },
    { id: "draft", label: t("organizerEvents.draft") },
  ] as const;

  return (
    <div className="w-full text-foreground">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-6 sm:pt-8 space-y-5 sm:space-y-6">
        {/* HEADER SECTION */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
              {t("dashboardNav.organizer")}
            </p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {t("organizerEvents.title")}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {(events || []).length} total ·{" "}
              {(events || []).filter((e) => e.status === "published").length}{" "}
              {t("organizerEvents.published")}
            </p>
          </div>

          <Link
            href="/dashboard/events/new"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-xs font-bold text-primary-foreground transition hover:opacity-90 active:scale-[0.98] shrink-0 w-full sm:w-auto shadow-sm"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            <span>{t("organizerEvents.newEvent")}</span>
          </Link>
        </div>

        {/* FILTERS & SEARCH BAR */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("organizerEvents.searchPlaceholder")}
              className="h-11 w-full rounded-2xl border border-white/10 bg-white/5 pl-10 pr-4 text-xs sm:text-sm outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/50 focus:bg-white/[0.08]"
            />
          </div>

          {/* SEGMENTED CONTROL */}
          <div className="relative flex h-11 w-full sm:w-auto items-center rounded-full border border-white/10 bg-white/5 p-1 shrink-0">
            {filterOptions.map((f) => {
              const isActive = filter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className="relative flex-1 sm:flex-none flex h-full items-center justify-center px-4 text-xs font-semibold transition-colors duration-200 z-10"
                  style={{
                    color: isActive
                      ? "var(--primary-foreground)"
                      : "var(--muted-foreground)",
                  }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeFilterBg"
                      className="absolute inset-0 rounded-full bg-primary"
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 30,
                      }}
                    />
                  )}
                  <span className="relative z-10">{f.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* EVENTS LIST */}
        <div className="space-y-4">
          {eventsLoading && (
            <div className="space-y-4"><EventRowSkeleton /><EventRowSkeleton /><EventRowSkeleton /></div>
          )}

          {!eventsLoading && eventsError && (
            <div className="border border-red-400/30 bg-red-400/[0.06] p-6 text-center"><p className="text-sm font-medium text-red-200">{t("organizerEvents.loadFailed")}</p><p className="mt-1 text-xs text-red-200/70">{t("organizerEvents.retryHint")}</p></div>
          )}

          {!eventsLoading && !eventsError && filtered.length === 0 && (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t("organizerEvents.noMatch")}
              </p>
            </div>
          )}

          {!eventsLoading && !eventsError && filtered.map((e) => {
            const soldTickets =
              e.stats?.totalTicketsSold ??
              (e.ticketTypes?.reduce(
                (sum, t) => sum + (t.ticketsSold ?? 0),
                0,
              ) || 0);
            const totalCapacity =
              e.ticketTypes?.reduce((sum, t) => sum + t.capacity, 0) || 0;
            const totalRevenue =
              e.stats?.totalRevenueRon ??
              (e.ticketTypes?.reduce(
                (sum, t) => sum + t.priceRon * (t.ticketsSold ?? 0),
                0,
              ) || 0);
            const fillPercentage =
              totalCapacity > 0
                ? Math.min(100, Math.round((soldTickets / totalCapacity) * 100))
                : 0;
            const interestedCount = e.stats?.interestedCount ?? 0;
            const goingCount = e.stats?.goingCount ?? 0;
            const ticketHolderCount = e.stats?.ticketHolderCount ?? 0;
            const manualGoing = Math.max(0, goingCount - ticketHolderCount);
            const attendanceCount = soldTickets + manualGoing;
            const estimatedMin = attendanceCount + Math.round(interestedCount * 0.15);
            const estimatedMax = attendanceCount + Math.round(interestedCount * 0.2);

            return (
              <Link
                key={e.id}
                href={routeForPlatform(`/dashboard/events/${e.id}`)}
                onClick={closeEventDetails}
                className="event-card group flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5 transition hover:border-white/20 hover:bg-white/[0.08] lg:grid lg:grid-cols-[minmax(0,1fr)_17.5rem_minmax(12rem,0.72fr)] lg:items-center lg:gap-5"
              >
                {/* Top Half on Mobile / Left Side on Desktop */}
                  <div className="flex min-w-0 items-start gap-3.5 sm:gap-4">
                  {/* Banner Image */}
                  <div className="relative h-16 w-16 sm:h-20 sm:w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10">
                    <img
                      src={e.bannerUrl}
                      alt={e.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>

                  {/* Info Details */}
                  <div className="min-w-0 flex-1 space-y-1 sm:space-y-1.5 pt-0.5">
                    {/* Status & Category Badge */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={
                          "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0 " +
                          (e.status === "published"
                            ? "bg-primary/15 text-primary"
                            : "bg-white/10 text-muted-foreground")
                        }
                      >
                        {e.status === "published" ? t("organizerEvents.published") : t("organizerEvents.draft")}
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                        {e.category}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="truncate text-base sm:text-lg font-bold text-foreground group-hover:text-primary transition-colors leading-snug">
                      {e.title}
                    </h3>

                    {/* Date & Location */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pt-0.5">
                      <span className="flex items-center gap-1.5 shrink-0">
                        <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                        {formatEventDateShort(e.startTime)}
                      </span>
                      <span className="flex items-center gap-1.5 truncate">
                        <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="truncate">{e.locationName}</span>
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 pt-3 text-[11px] text-muted-foreground lg:hidden">
                      <span className="inline-flex items-center gap-1"><UsersRound className="h-3.5 w-3.5 text-primary" /> {t("organizerEvents.going", { count: attendanceCount })}</span>
                      <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5 text-primary" /> {t("organizerEvents.interested", { count: interestedCount })}</span>
                      <span>{t("organizerEvents.estimate", { min: estimatedMin, max: estimatedMax })}</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Half on Mobile / Right Side on Desktop */}
                <div className="grid w-full grid-cols-2 gap-2.5 border-t border-white/10 pt-4 sm:gap-3 lg:border-t-0 lg:pt-0">
                  {/* Tickets Pill */}
                  <div className="flex min-w-0 flex-col justify-between rounded-lg border border-white/10 bg-black/10 p-3 space-y-2">
                    <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                      <span className="flex items-center gap-1.5 truncate">
                        <Ticket className="h-3 w-3 text-primary shrink-0" />
                        {t("organizerEvents.tickets")}
                      </span>
                      <span className="ml-1">{fillPercentage}%</span>
                    </div>
                    <p className="text-xs sm:text-sm font-bold text-foreground">
                      {soldTickets}{" "}
                      <span className="text-muted-foreground font-normal text-xs">
                        / {totalCapacity}
                      </span>
                    </p>
                    <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${fillPercentage}%` }}
                      />
                    </div>
                  </div>

                  {/* Revenue Pill */}
                  <div className="flex min-w-0 flex-col justify-between rounded-lg border border-white/10 bg-black/10 p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                      <Euro className="h-3 w-3 text-primary shrink-0" />
                      {t("organizerEvents.revenue")}
                    </div>
                    <p className="text-xs sm:text-sm font-bold text-primary">
                      {totalRevenue.toLocaleString(i18n.language === "ro" ? "ro-RO" : "en-GB")} RON
                    </p>
                    <span className="text-[9px] text-muted-foreground truncate">
                      {t("organizerEvents.totalCollected")}
                    </span>
                  </div>
                </div>

                <div className="hidden border-l border-white/10 pl-5 text-[11px] text-muted-foreground lg:flex lg:min-w-0 lg:flex-col lg:justify-center lg:gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">{t("organizerEvents.audience")}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="inline-flex items-center gap-1 font-medium text-foreground"><UsersRound className="h-3.5 w-3.5 text-primary" /> {t("organizerEvents.going", { count: attendanceCount })}</span>
                    <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5 text-primary" /> {t("organizerEvents.interested", { count: interestedCount })}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{t("organizerEvents.estimate", { min: estimatedMin, max: estimatedMax })}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
