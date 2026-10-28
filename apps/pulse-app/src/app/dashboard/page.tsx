"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  Calendar,
  MapPin,
  Megaphone,
  Plus,
  ScanLine,
  Ticket,
} from "lucide-react";
import { type Event, User } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import {
  formatEventDateShort,
  formatEventTime,
} from "@/features/events/dateFormat";
import { useTranslation } from "react-i18next";
import { routeForPlatform } from "@/lib/native/navigation";
import { useEventDetails } from "@/components/EventDetailsSheet";
import { useRouter } from "next/navigation";
import {
  dashboardTicketCounts,
  isDashboardEventLive,
  selectDashboardEvent,
} from "@/features/events/dashboardFeatured";
import { dashboardEventGroups } from "@/features/events/dashboardEvents";
import { useDashboardClock } from "@/features/events/useDashboardClock";
import { startVisiblePolling } from "@/lib/visiblePolling";

export default function OrganizerDashboard() {
  const router = useRouter();
  const { user } = useDataProvider();
  const { close: closeEventDetails } = useEventDetails();
  const { t } = useTranslation();
  const { events, eventsLoading, refreshEvents } =
    User.useOrganizerEvents(user);
  const now = useDashboardClock(events);
  useEffect(() => {
    if (!user) return;
    return startVisiblePolling(refreshEvents, 15_000);
  }, [user, refreshEvents]);
  useEffect(() => {
    const action = new URLSearchParams(window.location.search).get("stripe");
    if (action)
      router.replace("/dashboard/finance?stripe=" + encodeURIComponent(action));
  }, [router]);
  const { upcoming: upcomingEvents, past: recentEvents } = dashboardEventGroups(
    events,
    now,
  );
  const upcomingEvent = selectDashboardEvent(events, now);
  const live = upcomingEvent ? isDashboardEventLive(upcomingEvent, now) : false;
  const counts = dashboardTicketCounts(upcomingEvent ?? {});

  return (
    <main className="text-foreground pb-[110px]">
      <div className="app-page-spacing mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold sm:text-3xl">
              {t("dashboard.account")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("dashboard.overview")}
            </p>
          </div>
          <div className="flex items-center gap-2"></div>
        </header>

        {eventsLoading ? (
          <div className="h-44 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
        ) : upcomingEvent ? (
          <Link
            data-testid="dashboard-featured-event"
            href={routeForPlatform(`/dashboard/events/${upcomingEvent.id}`)}
            onClick={closeEventDetails}
            className="group relative isolate block min-h-44 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
          >
            {upcomingEvent.bannerUrl && (
              <img
                src={upcomingEvent.bannerUrl}
                alt=""
                className="absolute inset-0 -z-20 h-full w-full object-cover transition duration-500 group-hover:scale-105"
              />
            )}
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/85 to-black/45" />
            <div className="flex min-h-44 flex-col justify-end p-5 sm:p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
                {t(live ? "dashboard.liveEvent" : "dashboard.nextEvent")}
              </p>
              <h2 className="mt-2 text-xl font-bold sm:text-2xl">
                {upcomingEvent.title}
              </h2>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/75">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  {formatEventDateShort(upcomingEvent.startTime)}
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  {upcomingEvent.locationName}
                </span>
              </div>
              {(counts.sold !== undefined || counts.scanned !== undefined) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {(
                    [
                      {
                        key: "sold",
                        value: counts.sold,
                        label: "dashboard.ticketsSold",
                        Icon: Ticket,
                        color: "text-primary",
                      },
                      {
                        key: "scanned",
                        value: counts.scanned,
                        label: "dashboard.ticketsScanned",
                        Icon: ScanLine,
                        color: "text-emerald-400",
                      },
                    ] as const
                  ).map(
                    ({ key, value, label, Icon, color }) =>
                      value !== undefined && (
                        <span
                          key={key}
                          data-testid={`dashboard-featured-${key}`}
                          className="flex items-center gap-[7px] rounded-full border border-white/10 bg-black/50 px-3 py-[7px] text-[13px] leading-[18px] text-white/75"
                        >
                          <Icon className={`h-3.5 w-3.5 ${color}`} />
                          <span>
                            <strong className="font-bold text-white">
                              {value.toLocaleString()}
                            </strong>{" "}
                            {t(label)}
                          </span>
                        </span>
                      ),
                  )}
                </div>
              )}
            </div>
          </Link>
        ) : null}
        <div className="w-full flex gap-3 justify-between">
          <Link
            href="/dashboard/events/new"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            {t("dashboardNav.newEvent")}
          </Link>
          <Link
            href="/dashboard/promotions"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-primary transition hover:opacity-90"
          >
            <Megaphone className="h-4 w-4" /> {t("dashboardNav.newPromotion")}
          </Link>
        </div>
        <section className="border-t border-white/10 pt-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {t("dashboard.nextEvents")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("dashboard.nextEventsHint")}
              </p>
            </div>
            {upcomingEvents.length > 4 && (
              <Link
                href="/dashboard/events?filter=upcoming"
                data-testid="dashboard-see-all-upcoming"
                className="text-xs font-semibold text-primary transition hover:opacity-80"
              >
                {t("common.seeAll")}
              </Link>
            )}
          </div>
          {eventsLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="h-24 animate-pulse rounded-lg border border-white/10 bg-white/5" />
              <div className="h-24 animate-pulse rounded-lg border border-white/10 bg-white/5" />
            </div>
          ) : upcomingEvents.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {upcomingEvents.slice(0, 4).map((event) => (
                <DashboardEventCard
                  key={event.id}
                  event={event}
                  onOpen={closeEventDetails}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-white/15 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {t("dashboard.noUpcomingEvents")}
              </p>
              <Link
                href="/dashboard/events/new"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/35 px-3 text-xs font-semibold text-primary transition hover:bg-primary/10"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("dashboard.addEvent")}
              </Link>
            </div>
          )}
        </section>

        <section className="border-t border-white/10 pt-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {t("dashboard.recentEvents")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("dashboard.recentEventsHint")}
              </p>
            </div>
            {recentEvents.length > 2 && (
              <Link
                href="/dashboard/events?filter=completed"
                data-testid="dashboard-see-all-completed"
                className="text-xs font-semibold text-primary transition hover:opacity-80"
              >
                {t("common.seeAll")}
              </Link>
            )}
          </div>
          {eventsLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="h-24 animate-pulse rounded-lg border border-white/10 bg-white/5" />
              <div className="h-24 animate-pulse rounded-lg border border-white/10 bg-white/5" />
            </div>
          ) : recentEvents.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {recentEvents.slice(0, 2).map((event) => (
                <DashboardEventCard
                  key={event.id}
                  event={event}
                  onOpen={closeEventDetails}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-white/15 p-5 text-sm text-muted-foreground">
              {t("dashboard.noRecentEvents")}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function DashboardEventCard({
  event,
  onOpen,
}: {
  event: Event;
  onOpen: () => void;
}) {
  return (
    <Link
      href={routeForPlatform(`/dashboard/events/${event.id}`)}
      onClick={onOpen}
      className="group flex min-w-0 items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 transition hover:border-white/20 hover:bg-white/[0.06]"
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-white/5">
        {event.bannerUrl && (
          <img
            src={event.bannerUrl}
            alt=""
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold group-hover:text-primary">
          {event.title}
        </p>
        <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <Calendar className="h-3 w-3 shrink-0" />
          {formatEventDateShort(event.startTime)} ·{" "}
          {formatEventTime(event.startTime)}
        </p>
        <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          {event.locationName}
        </p>
      </div>
    </Link>
  );
}
