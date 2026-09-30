"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeCheck, ChevronLeft, ChevronRight, Info, Share2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PublicProfile, Event } from "@/core/DataProvider";
import { BackLink } from "@/components/BackLink";
import { EventOrganizerUpdates } from "@/components/EventOrganizerUpdates";
import { ProfileActions } from "@/components/social/ProfileActions";
import { EventBrowseCard } from "@/features/events/components/EventBrowseCard";
import { EventCardSkeleton } from "@/components/ui/loading";
import { RequestError } from "@/components/ui/RequestFeedback";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";

export function OrganizerProfile({ profile, returnTo, upcomingEvents, pastEvents, eventsLoaded, eventsFailed, onProfileChange, onRetryEvents }: {
  profile: PublicProfile;
  returnTo: string;
  upcomingEvents: Event[];
  pastEvents: Event[];
  eventsLoaded: boolean;
  eventsFailed: boolean;
  onProfileChange: (update: Partial<PublicProfile>) => void;
  onRetryEvents: () => void;
}) {
  const { t } = useTranslation();
  const [informationOpen, setInformationOpen] = useState(false);
  const name = profile.organizerName || profile.username;
  const heroImage = [...upcomingEvents, ...pastEvents].find(event => event.bannerUrl)?.bannerUrl || profile.avatarUrl;

  const shareProfile = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: name, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(url).catch(() => undefined);
  };

  return (
    <Drawer open={informationOpen} onOpenChange={setInformationOpen} shouldScaleBackground={false}>
    <main data-organizer-profile className="min-h-screen bg-[#050505] pb-32 text-foreground">
      <header className="relative isolate flex min-h-[22rem] flex-col justify-between overflow-hidden md:min-h-[30rem]">
        {heroImage ? (
          <img src={heroImage} alt="" fetchPriority="high" className="absolute inset-0 -z-20 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_at_65%_10%,rgba(225,29,72,0.28),transparent_70%)]" />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/25 via-black/10 to-[#050505]" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-gradient-to-t from-[#050505] via-[#050505]/50 to-transparent" />

        <div className="app-page-gutter mx-auto flex w-full max-w-6xl items-center justify-between pt-[max(1.25rem,var(--native-safe-top))] md:pt-8">
          <BackLink href={returnTo} aria-label={t("common.back")} className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-white/15 bg-white/[0.06] text-foreground transform-gpu focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            <X className="h-4 w-4" strokeWidth={2.2} />
          </BackLink>
          <button type="button" onClick={() => void shareProfile()} aria-label={t("publicProfile.share")} className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-white/15 bg-white/[0.06] text-foreground transform-gpu focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            <Share2 className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>

        <div className="app-page-gutter mx-auto w-full max-w-6xl pb-5 pt-24 md:pb-8">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">@{profile.username}</p>
          <div className="flex items-center gap-3">
            <h1 className="min-w-0 max-w-4xl break-words text-[clamp(2rem,8vw,3rem)] font-bold leading-[1.05] tracking-tight md:text-6xl">{name}</h1>
            {profile.organizerVerified && <BadgeCheck aria-label={t("publicProfile.verifiedOrganizer")} className="h-6 w-6 shrink-0 text-primary md:h-8 md:w-8" />}
          </div>
        </div>
      </header>

      <div className="app-page-gutter mx-auto max-w-6xl">
        <div className={`grid gap-3 pt-3 md:max-w-lg ${profile.relationship === "self" ? "grid-cols-1" : "grid-cols-2"}`}>
          <DrawerTrigger asChild><button type="button" className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/5 bg-white/[0.06] text-sm font-semibold transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            <Info className="h-4 w-4 text-white/65" /> {t("publicProfile.info")}
          </button></DrawerTrigger>
          {profile.relationship !== "self" && <div className="[&>a]:h-12 [&>a]:w-full [&>a]:justify-center [&>a]:border-white/5 [&>a]:bg-white/[0.06] [&>a]:text-sm [&>button]:h-12 [&>button]:w-full [&>button]:justify-center [&>button]:text-sm">
            <ProfileActions profile={profile} onChange={onProfileChange} />
          </div>}
        </div>

        <div className="mt-9 space-y-10 md:mt-12 md:space-y-14">
          <OrganizerEvents organizerId={profile.id} kind="upcoming" title={t("publicProfile.upcomingEvents")} events={upcomingEvents} loading={!eventsLoaded} failed={eventsFailed} onRetry={onRetryEvents} emptyLabel={t("publicProfile.noUpcomingEvents")} />

          <OrganizerStats profile={profile} />

          <OrganizerEvents organizerId={profile.id} kind="past" title={t("publicProfile.pastEvents")} events={pastEvents} loading={!eventsLoaded} failed={eventsFailed} onRetry={onRetryEvents} emptyLabel={t("publicProfile.noPastEvents")} />
          <EventOrganizerUpdates organizerId={profile.id} />
        </div>
      </div>
    </main>
    <DrawerContent data-organizer-info className="mx-auto max-h-[85svh] max-w-xl rounded-t-4xl border-white/10 bg-black">
      <DrawerHeader className="relative shrink-0 px-6 pb-5 pt-5 text-left">
        <DrawerTitle className="pr-12 text-xl tracking-tight">{t("publicProfile.aboutOrganizer")}</DrawerTitle>
        <DrawerDescription>@{profile.username}</DrawerDescription>
        <DrawerClose aria-label={t("common.close")} className="absolute right-5 top-4 grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-primary">
          <X className="h-4 w-4" />
        </DrawerClose>
      </DrawerHeader>
      <div className="min-h-0 overflow-y-auto overscroll-y-contain px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3 py-3">
          {profile.avatarUrl && <img src={profile.avatarUrl} alt="" className="h-14 w-14 shrink-0 rounded-full border border-white/10 object-cover" />}
          <h3 className="min-w-0 break-words text-xl font-semibold">{name}</h3>
          {profile.organizerVerified && <BadgeCheck aria-label={t("publicProfile.verifiedOrganizer")} className="h-5 w-5 shrink-0 text-primary" />}
        </div>
        <p className="mb-6 mt-3 whitespace-pre-line break-words text-sm leading-7 text-muted-foreground">{profile.bio || t("publicProfile.noBio")}</p>
        <OrganizerStats profile={profile} />
        <p className="mt-5 text-sm text-muted-foreground"><span className="font-semibold tabular-nums text-foreground">{profile.eventCount}</span> {t("publicProfile.eventsShort")}</p>
      </div>
    </DrawerContent>
    </Drawer>
  );
}

function OrganizerStats({ profile }: { profile: PublicProfile }) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language);
  return (
    <dl data-organizer-stats className="grid grid-cols-2 divide-x divide-white/10 border-y border-white/10 py-6">
      {[{ label: "publicProfile.followersShort", value: profile.followerCount }, { label: "publicProfile.ticketsShort", value: profile.ticketsSoldCount }].map(stat => (
        <div key={stat.label} className="flex flex-col-reverse gap-1.5 px-3 text-center">
          <dt className="text-xs text-muted-foreground">{t(stat.label)}</dt>
          <dd className="text-2xl font-semibold tracking-tight tabular-nums md:text-3xl">{number.format(stat.value ?? 0)}</dd>
        </div>
      ))}
    </dl>
  );
}

