import type { Query,QueryClient } from '@tanstack/react-query';

/** These queries use createEventsApi's unauthenticated GET path and contain
 * normalized public event data only. Social, tickets, profiles, favorites and
 * dashboard data deliberately do not qualify, even with similar key names. */
export function publicSessionQuery(query:Pick<Query,'queryKey'>) {
  const [name,parameter]=query.queryKey;
  return (name==='home-events'||name==='promotions')&&query.queryKey.length===1
    || name==='events'&&query.queryKey.length===2&&!!parameter&&typeof parameter==='object'
    || name==='event'&&query.queryKey.length===2&&typeof parameter==='string';
}

export function clearAccountQueries(client:QueryClient) {
  const predicate=(query:Query)=>!publicSessionQuery(query);
  // Cancellation runs synchronously up to the query's AbortSignal. Remove all
  // private results immediately; old requests cannot repopulate the new account.
  void client.cancelQueries({predicate});
  client.removeQueries({predicate});
  client.getMutationCache().clear();
}
