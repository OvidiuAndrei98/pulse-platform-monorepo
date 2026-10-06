export type EventPageSet<T> = { items: T[]; page: number; hasMore: boolean };

export function appendEventPage<T extends { id: string }>(
  previous: EventPageSet<T> | undefined, batch: readonly T[] | null, page: number, pageSize: number,
): EventPageSet<T> {
  const incoming = batch ?? [];
  if (!Array.isArray(incoming)) throw new Error("INVALID_EVENT_LIST");
  const items = new Map((previous?.items ?? []).map(item => [item.id, item]));
  const before = items.size;
  for (const item of incoming) items.set(item.id, item);
  if (page > 1 && incoming.length >= pageSize && items.size === before) throw new Error("EVENT_PAGINATION_STALLED");
  return { items: [...items.values()], page, hasMore: incoming.length >= pageSize };
}
