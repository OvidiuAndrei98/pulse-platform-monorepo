"use client";

import { BackLink } from "@/components/BackLink";
import { safeInternalPath } from "@/lib/navigation/state";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BadgeCheck, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ApiClient, type ReadableSchema } from "@packages/api-client/src/Client";
import { Event, PublicEventsService } from "@/core/DataProvider";
import { OrganizerProfile } from "@/components/social/OrganizerProfile";
import { ProfileActions } from "@/components/social/ProfileActions";

type PublicProfile = ReadableSchema<"PublicProfileResponse">;

export default function PublicProfilePage() {
  const { t } = useTranslation();
  const { id: routeId } = useParams<{ id?: string }>();
  const [queryId, setQueryId] = useState("");
  const id = routeId ?? queryId;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [organizerEvents, setOrganizerEvents] = useState<Event[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [eventsFailed, setEventsFailed] = useState(false);
  const [eventsAttempt, setEventsAttempt] = useState(0);
  const [returnTo, setReturnTo] = useState("/feed");

  useEffect(() => {
    const update = () => {
    const value = new URLSearchParams(window.location.search).get("returnTo");
    setReturnTo(safeInternalPath(value, "/feed"));
    setQueryId(new URLSearchParams(window.location.search).get("userId") ?? "");
    };
    update();
    window.addEventListener("popstate", update);
    window.addEventListener("spottr:navigation", update);
    return () => { window.removeEventListener("popstate", update); window.removeEventListener("spottr:navigation", update); };
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
  }, [profile?.id, profile?.role, eventsAttempt]);

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
        <BackLink
          href={returnTo}
          className="inline-flex h-9 items-center gap-2 text-xs font-semibold text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t("common.back")}
        </BackLink>
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
      <OrganizerProfile
        profile={profile}
        returnTo={returnTo}
        upcomingEvents={upcomingEvents}
        pastEvents={pastEvents}
        eventsLoaded={eventsLoaded}
        eventsFailed={eventsFailed}
        onProfileChange={(update) =>
          setProfile((current) => current ? { ...current, ...update } : current)
        }
        onRetryEvents={() => setEventsAttempt((value) => value + 1)}
      />
    );
  }

  return (
    <main className="app-page-spacing mx-auto min-h-screen max-w-2xl text-foreground">
      <BackLink
        href={returnTo}
        className="inline-flex h-9 items-center gap-2 text-xs font-semibold text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("common.back")}
      </BackLink>

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

      </section>


    </main>
  );
}
