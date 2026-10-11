import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useIsFocused } from '@react-navigation/native';
import { accountApi, useAuth } from '../auth/AuthProvider';
import { queryClient } from '../data/queries';
import { createProfilesApi, profileAction, type PublicProfile } from './data';

export const profilesApi = createProfilesApi(accountApi);
export const publicProfileKey = (id: string, viewer?: string) => ['public-profile', viewer ?? 'guest', id.toLowerCase()] as const;
export function usePublicProfile(id: string) {
  const { user, ready } = useAuth(), focused = useIsFocused();
  const query = useQuery({ queryKey: publicProfileKey(id, user?.id), enabled: ready,
    queryFn: ({ signal }) => profilesApi.profile(id, signal) });
  useEffect(() => { if (focused && ready) void query.refetch({ cancelRefetch: false }); }, [focused, ready, id, user?.id, query.refetch]);
  return query;
}
export function useProfileAction(profile: PublicProfile) {
  const { user, controller } = useAuth();
  const action = profileAction(profile, user), key = publicProfileKey(profile.id, user?.id);
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const lock = useRef(false), revision = useRef(0);
  useEffect(() => { revision.current++; lock.current = false; setBusy(false); setError(false); return () => { revision.current++; }; }, [profile.id, user?.id]);
  const run = async () => {
    const token = controller.getToken();
    if (!user || !token || lock.current || !action || action === 'signin' || action === 'pending') return;
    lock.current = true; setBusy(true); setError(false);
    const generation = revision.current;
    const current = () => generation === revision.current && token === controller.getToken();
    let previous: PublicProfile | undefined;
    try {
      await queryClient.cancelQueries({ queryKey: key });
      if (!current()) return;
      previous = queryClient.getQueryData<PublicProfile>(key) ?? profile;
      if (action === 'follow' || action === 'unfollow') queryClient.setQueryData(key, {
        ...previous, followsOrganizer: action === 'follow', followerCount: Math.max(0, previous.followerCount + (action === 'follow' ? 1 : -1)),
      });
      const patch = await profilesApi.change(previous, action, token);
      if (!current()) return;
      await queryClient.cancelQueries({ queryKey: key });
      if (!current()) return;
      queryClient.setQueryData(key, { ...previous, ...patch });
      void queryClient.invalidateQueries({ queryKey: key });
      for (const name of ['friends', 'friend-requests', 'social-feed', 'profile-search', 'event-social', 'event-friends']) void queryClient.invalidateQueries({ queryKey: [name] });
    } catch {
      if (current()) {
        if (previous) queryClient.setQueryData(key, previous);
        setError(true);
        // Another device may have changed or removed the request meanwhile.
        void queryClient.invalidateQueries({ queryKey: key });
      }
    } finally { if (generation === revision.current) { lock.current = false; setBusy(false); } }
  };
  return { action, busy, error, run };
}
