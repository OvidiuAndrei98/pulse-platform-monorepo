"use client";

import { useCallback, useRef } from "react";
import { useCachedClientQuery } from "@/lib/useCachedClientQuery";
import { readClientQuery, refreshClientQuery } from "@/lib/clientQueryCache";
import { appendEventPage, type EventPageSet } from "./eventPages";

class NextPageError extends Error {
  constructor(readonly original: unknown) { super("EVENT_NEXT_PAGE_FAILED"); }
}

/** One cache entry retains all visited pages so Back can restore a long list. */
export function useEventPages<T extends { id: string }>(
  queryKey: string | null, fetchPage: (page: number) => Promise<readonly T[] | null>, pageSize = 20,
) {
  const key = queryKey ? `event-pages:${queryKey}` : null;
  const loader = useRef({ key, fetchPage });
  loader.current = { key, fetchPage };
  const empty: EventPageSet<T> = { items: [], page: 0, hasMore: true };
  const query = useCachedClientQuery(key, async () => {
    const load = fetchPage;
    const pages = key ? readClientQuery<EventPageSet<T>>(key)?.data?.page ?? 1 : 1;
    let result: EventPageSet<T> | undefined;
    for (let page = 1; page <= Math.max(1, pages); page++) {
      result = appendEventPage(result, await load(page), page, pageSize);
      if (!result.hasMore) break;
    }
    return result!;
  }, empty, { staleTimeMs: 30_000 });

  const loadMore = useCallback(() => {
    if (!key || loader.current.key !== key) return Promise.resolve();
    const snapshot = readClientQuery<EventPageSet<T>>(key);
    const previous = snapshot?.data;
    if (!previous?.hasMore || snapshot?.refreshing) return Promise.resolve();
    const load = loader.current.fetchPage;
    return refreshClientQuery(key, async () => {
      try { return appendEventPage(previous, await load(previous.page + 1), previous.page + 1, pageSize); }
      catch (error) { throw new NextPageError(error); }
    }, { force: true });
  }, [key, pageSize]);

  return {
    items: query.data.items,
    hasMore: query.data.hasMore,
    pending: query.pending,
    refreshing: query.refreshing,
    error: query.error || query.refreshError,
    loadMore,
    retry: query.refreshError instanceof NextPageError ? loadMore : query.retry,
  };
}
