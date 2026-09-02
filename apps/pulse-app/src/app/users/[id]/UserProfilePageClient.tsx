"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, BadgeCheck, Calendar, ChevronLeft, ChevronRight, MapPin, Share2, Ticket, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ApiClient, type ReadableSchema } from "@packages/api-client/src/Client";
import { Event, PublicEventsService } from "@/core/DataProvider";
import { EventOrganizerUpdates } from "@/components/EventOrganizerUpdates";
import { ProfileActions } from "@/components/social/ProfileActions";
import { useEventDetails } from "@/components/EventDetailsSheet";
import { formatEventDateShort, formatEventTime } from "@/features/events/dateFormat";

type PublicProfile = ReadableSchema<"PublicProfileResponse">;

export default function PublicProfilePage() {
  const { t } = useTranslation();
  const { id: routeId } = useParams<{ id?: string }>();
  const [queryId, setQueryId] = useState("");
  const id = routeId ?? queryId;
  const { open: openEventDetails } = useEventDetails();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [organizerEvents, setOrganizerEvents] = useState<Event[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [eventsFailed, setEventsFailed] = useState(false);
  const [returnTo, setReturnTo] = useState("/feed");

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("returnTo");
    setReturnTo(value?.startsWith("/") && !value.startsWith("//") ? value : "/feed");
    setQueryId(new URLSearchParams(window.location.search).get("userId") ?? "");
  }, []);

  useEffect(() => {
    let mounted = true;

    if (!id) return;

    setLoaded(false);
    setProfile(null);
    ApiClient.instance
      .get("/profiles/{id}", { params: { path: { id } } })
      .then((data) => mounted && setProfile(data as PublicProfile))
      .catch(() => mounted && setProfile(null))
      .finally(() => mounted && setLoaded(true));

    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    if (profile?.role !== "organizer") {
      setOrganizerEvents([]);
      setEventsLoaded(Boolean(profile));
      setEventsFailed(false);
      return;
    }

    let mounted = true;
    setEventsLoaded(false);
    setEventsFailed(false);

    PublicEventsService.getPublicEvents({ organizerId: profile.id })
      .then((events) => mounted && setOrganizerEvents(events))
      .catch(() => {
        if (!mounted) return;
        setOrganizerEvents([]);
        setEventsFailed(true);
      })
      .finally(() => mounted && setEventsLoaded(true));

    return () => {
      mounted = false;
    };
  }, [profile?.id, profile?.role]);

  const { upcomingEvents, pastEvents } = useMemo(() => {
    const now = Date.now();
    const sorted = [...organizerEvents].sort(
      (left, right) =>
        new Date(right.startTime).getTime() - new Date(left.startTime).getTime(),
    );

    return {
      upcomingEvents: sorted
        .filter((event) => new Date(event.endTime).getTime() > now)
        .reverse(),
      pastEvents: sorted.filter(
        (event) => new Date(event.endTime).getTime() <= now,
      ),
    };
  }, [organizerEvents]);

  if (!loaded) {
    return (
      <main className="app-page-spacing min-h-screen bg-background text-foreground">
        <div className="h-40 max-w-xl animate-pulse rounded-3xl border border-white/10 bg-white/[0.035]" />
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="app-page-spacing min-h-screen bg-background text-foreground">
        <Link
          href={returnTo}
          className="inline-flex h-9 items-center gap-2 text-xs font-semibold text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t("common.back")}
        </Link>
        <p className="mt-8 text-sm text-muted-foreground">
          {t("publicProfile.unavailable")}
        </p>
      </main>
    );
  }

  const isOrganizer = profile.role === "organizer";
  const name = isOrganizer ? profile.organizerName || profile.username : profile.username;
  const socialHint = isOrganizer
    ? t("publicProfile.followHint")
    : profile.relationship === "friends"
      ? t("publicProfile.connected")
      : t("publicProfile.connectHint");

  if (isOrganizer) {
    return (
      <OrganizerProfilePage
        profile={profile}
        returnTo={returnTo}
        upcomingEvents={upcomingEvents}
        pastEvents={pastEvents}
        eventsLoaded={eventsLoaded}
        eventsFailed={eventsFailed}
        onProfileChange={(update) =>
          setProfile((current) => current ? { ...current, ...update } : current)
        }
        onSelectEvent={openEventDetails}
      />
    );
  }

  return (
    <main className="app-page-spacing mx-auto min-h-screen max-w-2xl text-foreground">
      <Link
        href={returnTo}
        className="inline-flex h-9 items-center gap-2 text-xs font-semibold text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("common.back")}
      </Link>

      <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-7">
        <div className="flex items-start gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-primary/35 bg-primary/10 text-xl font-semibold text-primary">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              profile.username.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold">{name}</h1>
              {profile.organizerVerified && (
                <BadgeCheck className="h-5 w-5 text-primary" />
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              @{profile.username}
              {isOrganizer
                ? ` . ${t("publicProfile.followers", { count: profile.followerCount })}`
                : ""}
            </p>
          </div>
          <ProfileActions
            profile={profile}
            onChange={(update) =>
              setProfile((current) =>
                current ? { ...current, ...update } : current,
              )
            }
          />
        </div>
        {profile.bio && (
          <p className="mt-5 max-w-xl whitespace-pre-line text-sm leading-6 text-muted-foreground">
            {profile.bio}
          </p>
        )}
        <div className="mt-6 flex items-center gap-2 border-t border-white/10 pt-4 text-xs text-muted-foreground">
          <UsersRound className="h-4 w-4 text-primary" />
          {socialHint}
        </div>
        {isOrganizer && (
          <div className="mt-4 grid grid-cols-2 divide-x divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-black/10">
            <div className="flex items-center gap-2.5 p-3">
              <Calendar className="h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold">{profile.eventCount}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t("publicProfile.eventsOrganized", { count: profile.eventCount })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 p-3">
              <Ticket className="h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold">{profile.ticketsSoldCount}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t("publicProfile.ticketsSold", { count: profile.ticketsSoldCount })}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {isOrganizer && (
        <div className="mt-10 space-y-10">
          <EventOrganizerUpdates organizerId={profile.id} />
          <OrganizerEventSection
            title={t("publicProfile.upcomingEvents")}
            emptyLabel={t("publicProfile.noUpcomingEvents")}
            events={upcomingEvents}
            loading={!eventsLoaded}
            onSelect={openEventDetails}
          />
          <OrganizerEventSection
            title={t("publicProfile.pastEvents")}
            emptyLabel={
              eventsFailed
                ? t("publicProfile.eventsLoadFailed")
                : t("publicProfile.noPastEvents")
            }
            events={pastEvents}
            loading={!eventsLoaded}
            completed
            onSelect={openEventDetails}
          />
        </div>
      )}
    </main>
  );
}

function OrganizerProfilePage({
  profile,
  returnTo,
  upcomingEvents,
  pastEvents,
  eventsLoaded,
  eventsFailed,
  onProfileChange,
  onSelectEvent,
}: {
  profile: PublicProfile;
  returnTo: string;
  upcomingEvents: Event[];
  pastEvents: Event[];
  eventsLoaded: boolean;
  eventsFailed: boolean;
  onProfileChange: (update: Partial<PublicProfile>) => void;
  onSelectEvent: (event: Event) => void;
}) {
  const { t } = useTranslation();
  const featuredEvent = upcomingEvents[0] ?? pastEvents[0];
  const heroImage = featuredEvent?.bannerUrl || profile.avatarUrl;
  const location = featuredEvent?.locationName;

  const shareProfile = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: profile.organizerName || profile.username, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(url).catch(() => undefined);
  };

  return (
    <main className="min-h-screen bg-[#080908] pb-32 text-foreground">
      <section className="relative min-h-[31rem] overflow-hidden md:min-h-[36rem]">
        {heroImage ? (
          <>
            <img src={heroImage} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-55 blur-2xl" />
            <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover md:object-contain" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(255,0,68,0.25),transparent_45%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/10 to-[#080908]" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent" />

        <div className="app-page-gutter relative mx-auto flex max-w-6xl items-center justify-between pt-[max(1.5rem,var(--native-safe-top))]">
          <Link href={returnTo} aria-label={t("common.back")} className="grid h-12 w-12 place-items-center rounded-full border border-white/20 bg-black/35 text-white backdrop-blur-md transition hover:bg-black/55 active:scale-95">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <button type="button" onClick={() => void shareProfile()} aria-label={t("publicProfile.share")} className="grid h-12 w-12 place-items-center rounded-full border border-white/20 bg-black/35 text-white backdrop-blur-md transition hover:bg-black/55 active:scale-95">
            <Share2 className="h-5 w-5" />
          </button>
        </div>

        <div className="app-page-gutter absolute inset-x-0 bottom-5 mx-auto max-w-6xl md:bottom-8">
          <div className="md:flex md:items-end md:justify-between md:gap-8">
            <div className="flex min-w-0 items-end gap-3 sm:gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/25 bg-black/45 text-xl font-black shadow-2xl backdrop-blur-md sm:h-20 sm:w-20 md:h-24 md:w-24 md:text-2xl">
                {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : profile.username.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 pb-1">
                {location && <p className="mb-1.5 truncate text-[10px] font-bold uppercase tracking-[0.16em] text-primary sm:mb-2 sm:text-[11px] md:text-xs">{location}</p>}
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="min-w-0 truncate text-[clamp(1.65rem,8vw,2.5rem)] font-black leading-none tracking-tight text-white md:text-5xl">{profile.organizerName || profile.username}</h1>
                  {profile.organizerVerified && <BadgeCheck className="h-5 w-5 shrink-0 text-primary md:h-7 md:w-7" />}
                </div>
                <p className="mt-1.5 truncate text-xs text-white/65 sm:text-sm">@{profile.username} · {t("publicProfile.followers", { count: profile.followerCount })}</p>
              </div>
            </div>
            <div className="hidden w-[32rem] shrink-0 md:block">
              <OrganizerActionBar profile={profile} onProfileChange={onProfileChange} />
            </div>
          </div>
        </div>
      </section>

      <div className="app-page-gutter mx-auto max-w-6xl">
        <div className="md:hidden">
          <OrganizerActionBar profile={profile} onProfileChange={onProfileChange} />
        </div>

        <div className="mt-12 space-y-14">
          <PosterEventSection title={t("publicProfile.upcomingEvents")} events={upcomingEvents} loading={!eventsLoaded} emptyLabel={t("publicProfile.noUpcomingEvents")} onSelect={onSelectEvent} />
          <EventOrganizerUpdates organizerId={profile.id} />

          <section>
            <h2 className="text-2xl font-bold tracking-tight">{t("publicProfile.aboutOrganizer")}</h2>
            {profile.bio ? <p className="mt-5 max-w-2xl whitespace-pre-line text-sm leading-7 text-white/65">{profile.bio}</p> : <p className="mt-5 text-sm text-muted-foreground">{t("publicProfile.noBio")}</p>}
          </section>

          <PosterEventSection title={t("publicProfile.pastEvents")} events={pastEvents} loading={!eventsLoaded} emptyLabel={eventsFailed ? t("publicProfile.eventsLoadFailed") : t("publicProfile.noPastEvents")} onSelect={onSelectEvent} completed />
        </div>
      </div>
    </main>
  );
}

function PosterEventSection({ title, events, loading, emptyLabel, completed = false, onSelect }: { title: string; events: Event[]; loading: boolean; emptyLabel: string; completed?: boolean; onSelect: (event: Event) => void }) {
  const { t } = useTranslation();
  const railRef = useRef<HTMLDivElement>(null);
  const scroll = (direction: -1 | 1) => {
    railRef.current?.scrollBy({ left: direction * 560, behavior: "smooth" });
  };

  return (
    <section>
      <div className="flex items-end justify-between">
        <h2 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h2>
        {!loading && <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-primary">{events.length}</span>
          {events.length > 1 && <div className="hidden items-center gap-1 md:flex">
            <button type="button" onClick={() => scroll(-1)} aria-label={`${t("common.back")} ${title}`} title={t("common.back")} className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-muted-foreground transition hover:border-white/20 hover:bg-white/[0.08] hover:text-foreground"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => scroll(1)} aria-label={`${t("common.next")} ${title}`} title={t("common.next")} className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-muted-foreground transition hover:border-white/20 hover:bg-white/[0.08] hover:text-foreground"><ChevronRight className="h-4 w-4" /></button>
          </div>}
        </div>}
      </div>
      {loading ? (
        <div className="mt-5 flex gap-4 overflow-hidden">{[0, 1, 2].map((item) => <div key={item} className="aspect-[3/4] w-40 shrink-0 animate-pulse rounded-2xl bg-white/[0.05] md:w-52" />)}</div>
      ) : events.length ? (
        <div ref={railRef} className="-mx-5 mt-5 flex snap-x gap-4 overflow-x-auto scroll-smooth px-5 pb-3 [scrollbar-width:none] sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden">
          {events.map((event) => (
            <button key={event.id} type="button" onClick={() => onSelect(event)} className="group w-40 shrink-0 snap-start text-left md:w-52">
              <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-white/[0.05]">
                {event.bannerUrl ? <img src={event.bannerUrl} alt="" className={`h-full w-full object-cover transition duration-500 group-hover:scale-105 ${completed ? "opacity-75" : ""}`} /> : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                <span className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/50 opacity-0 backdrop-blur transition group-hover:opacity-100"><ArrowUpRight className="h-4 w-4" /></span>
              </div>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-white/45">{formatEventDateShort(event.startTime)} · {formatEventTime(event.startTime)}</p>
              <h3 className="mt-1 truncate text-sm font-bold md:text-base">{event.title}</h3>
            </button>
          ))}
        </div>
      ) : <p className="mt-5 text-sm text-muted-foreground">{emptyLabel}</p>}
    </section>
  );
}

function StatPill({ icon: Icon, value, label }: { icon: React.ComponentType<{ className?: string }>; value: number; label: string }) {
  return <div className="flex h-14 items-center justify-center gap-2 rounded-full bg-white/[0.06] px-2 sm:h-16"><Icon className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><p className="text-sm font-bold leading-none sm:text-base">{value}</p><p className="mt-1 truncate text-[10px] text-muted-foreground sm:text-xs">{label}</p></div></div>;
}

function OrganizerActionBar({ profile, onProfileChange }: { profile: PublicProfile; onProfileChange: (update: Partial<PublicProfile>) => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <div className="[&>a]:h-14 [&>a]:w-full [&>a]:justify-center [&>a]:border-white/10 [&>a]:bg-white/[0.06] [&>a]:px-2 [&>button]:h-14 [&>button]:w-full [&>button]:justify-center [&>button]:border-white/10 [&>button]:bg-white/[0.06] [&>button]:px-2 sm:[&>a]:h-16 sm:[&>button]:h-16">
        <ProfileActions profile={profile} onChange={onProfileChange} />
      </div>
      <StatPill icon={Calendar} value={profile.eventCount} label={t("publicProfile.eventsShort")} />
      <StatPill icon={Ticket} value={profile.ticketsSoldCount} label={t("publicProfile.ticketsShort")} />
    </div>
  );
}

function OrganizerEventSection({
  title,
  emptyLabel,
  events,
  loading,
  completed = false,
  onSelect,
}: {
  title: string;
  emptyLabel: string;
  events: Event[];
  loading: boolean;
  completed?: boolean;
  onSelect: (event: Event) => void;
}) {
  const { t } = useTranslation();

  return (
    <section>
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {!loading && <span className="text-xs text-muted-foreground">{events.length}</span>}
      </div>
      {loading ? (
        <div className="mt-3 space-y-2">
          {[0, 1].map((index) => (
            <div
              key={index}
              className="h-20 animate-pulse rounded-2xl border border-white/10 bg-white/[0.035]"
            />
          ))}
        </div>
      ) : events.length ? (
        <div className="mt-3 space-y-2">
          {events.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => onSelect(event)}
              className="group flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-3 text-left transition hover:border-primary/35 hover:bg-white/[0.05]"
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface">
                {event.bannerUrl ? (
                  <img
                    src={event.bannerUrl}
                    alt=""
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">{event.title}</p>
                  {completed && (
                    <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {t("publicProfile.eventCompleted")}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    {formatEventDateShort(event.startTime)}
                  </span>
                  {event.locationName && (
                    <span className="inline-flex max-w-[12rem] items-center gap-1 truncate">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate">{event.locationName}</span>
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="pt-4 text-sm text-muted-foreground">{emptyLabel}</p>
      )}
    </section>
  );
}
