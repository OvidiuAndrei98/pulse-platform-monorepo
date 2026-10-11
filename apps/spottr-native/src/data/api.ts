import { API_URL, PAGE_SIZE } from "../config";
import {
  isEventId,
  normalizeEvent,
  type EventFilters,
  type EventPage,
} from "./events";

import { ApiError, authorizedFetch } from "./http";
export { ApiError } from "./http";

export function parseEventSocial(data: unknown) {
  if (!data || typeof data !== "object") throw new ApiError(0, "INVALID_RESPONSE");
  const row = data as Record<string, unknown>;
  const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const friends = Array.isArray(row.friends) ? row.friends.flatMap(value => {
    if (!value || typeof value !== 'object' || !isEventId(value.id) || typeof value.username !== 'string' || !['interested', 'going', 'has_ticket'].includes(value.status)) return [];
    return [{ id: value.id as string, username: value.username as string, avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : undefined, status: value.status as 'interested' | 'going' | 'has_ticket' }];
  }) : [];
  return {
    friends,
    goingCount: row.ticketsSoldCount == null ? count(row.goingCount) : count(row.ticketsSoldCount) + count(row.manualGoingCount),
    interestedCount: count(row.interestedCount),
    currentUserStatus: ["interested", "going", "has_ticket"].includes(String(row.currentUserStatus)) ? row.currentUserStatus as "interested" | "going" | "has_ticket" : null,
  };
}

export function createEventsApi(
  base = API_URL,
  fetcher: typeof fetch = fetch,
  timeoutMs = 15000,
) {
  async function get(path: string, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetcher(`${base.replace(/\/+$/, "")}${path}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok)
        throw new ApiError(
          response.status,
          response.status === 404 ? "NOT_FOUND" : "HTTP_ERROR",
        );
      try {
        return await response.json();
      } catch {
        throw new ApiError(0, "INVALID_RESPONSE");
      }
    } catch (error) {
      if (timedOut) throw new ApiError(0, "TIMEOUT");
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
  return {
    async promotions(signal?: AbortSignal) {
      const payload = await get("/promotions/active", signal);
      if (payload === null) return [];
      if (!Array.isArray(payload)) throw new ApiError(0, "INVALID_RESPONSE");
      return payload.flatMap((row) => {
        if (!row || typeof row !== "object") return [];
        const event = normalizeEvent(row.event);
        return event && typeof row.campaignId === "string"
          ? [
              {
                campaignId: row.campaignId as string,
                placement:
                  row.placement === "feed"
                    ? ("feed" as const)
                    : ("home_banner" as const),
                event,
              },
            ]
          : [];
      });
    },
    async profile(id: string, signal?: AbortSignal) {
      if (!isEventId(id)) throw new ApiError(404, "NOT_FOUND");
      const data = await get(`/profiles/${encodeURIComponent(id)}`, signal);
      if (!data || typeof data !== "object")
        throw new ApiError(0, "INVALID_RESPONSE");
      const row = data as Record<string, unknown>;
      return {
        id,
        username: typeof row.username === "string" ? row.username : "",
        organizerName:
          typeof row.organizerName === "string" ? row.organizerName : "",
        avatarUrl:
          typeof row.avatarUrl === "string" ? row.avatarUrl : undefined,
        organizerVerified: row.organizerVerified === true,
      };
    },
    async social(id: string, signal?: AbortSignal) {
      const data = await get(
        `/events/${encodeURIComponent(id)}/social`,
        signal,
      );
      return parseEventSocial(data);
    },
    async page(
      filters: EventFilters = {},
      page = 1,
      signal?: AbortSignal,
    ): Promise<EventPage> {
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
        throw new ApiError(0, "INVALID_PAGE");
      const query = new URLSearchParams({ page: String(page) });
      for (const [key, raw] of Object.entries(filters)) {
        const value = raw?.trim();
        if (value) query.set(key, value);
      }
      if (Array.from(query.get("q") || "").length > 120)
        throw new ApiError(0, "INVALID_QUERY");
      const payload = await get(`/events?${query}`, signal);
      if (payload !== null && !Array.isArray(payload))
        throw new ApiError(0, "INVALID_RESPONSE");
      const rows: unknown[] = payload ?? [];
      const items = rows.map(normalizeEvent).filter((event) => event !== null);
      if (rows.length && !items.length)
        throw new ApiError(0, "INVALID_RESPONSE");
      return { items, rawCount: rows.length, page };
    },
    async event(id: string, signal?: AbortSignal) {
      if (!isEventId(id)) throw new ApiError(404, "NOT_FOUND");
      const event = normalizeEvent(
        await get(`/events/${encodeURIComponent(id)}`, signal),
      );
      if (!event || event.id !== id.toLowerCase())
        throw new ApiError(0, "INVALID_RESPONSE");
      return event;
    },
  };
}

export const eventsApi = createEventsApi(API_URL, authorizedFetch);
export const nextPage = (page: EventPage) =>
  page.rawCount >= PAGE_SIZE ? page.page + 1 : undefined;
