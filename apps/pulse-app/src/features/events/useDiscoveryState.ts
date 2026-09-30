"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { defaultEventFilters, eventDateFilters } from "./constants";
import type { EventFilters } from "./types";

type DiscoveryState = { filters: EventFilters; view: "list" | "map" };
const filterKeys = ["date", "city", "categories", "vibes", "distance", "view"];

export function parseDiscoveryState(query: string): DiscoveryState {
  const params = new URLSearchParams(query);
  const distance = Number(params.get("distance"));
  const date = params.get("date");
  return {
    view: params.get("view") === "map" ? "map" : "list",
    filters: {
      ...defaultEventFilters,
      date: eventDateFilters.includes(date as typeof eventDateFilters[number]) ? date! : defaultEventFilters.date,
      city: params.get("city") ?? "",
      categories: (params.get("categories") ?? "").split(",").filter(Boolean),
      vibes: (params.get("vibes") ?? "").split(",").filter(Boolean),
      distance: Number.isFinite(distance) && distance > 0 ? distance : defaultEventFilters.distance,
    },
  };
}

export function useDiscoveryState() {
  const params = useSearchParams();
  // Opening an event changes eventId, but must not reset the active filters.
  // Only explicit discovery links initialize them; local edits stay local.
  const search = JSON.stringify(filterKeys.map((key) => [key, params.get(key)]));
  const [state, setState] = useState<DiscoveryState>(() => parseDiscoveryState(params.toString()));
  const ready = true;
  useEffect(() => {
    const query = new URLSearchParams();
    for (const [key, value] of JSON.parse(search) as [string, string | null][]) {
      if (value !== null) query.set(key, value);
    }
    setState(parseDiscoveryState(query.toString()));
  }, [search]);
  const update = (next: DiscoveryState) => {
    if (JSON.stringify(next.filters) !== JSON.stringify(state.filters)) {
      window.dispatchEvent(new Event("spottr:cancel-scroll-restore"));
      document.querySelector<HTMLElement>('[data-nav-scroll="events-list"]')?.scrollTo({ top: 0 });
    }
    setState(next);
  };
  return { ...state, ready, setFilters: (filters: EventFilters) => update({ ...state, filters }), setView: (view: "list" | "map") => update({ ...state, view }) };
}
