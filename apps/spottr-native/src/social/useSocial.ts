import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { accountApi, useAuth } from '../auth/AuthProvider';
import { manualRefreshOptions, queryClient } from '../data/queries';
import { parseFeed, parseFriends, type Friend } from './data';

export function useSocial() {
  const { user, controller } = useAuth();
  const id = user?.id, eligible = !!user && user.role !== 'organizer';
  const friends = useQuery({ queryKey: ['friends', id], enabled: eligible, staleTime: 60_000,
    queryFn: async ({ signal }) => parseFriends(await accountApi('/friends', { signal })) });
  const requests = useQuery({ queryKey: ['friend-requests', id], enabled: eligible, staleTime: 60_000,
    queryFn: async ({ signal }) => parseFriends(await accountApi('/friends/requests', { signal })) });
  const feed = useQuery({ ...manualRefreshOptions, queryKey: ['social-feed', id], enabled: !!id,
    queryFn: async ({ signal }) => parseFeed(await accountApi('/feed', { signal })) });
  useFocusEffect(useCallback(() => {
    if (!id) return;
    // Friendship controls stay current. Feed rows refresh only on a user pull
    // or after an explicit friendship mutation, preserving their reading position.
    if (eligible) {
      void friends.refetch({ cancelRefetch: false });
      void requests.refetch({ cancelRefetch: false });
    }
  }, [id, eligible, friends.refetch, requests.refetch]));
  const [pendingId, setPendingId] = useState<string | null>(null), [error, setError] = useState(false);
  const busy = useRef(false), revision = useRef(0);
  useEffect(() => { revision.current++; busy.current = false; setPendingId(null); setError(false); return () => { revision.current++; }; }, [id]);
  const change = async (friendId: string, status?: 'accepted' | 'declined') => {
    if (!eligible || !id || busy.current) return;
    const token = controller.getToken();
    if (!token) return;
    busy.current = true; setPendingId(friendId); setError(false);
    const generation = revision.current;
    try {
      await accountApi(status ? '/friends/request/' + encodeURIComponent(friendId) : '/friends/' + encodeURIComponent(friendId), {
        method: status ? 'PUT' : 'DELETE', body: status ? { status } : undefined, token,
      });
      if (generation !== revision.current || controller.getToken() !== token || controller.getSnapshot().user?.id !== id) return;
      const key = [status ? 'friend-requests' : 'friends', id];
      await queryClient.cancelQueries({ queryKey: key });
      if (generation !== revision.current || controller.getToken() !== token) return;
      queryClient.setQueryData<Friend[]>(key, current => (current ?? []).filter(friend => friend.id !== friendId));
      void queryClient.invalidateQueries({ queryKey: ['friends', id] });
      void queryClient.invalidateQueries({ queryKey: ['social-feed', id] });
      void queryClient.invalidateQueries({ queryKey: ['public-profile', id] });
      void queryClient.invalidateQueries({ queryKey: ['profile-search', id] });
    } catch { if (generation === revision.current && controller.getToken() === token) setError(true); }
    finally { if (generation === revision.current) { busy.current = false; setPendingId(null); } }
  };
  return { friends, requests, feed, pendingId, error, respond: (id: string, status: 'accepted' | 'declined') => change(id, status), remove: (id: string) => change(id) };
}
