"use client";

import { routeForPlatform } from "@/lib/native/navigation";
import { useBackLayer } from "@/lib/navigation/useBackLayer";
import { RequestError, RequestProgress } from "@/components/ui/RequestFeedback";

import { AnimatePresence, motion } from "framer-motion";
import { Search, X, ArrowUpRight, BadgeCheck, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Event } from "@/core/DataProvider";
import {
  formatEventDateShort,
  formatEventTime,
} from "@/features/events/dateFormat";
import {
  ApiClient,
  type ReadableSchema,
} from "@packages/api-client/src/Client";
import { useTranslation } from "react-i18next";

interface SearchPopoverProps {
  events?: Event[];
}
type PublicProfile = ReadableSchema<"PublicProfileResponse">;

export function SearchPopover({ events }: SearchPopoverProps) {
  const [open, setOpen] = useState(false);
  useBackLayer(open, () => setOpen(false));
  const [query, setQuery] = useState("");
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [profileQuery, setProfileQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 250);
    const onKeyDown = (event: KeyboardEvent) =>
      event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const q = query.trim().toLowerCase();

  useEffect(() => {
    if (!open || q.length < 2) {
      setProfiles([]);
      setSearching(false);
      setSearchError(false);
      setProfileQuery("");
      return;
    }
    let active = true;
    setSearching(true);
    setSearchError(false);
    const timer = window.setTimeout(() => {
      ApiClient.instance
        .get("/profiles/search", { params: { query: { q } } })
        .then((data) => { if (active) { setProfiles(data as PublicProfile[]); setProfileQuery(q); } })
        .catch(() => { if (active) { setSearchError(true); setProfiles([]); setProfileQuery(q); } })
        .finally(() => { if (active) setSearching(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open, q, attempt]);
  const resultsPending = searching || (q.length >= 2 && profileQuery !== q);

  const matchedEvents = useMemo(() => {
    if (!q) return [];
    return events?.filter(
      (event) =>
        event.title.toLowerCase().includes(q) ||
        event.locationName.toLowerCase().includes(q) ||
        event.category.toLowerCase().includes(q) ||
        event.id.toLowerCase().includes(q),
    );
  }, [q, events]);

  const recommendedEvents = useMemo(() => {
    const now = Date.now();
    return [...(events ?? [])]
      .filter((event) => new Date(event.endTime).getTime() > now)
      .sort(
        (first, second) =>
          Number(Boolean(second.stats?.isFavorited)) -
            Number(Boolean(first.stats?.isFavorited)) ||
          (second.stats?.goingCount ?? 0) - (first.stats?.goingCount ?? 0) ||
          new Date(first.startTime).getTime() -
            new Date(second.startTime).getTime(),
      )
      .slice(0, 6);
  }, [events]);

  const navigate = (href: string) => {
    window.dispatchEvent(new window.Event("spottr:layer-navigation"));
    router.push(routeForPlatform(href));
    setOpen(false);
  };

  const drawer = (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200]">
          <motion.button
            type="button"
            aria-label={t("search.close")}
            className="absolute inset-0 h-full w-full cursor-default bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t("search.open")}
            className="absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden border-l border-white/10 bg-[#0d0e0d] shadow-[-24px_0_70px_rgba(0,0,0,0.45)] md:w-[46vw] md:min-w-[480px] md:max-w-[680px]"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{
              type: "spring",
              stiffness: 285,
              damping: 31,
              mass: 0.9,
            }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_0%,rgba(255,0,68,0.12),transparent_38%)]"
            />
            <header className="relative flex items-center justify-between border-b border-white/[0.08] px-5 pb-5 pt-[max(1.25rem,var(--native-safe-top))] md:px-8 md:pt-8">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                  SPOTTR
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">
                  {t("search.open")}
                </h2>
              </div>
              <button
                type="button"
                aria-label={t("search.close")}
                onClick={() => setOpen(false)}
                className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/[0.05] transition hover:border-white/20 hover:bg-white/10 active:scale-95"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="relative px-5 pt-5 md:px-8 md:pt-7">
              <div className="flex h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] px-4 transition focus-within:border-primary/50 focus-within:bg-white/[0.07]">
                <Search className="h-5 w-5 shrink-0 text-primary" />
                <input
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("search.placeholder")}
                  className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label={t("search.close")}
                    className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="relative min-h-0 flex-1 overflow-y-auto px-3 pb-[max(2rem,var(--native-safe-bottom))] pt-3 md:px-6">
              {!q ? (
                <Section
                  title={t("search.recommended")}
                  count={recommendedEvents.length}
                >
                  {recommendedEvents.map((event) => (
                    <RecommendationRow
                      key={event.id}
                      event={event}
                      onClick={() => navigate(`/events/${event.id}`)}
                    />
                  ))}
                  {recommendedEvents.length === 0 && (
                    <Empty>{t("search.noEvents")}</Empty>
                  )}
                </Section>
              ) : (
                <Section
                  title={t("search.events")}
                  count={matchedEvents?.length ?? 0}
                >
                  {matchedEvents?.map((event) => (
                    <RecommendationRow
                      key={event.id}
                      event={event}
                      onClick={() => navigate(`/events/${event.id}`)}
                    />
                  ))}
                  {matchedEvents?.length === 0 && (
                    <Empty>{t("search.noEvents")}</Empty>
                  )}
                </Section>
              )}
              {q.length >= 2 && (
                <Section
                  title={t("search.peopleAndOrganizers")}
                  count={resultsPending || searchError ? undefined : profiles.length}
                >
                  {resultsPending ? <RequestProgress label={t("feedback.searching")} className="px-3 py-5" /> : searchError ? <RequestError onRetry={() => setAttempt((value) => value + 1)} /> : profiles.map((profile) => (
                    <ResultRow
                      key={profile.id}
                      icon={
                        profile.role === "organizer" ? BadgeCheck : UserRound
                      }
                      title={
                        profile.role === "organizer"
                          ? profile.organizerName || profile.username
                          : `@${profile.username}`
                      }
                      meta={
                        profile.role === "organizer"
                          ? t("search.organizerMeta", {
                              username: profile.username,
                            })
                          : profile.bio || t("search.publicProfile")
                      }
                      onClick={() => navigate(`/users/${profile.id}`)}
                    />
                  ))}
                  {!resultsPending && !searchError && profiles.length === 0 && (
                    <Empty>{t("search.noProfiles")}</Empty>
                  )}
                </Section>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        type="button"
        aria-label={t("search.open")}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="group flex h-10 items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-[11px] text-sm  transition hover:border-white/20 hover:bg-white/[0.08] text-foreground active:scale-95 md:px-4"
      >
        <Search className="h-4 w-4 transition-colors text-primary" />
        <span className="hidden sm:inline">{t("search.open")}</span>
      </button>
      {typeof document !== "undefined" && createPortal(drawer, document.body)}
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-5 text-sm text-muted-foreground">{children}</p>;
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-3">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        {count !== undefined && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-muted-foreground">
          {count}
        </span>}
      </div>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function ResultRow({
  icon: Icon,
  title,
  meta,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/[0.06] active:scale-[0.99]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10">
        <Icon className="h-[18px] w-[18px] text-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  );
}

function RecommendationRow({
  event,
  onClick,
}: {
  event: Event;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 border-b border-white/[0.07] px-3 py-3 text-left transition last:border-b-0 hover:bg-white/[0.05] active:scale-[0.99]"
    >
      <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/[0.06] shadow-lg">
        <Image
          src={event.bannerUrl || "/party-event.png"}
          alt=""
          fill
          sizes="56px"
          className="object-cover transition duration-300 group-hover:scale-105"
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold tracking-wide text-foreground">
          {event.title}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {event.locationName} · {formatEventDateShort(event.startTime)} |{" "}
          {formatEventTime(event.startTime)}
        </p>
      </div>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />
    </button>
  );
}
