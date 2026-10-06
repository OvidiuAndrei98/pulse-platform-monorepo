/** Maps and overview sections still need the complete filtered dataset. */
export async function loadEventPages<T extends { id: string }>(
  loadPage: (page: number) => Promise<readonly T[] | null>,
  pageSize: number,
): Promise<T[]> {
  const events = new Map<string, T>();
  for (let page = 1; ; page++) {
    const batch = (await loadPage(page)) ?? [];
    if (!Array.isArray(batch)) throw new Error("INVALID_EVENT_LIST");
    const previousSize = events.size;
    for (const event of batch) events.set(event.id, event);
    if (batch.length < pageSize) return [...events.values()];
    // Protect against a proxy/server ignoring page, without silently returning partial results.
    if (events.size === previousSize) throw new Error("EVENT_PAGINATION_STALLED");
  }
}
