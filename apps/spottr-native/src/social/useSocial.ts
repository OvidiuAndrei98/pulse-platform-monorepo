import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { accountApi, useAuth } from '../auth/AuthProvider';
import { manualRefreshOptions, queryClient } from '../data/queries';
import { parseFeed, parseFriends, type Friend } from './data';
import { removeNotifications, type NotificationList } from '../notifications/data';

export function useSocial({ includeFriends = true, includeFeed = true }: { includeFriends?: boolean; includeFeed?: boolean } = {}) {
  const focused = useIsFocused();
  const { user, controller } = useAuth('account');
  const id = user?.id, eligible = !!user && user.role !== 'organizer';
  const friends = useQuery({ queryKey: ['friends', id], enabled: focused && eligible && includeFriends, staleTime: 60_000,
    queryFn: async ({ signal }) => parseFriends(await accountApi('/friends', { signal })) });
  const requests = useQuery({ queryKey: ['friend-requests', id], enabled: focused && eligible, staleTime: 60_000,
    queryFn: async ({ signal }) => parseFriends(await accountApi('/friends/requests', { signal })) });
  const feed = useQuery({ ...manualRefreshOptions, queryKey: ['social-feed', id], enabled: focused && !!id && includeFeed,
    queryFn: async ({ signal }) => parseFeed(await accountApi('/feed', { signal })) });
  useFocusEffect(useCallback(() => {
    if (!id) return;
    // Revalidate quietly on return; retained rows keep their reading position.
    if (includeFeed) void feed.refetch({ cancelRefetch: false });
    if (eligible) {
      if (includeFriends) void friends.refetch({ cancelRefetch: false });
      void requests.refetch({ cancelRefetch: false });
    }
  }, [id, eligible, includeFeed, includeFriends, friends.refetch, requests.refetch, feed.refetch]));
  const [pendingId, setPendingId] = useState<string | null>(null), [error, setError] = useState(false);
  const busy = useRef(false), revision = useRef(0);
  useEffect(() => { revision.current++; busy.current = false; setPendingId(null); setError(false); return () => { revision.current++; }; }, [id]);
  const change = async (friendId: string, status?: 'accepted' | 'declined', notificationId?: string) => {
    if (!eligible || !id || busy.current) return false;
    const token = controller.getToken();
    if (!token) return false;
    busy.current = true; setPendingId(friendId); setError(false);
    const generation = revision.current;
    try {
      const result = await accountApi<{ removedNotificationIds?: unknown }>(status ? '/friends/request/' + encodeURIComponent(friendId) : '/friends/' + encodeURIComponent(friendId), {
        method: status ? 'PUT' : 'DELETE', body: status ? { status, ...(notificationId ? { notificationId } : {}) } : undefined, token,
      });
      if (generation !== revision.current || controller.getToken() !== token || controller.getSnapshot().user?.id !== id) return false;
      const key = [status ? 'friend-requests' : 'friends', id];
      await queryClient.cancelQueries({ queryKey: key });
      if (generation !== revision.current || controller.getToken() !== token) return false;
      queryClient.setQueryData<Friend[]>(key, current => (current ?? []).filter(friend => friend.id !== friendId));
      if (status === 'declined' && Array.isArray(result?.removedNotificationIds)) {
        const removed = result.removedNotificationIds.filter((value): value is string => typeof value === 'string');
        const noticeKey = ['notifications', id];
        await queryClient.cancelQueries({ queryKey: noticeKey });
        if (generation !== revision.current || controller.getToken() !== token) return false;
        queryClient.setQueryData<NotificationList>(noticeKey, current => removeNotifications(current, removed));
        void queryClient.invalidateQueries({ queryKey: noticeKey });
      }
      void queryClient.invalidateQueries({ queryKey: ['friend-requests', id] });
      void queryClient.invalidateQueries({ queryKey: ['friends', id] });
      void queryClient.invalidateQueries({ queryKey: ['social-feed', id] });
      void queryClient.invalidateQueries({ queryKey: ['public-profile', id] });
      void queryClient.invalidateQueries({ queryKey: ['profile-search', id] });
      return true;
    } catch { if (generation === revision.current && controller.getToken() === token) setError(true); return false; }
    finally { if (generation === revision.current) { busy.current = false; setPendingId(null); } }
  };
  return { friends, requests, feed, pendingId, error, respond: (id: string, status: 'accepted' | 'declined', notificationId?: string) => change(id, status, notificationId), remove: (id: string) => change(id) };
}
