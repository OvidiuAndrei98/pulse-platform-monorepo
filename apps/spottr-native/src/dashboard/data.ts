import type { components } from "@packages/api-client/src/schema";
import type { createHttp } from "../data/http";
import { isEventId } from "../data/events";
import { formatToDatetimeLocal } from "../../../pulse-app/src/features/events/form/dateTimeValues";

type Schema = components["schemas"];
export type DashboardEvent = Schema["EventResponse"];
export type OrganizerProfile = Schema["OrganizerProfile"];
export type EventDraft = Omit<
  Schema["CreateEventPayload"],
  "status" | "ticketTypes" | "lineup"
> & {
  status: string;
  ticketTypes?: Array<
    Schema["CreateTicketTypePayload"] & { id?: string; ticketsSold?: number }
  >;
  lineup?: Array<Schema["ArtistInput"] & { id?: string }>;
};
export type InvoiceSettings = Schema["InvoicingSettingsPayload"];
export type Plan = Schema["PromotionPlanResponse"];
export type Campaign = Schema["PromotionCampaignResponse"];
export const AGREEMENT_VERSION = "2026-10-18";
export const emptyEvent = (): EventDraft => ({
  title: "",
  description: "",
  category: "TECHNO",
  bannerUrl: "",
  googlePlaceId: "",
  locationName: "",
  city: "",
  vibe: "",
  latitude: NaN,
  longitude: NaN,
  startTime: "",
  endTime: "",
  status: "draft",
  ticketTypes: [],
  lineup: [],
  organizerAbsorbsServiceFee: false,
});
export function draftFromEvent(
  event: DashboardEvent,
  template = false,
): EventDraft {
  return {
    ...emptyEvent(),
    ...event,
    vatPercentage: [0, 11, 21].includes(event.vatPercentage ?? -1)
      ? (event.vatPercentage as 0 | 11 | 21)
      : undefined,
    status: template ? "draft" : event.status,
    startTime: template ? "" : formatToDatetimeLocal(event.startTime),
    endTime: template ? "" : formatToDatetimeLocal(event.endTime),
    publishAt: template ? "" : formatToDatetimeLocal(event.publishAt),
    ticketTypes: (event.ticketTypes ?? []).map((ticket) => ({
      ...ticket,
      id: template ? undefined : ticket.id,
      startSales: template ? "" : formatToDatetimeLocal(ticket.startSales),
      endSales: template ? "" : formatToDatetimeLocal(ticket.endSales),
    })),
    lineup: (event.lineup ?? []).map((artist) => ({
      ...artist,
      id: template ? undefined : artist.id,
    })),
  };
}
export function validHttps(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}
export function eventErrors(
  d: EventDraft,
  now = Date.now(),
): Record<string, string> {
  const errors: Record<string, string> = {};
  const required = (key: keyof EventDraft, min = 1) => {
    if (typeof d[key] !== "string" || String(d[key]).trim().length < min)
      errors[key] = "feedback.fieldRequired";
  };
  required("title", 3);
  required("description", 10);
  for (const key of ["category", "city", "locationName", "vibe"] as const)
    required(key);
  if (!d.googlePlaceId?.trim()) errors.locationName = "formValidation.locationRequired";
  if (!Number.isFinite(d.latitude) || Math.abs(d.latitude) > 90)
    errors.latitude = "formValidation.latitudeRequired";
  if (!Number.isFinite(d.longitude) || Math.abs(d.longitude) > 180)
    errors.longitude = "formValidation.longitudeRequired";
  if (!Number.isFinite(Date.parse(d.startTime)))
    errors.startTime = "formValidation.startRequired";
  if (
    !Number.isFinite(Date.parse(d.endTime)) ||
    Date.parse(d.endTime) <= Date.parse(d.startTime)
  )
    errors.endTime = "formValidation.endAfterStart";
  if (!["draft", "scheduled", "published"].includes(d.status))
    errors.status = "feedback.fieldRequired";
  if (
    d.status === "scheduled" &&
    (!d.publishAt || !(Date.parse(d.publishAt) > now))
  )
    errors.publishAt = "formValidation.publishTimeFuture";
  if (d.bannerUrl && !validHttps(d.bannerUrl))
    errors.bannerUrl = "formValidation.invalidUrl";
  if (d.externalTicketUrl) {
    if (!validHttps(d.externalTicketUrl))
      errors.externalTicketUrl = "ticketForm.externalUrlRequired";
  } else {
    if (![0, 11, 21].includes(d.vatPercentage as number))
      errors.vatPercentage = "ticketForm.vatRequired";
    for (const [i, t] of (d.ticketTypes ?? []).entries()) {
      if (
        t.name.trim().length < 2 ||
        !Number.isFinite(t.priceRon) ||
        t.priceRon < 0 ||
        !Number.isInteger(t.capacity) ||
        t.capacity < 1 ||
        (t.description?.length ?? 0) > 1000 ||
        !Number.isFinite(Date.parse(t.startSales)) ||
        !(Date.parse(t.endSales) > Date.parse(t.startSales))
      )
        errors[`ticketTypes.${i}`] = "formValidation.salesEndAfterStart";
    }
  }
  for (const [i, a] of (d.lineup ?? []).entries())
    if (
      !a.name.trim() ||
      a.name.length > 120 ||
      (a.spotifyUrl && !validHttps(a.spotifyUrl))
    )
      errors[`lineup.${i}`] = "formValidation.artistNameRequired";
  return errors;
}
export function eventPayload(
  d: EventDraft,
  now = Date.now(),
): Schema["CreateEventPayload"] {
  if (Object.keys(eventErrors(d, now)).length) throw new Error("Invalid event");
  const iso = (value: string) => new Date(value).toISOString();
  return {
    title: d.title.trim(),
    description: d.description?.trim(),
    category: d.category,
    googlePlaceId: d.googlePlaceId,
    locationName: d.locationName.trim(),
    city: d.city.trim(),
    vibe: d.vibe.trim(),
    latitude: d.latitude,
    longitude: d.longitude,
    bannerUrl: d.bannerUrl || undefined,
    startTime: iso(d.startTime),
    endTime: iso(d.endTime),
    status: d.status as Schema["CreateEventPayload"]["status"],
    publishAt: d.status === "scheduled" ? iso(d.publishAt!) : undefined,
    externalTicketUrl: d.externalTicketUrl || undefined,
    vatPercentage: d.externalTicketUrl ? undefined : d.vatPercentage,
    organizerAbsorbsServiceFee:
      !d.externalTicketUrl && d.organizerAbsorbsServiceFee,
    ticketTypes: d.externalTicketUrl
      ? []
      : (d.ticketTypes ?? []).map((t) => ({
          id: t.id || undefined,
          name: t.name.trim(),
          priceRon: t.priceRon,
          capacity: t.capacity,
          description: t.description,
          startSales: iso(t.startSales),
          endSales: iso(t.endSales),
        })),
    lineup: d.lineup ?? [],
  };
}
export function promoPayload(
  code: string,
  discount: string,
  limit: string,
): Schema["CreatePromoCodePayload"] {
  const normalized = code.trim().toUpperCase(),
    percent = Number(discount),
    max = limit.trim() ? Number(limit) : undefined;
  if (
    !/^[A-Z0-9_-]{3,40}$/.test(normalized) ||
    !Number.isInteger(percent) ||
    percent < 1 ||
    percent > 90 ||
    (max !== undefined && (!Number.isSafeInteger(max) || max < 1))
  )
    throw new Error("Invalid promotion code");
  return { code: normalized, discountPercent: percent, maxRedemptions: max };
}
export function promotionDates(plan: Plan, eventEnd: string, now = new Date()) {
  const result: string[] = [];
  for (let i = 0; i < 90; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (plan.id === "thu_sat" && d.getDay() !== 4) continue;
    const end = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate() + plan.days,
    );
    if (end.getTime() > Date.parse(eventEnd)) continue;
    result.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  }
  return result;
}
export function list<T>(value: unknown): T[] {
  if (value === null) return [];
  if (
    !Array.isArray(value) ||
    value.some((row) => !row || typeof row !== "object")
  )
    throw new Error("Invalid dashboard response");
  return value as T[];
}
export const eventPath = (id: string) => {
  if (!isEventId(id)) throw new Error("Invalid event ID");
  return `/dashboard/events/${id}`;
};
export function createDashboardApi(request: ReturnType<typeof createHttp>) {
  return {
    events: async (signal?: AbortSignal) =>
      list<DashboardEvent>(await request("/dashboard/events", { signal })),
    event: (id: string, signal?: AbortSignal) =>
      request<DashboardEvent>(eventPath(id), { signal }),
    saveEvent: (draft: EventDraft, id?: string) =>
      request<DashboardEvent>(id ? eventPath(id) : "/dashboard/events", {
        method: "POST",
        body: eventPayload(draft),
      }),
    deleteEvent: (id: string) =>
      request<void>(eventPath(id), { method: "DELETE" }),
    profile: (id: string, signal?: AbortSignal) =>
      request<OrganizerProfile>(
        `/dashboard/organizer/profile/${encodeURIComponent(id)}`,
        { signal },
      ),
    stripe: (signal?: AbortSignal) =>
      request<OrganizerProfile>("/dashboard/stripe/status", { signal }),
    invoices: (signal?: AbortSignal) =>
      request<Schema["BillingInvoiceResponse"][] | null>(
        "/dashboard/invoicing/invoices",
        { signal },
      ).then(list<Schema["BillingInvoiceResponse"]>),
  };
}
