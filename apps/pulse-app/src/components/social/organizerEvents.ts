/** Shared ordering for web and native organizer profiles. Live events remain upcoming. */
export function splitOrganizerEvents<T extends { startTime: string; endTime: string }>(events: readonly T[], now = Date.now()) {
  const valid = events.filter(event => Number.isFinite(Date.parse(event.startTime)) && Number.isFinite(Date.parse(event.endTime)));
  return {
    upcomingEvents: valid.filter(event => Date.parse(event.endTime) > now).sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime)),
    pastEvents: valid.filter(event => Date.parse(event.endTime) <= now).sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime)),
  };
}
