import type { components } from "@packages/api-client/src/schema";

type EventDTO = components["schemas"]["EventResponse"];
export type Ticket = Pick<
  components["schemas"]["TicketTypeResponse"],
  | "id"
  | "name"
  | "priceRon"
  | "capacity"
  | "startSales"
  | "endSales"
  | "ticketsSold"
  | "description"
>;
export type Artist = Pick<
  components["schemas"]["Artist"],
  "id" | "name" | "imageUrl" | "isHeadliner" | "performanceTime" | "stage" | "spotifyUrl"
>;
export type Event = Pick<
  EventDTO,
  | "id"
  | "title"
  | "category"
  | "vibe"
  | "city"
  | "locationName"
  | "description"
  | "bannerUrl"
  | "startTime"
  | "endTime"
  | "organizerId"
  | "organizerAbsorbsServiceFee"
  | "commissionRateBps"
  | "commissionPerTicketBani"
  | "externalTicketUrl"
> & {
  ticketTypes: Ticket[];
  lineup: Artist[];
  latitude: number | null;
  longitude: number | null;
};
export type EventPage = { items: Event[]; rawCount: number; page: number };
export type EventFilters = {
  organizerId?: string;
  q?: string;
  category?: string;
  vibe?: string;
  city?: string;
  startsAfter?: string;
  startsBefore?: string;
};

export const categories = [
  "TECHNO",
  "HOUSE",
  "TRANCE",
  "HARDSTYLE",
  "DRUM & BASS",
  "HIP-HOP",
  "POP",
  "ROCK",
  "INDIE",
  "JAZZ",
  "PARTY",
  "FESTIVAL",
  "CONCERT",
  "EXPO",
  "OTHER",
];
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const string = (value: unknown) => (typeof value === "string" ? value : "");
const finite = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
export const isEventId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);

export function httpUrl(value: unknown): string | undefined {
  try {
    const url = new URL(string(value));
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeEvent(value: unknown): Event | null {
  const data = record(value);
  if (!isEventId(data.id)) return null;
  const tickets = Array.isArray(data.ticketTypes) ? data.ticketTypes : [];
  const artists = Array.isArray(data.lineup) ? data.lineup : [];
  const lat = finite(data.latitude),
    lon = finite(data.longitude);
  return {
    id: data.id.toLowerCase(),
    organizerId: string(data.organizerId),
    title: string(data.title),
    category: string(data.category),
    vibe: string(data.vibe),
    city: string(data.city),
    locationName: string(data.locationName),
    description: string(data.description),
    bannerUrl: httpUrl(data.bannerUrl),
    externalTicketUrl: httpUrl(data.externalTicketUrl),
    startTime: string(data.startTime),
    endTime: string(data.endTime),
    organizerAbsorbsServiceFee: data.organizerAbsorbsServiceFee === true,
    commissionRateBps: finite(data.commissionRateBps) ?? undefined,
    commissionPerTicketBani: finite(data.commissionPerTicketBani) ?? undefined,
    latitude: lat !== null && Math.abs(lat) <= 90 ? lat : null,
    longitude: lon !== null && Math.abs(lon) <= 180 ? lon : null,
    ticketTypes: tickets.flatMap((value) => {
      const t = record(value),
        price = finite(t.priceRon),
        capacity = finite(t.capacity),
        sold = finite(t.ticketsSold);
      if (
        !string(t.id) ||
        price === null ||
        price < 0 ||
        capacity === null ||
        capacity < 0
      )
        return [];
      return [
        {
          id: string(t.id),
          name: string(t.name),
          description: string(t.description),
          priceRon: price,
          capacity,
          ticketsSold: sold === null ? undefined : Math.max(0, sold),
          startSales: string(t.startSales),
          endSales: string(t.endSales),
        },
      ];
    }),
    lineup: artists.flatMap((value) => {
      const a = record(value);
      if (!string(a.id) || !string(a.name)) return [];
      return [
        {
          id: string(a.id),
          name: string(a.name),
          imageUrl: httpUrl(a.imageUrl) || "",
          isHeadliner: a.isHeadliner === true,
          performanceTime: string(a.performanceTime),
          stage: string(a.stage),
          spotifyUrl: httpUrl(a.spotifyUrl),
        },
      ];
    }),
  };
}

export function mergePages(pages: readonly EventPage[] = []): Event[] {
  const events = new Map<string, Event>();
  for (const page of pages)
    for (const event of page.items) events.set(event.id, event);
  return [...events.values()];
}

export function ensurePageProgress(
  page: EventPage,
  previousIds: readonly string[],
) {
  if (page.page <= 1 || page.rawCount === 0) return;
  const ids = new Set(previousIds);
  if (page.items.length === 0 || page.items.every((event) => ids.has(event.id)))
    throw new Error("PAGINATION_STALLED");
}

export function isLive(event: Event, now = Date.now()) {
  return Date.parse(event.startTime) <= now && Date.parse(event.endTime) > now;
}

export function availableTickets(event: Event, now = Date.now()) {
  if (!(Date.parse(event.endTime) > now)) return [];
  return event.ticketTypes
    .filter(
      (t) =>
        t.capacity > (t.ticketsSold ?? 0) &&
        Date.parse(t.startSales) <= now &&
        Date.parse(t.endSales) > now,
    )
    .sort((a, b) => a.priceRon - b.priceRon || a.id.localeCompare(b.id));
}

export function eventUrl(base: string, id: string) {
  return `${base}/events/${encodeURIComponent(id)}`;
}

export function formatDate(value: string, language: "ro" | "en", time = false, options: { year?: boolean; deviceTime?: boolean } = {}) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat(language === "ro" ? "ro-RO" : "en-GB", {
    ...(options.deviceTime ? {} : { timeZone: "Europe/Bucharest" }),
    day: "numeric",
    month: "short",
    ...(options.year ? { year: "numeric" as const } : {}),
    ...(time
      ? ({ hour: "2-digit", minute: "2-digit", hour12: false } as const)
      : {}),
  }).format(new Date(value));
}
