type FeaturedEvent = {
  id: string;
  status: string;
  startTime: string;
  endTime: string;
};

export function isDashboardEventLive(
  event: FeaturedEvent,
  now: number,
): boolean {
  return (
    event.status === "published" &&
    Date.parse(event.startTime) <= now &&
    now < Date.parse(event.endTime)
  );
}

/** Keep the current event visible throughout entry, then show the next event. */
export function selectDashboardEvent<T extends FeaturedEvent>(
  events: readonly T[],
  now: number,
): T | undefined {
  const byStart = (a: T, b: T) =>
    Date.parse(a.startTime) - Date.parse(b.startTime) ||
    a.id.localeCompare(b.id);
  const eligible = events.filter(
    (event) =>
      ["draft", "scheduled", "published"].includes(event.status) &&
      Date.parse(event.endTime) > Date.parse(event.startTime),
  );
  return (
    eligible
      .filter((event) => isDashboardEventLive(event, now))
      .sort(byStart)[0] ??
    eligible
      .filter((event) => Date.parse(event.startTime) > now)
      .sort(byStart)[0]
  );
}

/** Missing counters from older APIs are unknown, never inferred from reserved stock. */
export function dashboardTicketCounts(event: {
  externalTicketUrl?: string;
  stats?: { totalTicketsSold?: number; totalTicketsScanned?: number };
}) {
  const count = (value: number | undefined) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      ? value
      : undefined;
  if (event.externalTicketUrl?.trim())
    return { sold: undefined, scanned: undefined };
  const scanned = count(event.stats?.totalTicketsScanned);
  return {
    sold: count(event.stats?.totalTicketsSold),
    scanned: scanned ? scanned : undefined,
  };
}
