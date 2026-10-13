import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useIsFocused } from '@react-navigation/native';
import { accountApi, useAuth } from '../auth/AuthProvider';
import { queryClient } from '../data/queries';
import { parseNotifications, markNotificationRead, type Notification, type NotificationList } from './data';

export function useNotifications() {
  const { user, controller } = useAuth(), focused = useIsFocused(), id = user?.id;
  const key = ['notifications', id];
  const query = useQuery({ queryKey: key, enabled: !!id, staleTime: 30_000, refetchInterval: focused ? 30_000 : false, refetchIntervalInBackground: false,
    queryFn: async ({ signal }) => parseNotifications(await accountApi('/notifications', { signal })) });
  const [actionError, setActionError] = useState(false), pending = useRef(new Set<string>()), revision = useRef(0);
  const [markingAll, setMarkingAll] = useState(false), allPending = useRef<object | null>(null);
  useEffect(() => { revision.current++; pending.current = new Set(); allPending.current = null; setMarkingAll(false); setActionError(false); return () => { revision.current++; allPending.current = null; }; }, [id]);
  const markRead = async (item: Notification) => {
    const token = controller.getToken(), generation = revision.current, running = pending.current;
    if (!id || !token || item.isRead || running.has(item.id)) return;
    running.add(item.id); setActionError(false);
    const currentSession = () => revision.current === generation && controller.getToken() === token && controller.getSnapshot().user?.id === id;
    try {
      await accountApi('/notifications/' + encodeURIComponent(item.id) + '/read', { method: 'POST', token });
      if (!currentSession()) return;
      // An older poll cannot revert a successful read or decrement it twice.
      await queryClient.cancelQueries({ queryKey: key });
      if (!currentSession()) return;
      queryClient.setQueryData<NotificationList>(key, current => markNotificationRead(current, item.id));
      void queryClient.invalidateQueries({ queryKey: key });
    } catch { if (currentSession()) setActionError(true); }
    finally { running.delete(item.id); }
  };
  const markAllRead = async () => {
    const token = controller.getToken(), generation = revision.current;
    if (!id || !token || allPending.current) return;
    const currentSession = () => revision.current === generation && controller.getToken() === token;
    const operation = {};
    allPending.current = operation; setMarkingAll(true); setActionError(false);
    try {
      await accountApi('/notifications/read-all', { method: 'POST', token });
      if (!currentSession()) return;
      await queryClient.cancelQueries({ queryKey: key });
      if (!currentSession()) return;
      // Refetch the authoritative count: new notifications may have arrived
      // during this write, and the unread total can extend beyond the first page.
      await query.refetch({ throwOnError: true });
    } catch { if (currentSession()) setActionError(true); }
    finally { if (allPending.current === operation) { allPending.current = null; setMarkingAll(false); } }
  };
  return { ...query, actionError, markRead, markingAll, markAllRead };
}
