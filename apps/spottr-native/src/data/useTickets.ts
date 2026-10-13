import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { accountApi, useAuth } from '../auth/AuthProvider';
import { ticketCache } from './ticketStorage';
import { canUseSavedTickets, ticketQueryOptions, type TicketData } from './ticketQuery';

export function useTickets(enabled = true, watchAdmission = false) {
  const { user, ready, controller } = useAuth(), client = useQueryClient();
  const accountId = user?.id ?? '', token = controller.getToken() ?? '';
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const current = () => controller.getToken() === token && controller.getSnapshot().user?.id === accountId;
  const query = useQuery({
    ...ticketQueryOptions(accountId, token, ticketCache, current,
      (owner, signal) => accountApi('/users/me/tickets', { token: owner, signal })),
    enabled: enabled && ready && !!accountId && !!token && foreground,
    refetchInterval: query => !foreground ? false
      : query.state.error || query.state.data?.source === 'saved' ? 15_000
      : watchAdmission ? 5_000 : false,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!enabled || !ready || !accountId || !token || !ticketCache.enabled) return;
    let alive = true;
    void ticketCache.load(accountId).then(snapshot => {
      if (!alive || !current() || !snapshot || snapshot.accountId !== accountId) return;
      const key = ['tickets', accountId];
      // A slow Keychain read must never restore an older/removed ticket over a
      // fresh API result, including a successful empty list.
      const state = client.getQueryState(key);
      if (state?.data !== undefined || state?.error && !canUseSavedTickets(state.error)) return;
      client.setQueryData<TicketData>(key, { ...snapshot, source: 'saved', storageError: false }, { updatedAt: 0 });
    }).catch(() => { /* API still works; no corrupt local credentials are shown. */ });
    return () => { alive = false; };
  }, [enabled, ready, accountId, token, client]);
  const snapshot = current() && canUseSavedTickets(query.error) ? query.data : undefined;
  return {
    ...query,
    data: snapshot?.tickets,
    isPending: snapshot ? false : query.isPending,
    isError: !snapshot && query.isError,
    offline: !!snapshot && (snapshot.source === 'saved' || !!query.error),
    savedAt: snapshot?.savedAt,
    storageError: snapshot?.storageError ?? false,
  };
}

/** Warm purchased tickets even before Profile opens; checkout invalidation also
 * reaches this observer. Poll only while recovery is needed, in foreground. */
export function TicketCacheSync() {
  useTickets(Platform.OS !== 'web');
  return null;
}
