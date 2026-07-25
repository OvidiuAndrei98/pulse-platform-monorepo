"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Search, X, Calendar, ArrowUpRight, BadgeCheck, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Event } from "@/core/DataProvider";
import { ApiClient, type ReadableSchema } from "@packages/api-client/src/Client";

interface SearchPopoverProps {
  events?: Event[];
}

type PublicProfile = ReadableSchema<"PublicProfileResponse">;

export function SearchPopover({ events }: SearchPopoverProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Închidere la tasta Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus automat pe input când se deschide popover-ul
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [open]);

  // Închidere la click în afara componentei
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("touchstart", onClick);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("touchstart", onClick);
    };
  }, [open]);

  const q = query.trim().toLowerCase();

  useEffect(() => {
    if (!open || q.length < 2) {
      setProfiles([]);
      return;
    }
    const timer = window.setTimeout(() => {
      ApiClient.instance.get("/profiles/search", { params: { query: { q } } })
        .then((data) => setProfiles(data as PublicProfile[]))
        .catch(() => setProfiles([]));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [open, q]);

  // Filtrare evenimente
  const matchedEvents = useMemo(() => {
    if (!q) return events?.slice(0, 4) ?? [];
    return events?.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.locationName.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q),
    );
  }, [q, events]);

  return (
    <div ref={wrapperRef} className="relative z-30 h-11 w-full">
      <AnimatePresence>
        {!open && (
          <motion.button
            key="search-btn"
            layoutId="search-morph"
            type="button"
            aria-label="Search events"
            onClick={() => setOpen(true)}
            className="absolute inset-x-0 top-0 flex h-11 items-center gap-2 overflow-hidden rounded-full border border-border bg-surface/90 px-4 text-left text-foreground backdrop-blur-lg transform-gpu md:bg-surface/70 md:backdrop-blur-md"
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
          >
            <motion.span layout className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Search events, places...
              </span>
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            key="search-panel"
            layoutId="search-morph"
            className="absolute left-0 right-0 top-0 z-50 overflow-hidden rounded-3xl border border-white/20 bg-[#141614]/90 text-foreground backdrop-blur-xl transform-gpu md:bg-[#141614]/45"
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
          >
            {/* Efect subtil de sticlă (sheen) */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.06] to-transparent"
            />

            <div className="relative">
              <motion.div layout className="flex items-center gap-2 px-4 pt-4">
                <Search className="h-4 w-4 text-primary" />

                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search events, places..."
                  className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  aria-label="Close search"
                  onClick={() => setOpen(false)}
                  className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-white/5 transition-colors hover:bg-white/10"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>

              {/* Contorizăm înălțimea independent pentru a opri trepidațiile (dansul) listei la filtrare */}
              <div className="max-h-[60vh] overflow-y-auto px-2 pb-3 pt-3">
                <Section title="Events" count={matchedEvents?.length ?? 0}>
                  {matchedEvents?.map((e) => (
                    <ResultRow
                      key={e.id}
                      icon={Calendar}
                      title={e.title}
                      meta={`${e.category} · ${e.locationName}`}
                      onClick={() => { router.push(`/events/${e.id}`); setOpen(false); }}
                    />
                  ))}
                  {matchedEvents?.length === 0 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      No events found.
                    </p>
                  )}
                </Section>
                {q.length >= 2 && (
                  <Section title="Persoane si organizatori" count={profiles.length}>
                    {profiles.map((profile) => (
                      <ResultRow
                        key={profile.id}
                        icon={profile.role === "organizer" ? BadgeCheck : UserRound}
                        title={profile.role === "organizer" ? profile.organizerName || profile.username : `@${profile.username}`}
                        meta={profile.role === "organizer" ? `Organizator . @${profile.username}` : profile.bio || "Profil public"}
                        onClick={() => { router.push(`/users/${profile.id}`); setOpen(false); }}
                      />
                    ))}
                    {profiles.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Niciun profil gasit.</p>}
                  </Section>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <span className="text-[11px] text-muted-foreground">{count}</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
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
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/5 active:scale-[0.99] transform-gpu"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{meta}</p>
      </div>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