function OrganizerEvents({ organizerId, kind, title, events, loading, failed, onRetry, emptyLabel }: {
  organizerId: string;
  kind: "upcoming" | "past";
  title: string;
  events: Event[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  emptyLabel: string;
}) {
  const { t } = useTranslation();
  const railRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const railClassName = "flex snap-x snap-mandatory scroll-px-0.5 gap-3 overflow-x-auto overscroll-x-contain px-0.5 pb-2 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-4";
  const slideClassName = "min-w-0 w-[46%] shrink-0 snap-start sm:w-[42%] lg:w-[30%]";

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const updateEdges = () => {
      const start = rail.scrollLeft <= 1;
      const end = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1;
      setEdges(current => current.start === start && current.end === end ? current : { start, end });
    };
    updateEdges();
    const observer = new ResizeObserver(updateEdges);
    observer.observe(rail);
    rail.addEventListener("scroll", updateEdges, { passive: true });
    return () => {
      observer.disconnect();
      rail.removeEventListener("scroll", updateEdges);
    };
  }, [events, loading, failed]);

  const scroll = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: direction * rail.clientWidth * 0.9,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  };

  return (
    <section data-organizer-events={kind} aria-labelledby={`organizer-${kind}-title`}>
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h2 id={`organizer-${kind}-title`} className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h2>
        {!loading && !failed && events.length > 0 && (
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-xs tabular-nums text-muted-foreground">{events.length}</span>
            {(!edges.start || !edges.end) && <div className="hidden items-center gap-1.5 sm:flex">
              {([-1, 1] as const).map(direction => (
                <button key={direction} type="button" onClick={() => scroll(direction)} disabled={direction === -1 ? edges.start : edges.end}
                  aria-label={`${t(direction === -1 ? "common.back" : "common.next")} · ${title}`}
                  aria-controls={`organizer-${kind}-rail`}
                  className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-primary">
                  {direction === -1 ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              ))}
            </div>}
          </div>
        )}
      </div>
      {loading ? (
        <div role="status" aria-label={t("common.loading")} className={railClassName}>
          {[0, 1, 2].map(index => <div key={index} className={slideClassName}><EventCardSkeleton /></div>)}
        </div>
      ) : failed ? (
        <RequestError message={t("publicProfile.eventsLoadFailed")} onRetry={onRetry} />
      ) : events.length ? (
        <div ref={railRef} id={`organizer-${kind}-rail`} data-nav-scroll={`organizer:${organizerId}:${kind}`} role="region" aria-labelledby={`organizer-${kind}-title`} tabIndex={0} className={`${railClassName} rounded-sm focus-visible:outline-2 focus-visible:outline-primary`}>
          {events.map(event => <div key={event.id} className={slideClassName}><EventBrowseCard event={event} userLocation={null} /></div>)}
        </div>
      ) : <p className="text-sm leading-6 text-muted-foreground">{emptyLabel}</p>}
    </section>
  );
}
