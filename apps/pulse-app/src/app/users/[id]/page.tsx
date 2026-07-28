"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BadgeCheck, Calendar, MapPin, Ticket, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ApiClient, type ReadableSchema } from "@packages/api-client/src/Client";
import { Event, PublicEventsService } from "@/core/DataProvider";
import { EventOrganizerUpdates } from "@/components/EventOrganizerUpdates";
import { ProfileActions } from "@/components/social/ProfileActions";
import { useEventDetails } from "@/components/EventDetailsSheet";
import { formatEventDateShort } from "@/features/events/dateFormat";

type PublicProfile = ReadableSchema<"PublicProfileResponse">;

export default function PublicProfilePage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
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
  }, []);

  useEffect(() => {
    let mounted = true;

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
      <main className="min-h-screen bg-background px-5 pt-12 text-foreground">
        <div className="h-40 max-w-xl animate-pulse rounded-3xl border border-white/10 bg-white/[0.035]" />
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-background px-5 pt-12 text-foreground">
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

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 pb-32 pt-10 text-foreground sm:px-7">
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
