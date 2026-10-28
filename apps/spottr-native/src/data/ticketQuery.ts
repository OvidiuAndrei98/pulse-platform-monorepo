import { queryOptions } from '@tanstack/react-query';
import { ApiError } from './http';
import { parseTickets } from './tickets';
import type { SavedTickets, TicketCache } from './ticketCache';
import { observeOperation } from '../diagnostics/handled';

export type TicketData = SavedTickets & { source: 'saved' | 'server'; storageError: boolean };
export function canUseSavedTickets(error: unknown): boolean {
  if (!error) return true;
  if (error instanceof ApiError) return error.code === 'TIMEOUT' || error.status >= 500 || error.status === 429;
  return error instanceof TypeError || error instanceof Error && error.name !== 'AbortError';
}

export function ticketQueryOptions(accountId: string, token: string, cache: TicketCache,
  current: () => boolean, fetchTickets: (token: string, signal: AbortSignal) => Promise<unknown>) {
  return queryOptions({
    queryKey: ['tickets', accountId],
    staleTime: 30_000,
    retry: false,
    refetchOnMount: 'always',
    queryFn: async ({ signal }): Promise<TicketData> => {
      const active = () => current() && !signal.aborted;
      const assertActive = () => { if (!active()) throw new Error('TICKET_SESSION_CHANGED'); };
      assertActive();
      let value: unknown;
      try { value = await fetchTickets(token, signal); }
      catch (error) {
        if (active() && error instanceof ApiError && [401, 403].includes(error.status)) await cache.remove(accountId).catch(() => {});
        throw error;
      }
      assertActive();
      const snapshot: SavedTickets = { accountId, savedAt: Date.now(), tickets: await observeOperation('tickets_load', async () => parseTickets(value)) };
      let storageError = false;
      try { await cache.save(snapshot, active); } catch { storageError = true; }
      assertActive();
      return { ...snapshot, source: 'server', storageError };
    },
  });
}
