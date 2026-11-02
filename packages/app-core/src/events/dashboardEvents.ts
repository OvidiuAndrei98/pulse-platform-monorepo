import { isDashboardEventLive } from "./dashboardFeatured";

type TimelineEvent = {
  id: string;
  status: string;
  startTime: string;
  endTime: string;
};
export const dashboardEventFilters = [
  "all",
  "upcoming",
  "published",
  "scheduled",
  "draft",
  "completed",
] as const;
export type DashboardEventFilter = (typeof dashboardEventFilters)[number];
export function parseDashboardEventFilter(
  value: unknown,
): DashboardEventFilter {
  return dashboardEventFilters.includes(value as DashboardEventFilter)
    ? (value as DashboardEventFilter)
    : "all";
}
const byStart = (a: TimelineEvent, b: TimelineEvent) =>
  Date.parse(a.startTime) - Date.parse(b.startTime) || a.id.localeCompare(b.id);
export function isUpcomingDashboardEvent(event: TimelineEvent, now: number) {
  return (
    ["published", "scheduled", "draft"].includes(event.status) &&
    Date.parse(event.startTime) > now &&
    Date.parse(event.endTime) > Date.parse(event.startTime)
  );
}
export function isPastDashboardEvent(event: TimelineEvent, now: number) {
  return event.status === "completed" || Date.parse(event.endTime) <= now;
}
export function dashboardEventGroups<T extends TimelineEvent>(
  events: readonly T[],
  now: number,
) {
  return {
    upcoming: events
      .filter((event) => isUpcomingDashboardEvent(event, now))
      .sort(byStart),
    past: events
      .filter((event) => isPastDashboardEvent(event, now))
      .sort(
        (a, b) =>
          Date.parse(b.endTime) - Date.parse(a.endTime) || -byStart(a, b),
      ),
  };
}
export function filterDashboardEvents<
  T extends TimelineEvent & { title: string },
>(
  events: readonly T[],
  filter: DashboardEventFilter,
  search: string,
  now: number,
): T[] {
  const rank = (event: T) =>
    isDashboardEventLive(event, now)
      ? 0
      : isUpcomingDashboardEvent(event, now)
        ? 1
        : isPastDashboardEvent(event, now)
          ? 2
          : 3;
  const query = search.trim().toLocaleLowerCase();
  return events
    .filter((event) => {
      if (query && !event.title.toLocaleLowerCase().includes(query))
        return false;
      if (filter === "all") return true;
      if (filter === "upcoming") return isUpcomingDashboardEvent(event, now);
      if (filter === "completed") return isPastDashboardEvent(event, now);
      return !isPastDashboardEvent(event, now) && event.status === filter;
    })
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (isPastDashboardEvent(a, now)
          ? Date.parse(b.endTime) - Date.parse(a.endTime) || -byStart(a, b)
          : byStart(a, b)),
    );
}
