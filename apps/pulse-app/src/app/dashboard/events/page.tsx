"use client";

import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { User } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";

type Filter = "all" | "published" | "draft";

export default function EventsListPage() {
  const { user } = useDataProvider();
  const { events, eventsLoading, eventsError } = User.useOrganizerEvents(user);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (filter === "published" && e.status !== "published") return false;
      if (filter === "draft" && e.status !== "draft") return false;
      if (q && !e.title.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [filter, q, events]);

  return (
    <div className="min-h-screen bg-background pb-40 text-foreground">
      <div className="mx-auto max-w-5xl px-5 pt-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Organizer
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
              Evenimente
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {events.length} total ·{" "}
              {events.filter((e) => e.status === "published").length} publicate
            </p>
          </div>
          <Link
            href="/dashboard/events/new"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-lg shadow-primary/20"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} /> Event nou
          </Link>
        </div>

        {/* Filters */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Caută eveniment..."
              className="w-full rounded-full border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
            />
          </div>
          <div className="flex gap-1.5 rounded-full border border-white/10 bg-white/5 p-1">
            {(["all", "published", "draft"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={
                  "rounded-full px-3.5 py-1.5 text-xs font-semibold transition " +
                  (filter === f
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {f === "all"
                  ? "Toate"
                  : f === "published"
                    ? "Publicate"
                    : "Draft"}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="mt-6 space-y-2">
          {filtered.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Niciun eveniment care se potrivește filtrelor.
              </p>
            </div>
          )}

          {filtered.map((e) => {
            return (
              <Link
                key={e.id}
                href={`/dashboard/events/${e.id}`}
                className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-3 transition hover:bg-white/10"
              >
                <img
                  src={e.bannerUrl}
                  alt={e.title}
                  className="h-20 w-20 shrink-0 rounded-xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                        (e.status === "published"
                          ? "bg-primary/15 text-primary"
                          : "bg-white/10 text-muted-foreground")
                      }
                    >
                      {e.status === "published" ? "Publicat" : "Draft"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {e.category}
                    </span>
                    {/* <span className="text-[11px] text-muted-foreground">
                      · {e.vibe}
                    </span> */}
                  </div>
                  <h3 className="mt-1 truncate text-sm font-semibold">
                    {e.title}
                  </h3>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {new Date(e.startTime).toLocaleString()} · {e.locationName}
                  </p>
                </div>
                <div className="hidden shrink-0 text-right sm:block">
                  <p className="text-sm font-semibold">
                    {e.ticketTypes?.reduce(
                      (sum, t) => sum + (t.ticketsSold ?? 0),
                      0,
                    )}{" "}
                    / {e.ticketTypes?.reduce((sum, t) => sum + t.capacity, 0)}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    bilete
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">
                    {e.ticketTypes
                      ?.reduce(
                        (sum, t) => sum + t.priceRon * (t.ticketsSold ?? 0),
                        0,
                      )
                      .toLocaleString()}{" "}
                    €
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    venit
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
