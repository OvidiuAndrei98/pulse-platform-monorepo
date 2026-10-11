import {
  infiniteQueryOptions,
  queryOptions,
  QueryClient,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { eventsApi, nextPage, ApiError } from "./api";
import {
  ensurePageProgress,
  mergePages,
  type EventFilters,
  type EventPage,
} from "./events";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      retry: (count, error) =>
        count < 1 &&
        !(
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500
        ),
    },
  },
});

export function eventQueryOptions(filters: EventFilters = {}, api = eventsApi) {
  return infiniteQueryOptions({
    queryKey: ["events", filters] as const,
    initialPageParam: { page: 1, previousIds: [] as string[] },
    queryFn: async ({ pageParam, signal }) => {
      const page = await api.page(filters, pageParam.page, signal);
      // These IDs belong to this pagination/refetch run, never the stale cache.
      ensurePageProgress(page, pageParam.previousIds);
      return page;
    },
    getNextPageParam: (lastPage, pages) => {
      const page = nextPage(lastPage);
      return page
        ? { page, previousIds: mergePages(pages).map((event) => event.id) }
        : undefined;
    },
  });
}
export function useEvents(filters: EventFilters = {}, enabled = true) {
  const query = useInfiniteQuery({ ...eventQueryOptions(filters), enabled });
  return {
    ...query,
    items: mergePages(query.data?.pages),
    loadMore: () => {
      if (query.hasNextPage && !query.isFetching && !query.isFetchNextPageError)
        void query.fetchNextPage({ cancelRefetch: false });
    },
  };
}

export function seedEvent(event: EventPage["items"][number]) {
  // List responses can have less detail; keep them visible while detail refreshes.
  if (!queryClient.getQueryData(["event", event.id]))
    queryClient.setQueryData(["event", event.id], event, { updatedAt: 0 });
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: ["event", id],
    queryFn: ({ signal }) => eventsApi.event(id, signal),
    staleTime: 0,
  });
}

// Cached discovery content changes on an explicit refresh or a relevant mutation,
// not just because a tab, browser window or network connection becomes active.
export const manualRefreshOptions = {
  staleTime: Infinity,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

export function homeEventsQueryOptions(api = eventsApi) {
  return queryOptions({
    ...manualRefreshOptions,
    queryKey: ["home-events"],
    queryFn: async ({ signal }) => {
      const pages: EventPage[] = [];
      for (let n = 1; ; n++) {
        const page = await api.page({}, n, signal);
        ensurePageProgress(
          page,
          mergePages(pages).map((e) => e.id),
        );
        pages.push(page);
        if (!nextPage(page)) return mergePages(pages);
      }
    },
  });
}

export function useHomeEvents() {
  return useQuery(homeEventsQueryOptions());
}
