/** Keep live admission first, upcoming events next and pending offline journals
 * last. Ended local events must stay reachable until their scans are synced. */
export function sortValidationEvents<T extends { id: string; startTime: string; endTime: string }>(events: readonly T[], now = Date.now()): T[] {
  const phase = (event: T) => Date.parse(event.endTime) <= now ? 2 : Date.parse(event.startTime) <= now ? 0 : 1;
  return [...events].sort((a, b) => {
    const group = phase(a) - phase(b);
    const date = phase(a) === 2 ? Date.parse(b.endTime) - Date.parse(a.endTime) : Date.parse(a.startTime) - Date.parse(b.startTime);
    return group || date || a.id.localeCompare(b.id);
  });
}
