import React from 'react';
import { StyleSheet, View } from 'react-native';
import { UsersRound } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '../auth/AuthProvider';
import { eventsApi } from '../data/api';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { GlassSurface, supportsLiquidGlass } from '../ui/GlassSurface';
import { SocialPhoto } from './components';

const previewQuery = (eventId: string, owner?: string) => ({
  queryKey: ['event-social', eventId, owner ?? 'guest'], staleTime: 120_000,
  queryFn: ({ signal }: { signal: AbortSignal }) => eventsApi.social(eventId, signal),
});

function EventFriendsActivity({ eventId, owner }: { eventId: string; owner?: string }) {
  const focused = useIsFocused();
  useQuery({ ...previewQuery(eventId, owner), enabled: focused });
  return null;
}

export function EventFriendsPreview({ eventId }: { eventId: string }) {
  const { user } = useAuth('account');
  // Focus only gates the request. Existing avatar/glass views remain untouched
  // when UIKit starts pushing Search over Home.
  const query = useQuery({ ...previewQuery(eventId, user?.id), enabled: false });
  const friends = query.data?.friends.filter(friend => friend.status !== 'interested').slice(0, 3) ?? [];
  const remaining = Math.max(0, (query.data?.goingCount ?? 0) - friends.length);
  return <><EventFriendsActivity eventId={eventId} owner={user?.id} />
    {(!!query.data?.goingCount || friends.length > 0) && <View testID="event-card-friends" style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexShrink: 1 }}>
    <View style={{ flexDirection: 'row' }}>
      {friends.length ? friends.map((friend, i) => supportsLiquidGlass
        ? <GlassSurface key={friend.id} testID="event-friend-avatar-glass" interactive={false} pointerEvents="none"
            style={[s.glassAvatar, { marginLeft: i ? -8 : 0 }]}>
            <SocialPhoto uri={friend.avatarUrl} initial={friend.username} initialSize={10} style={s.photo} />
          </GlassSurface>
        : <SocialPhoto key={friend.id} uri={friend.avatarUrl} initial={friend.username} initialSize={10} style={[s.avatar, { marginLeft: i ? -8 : 0 }]} />)
        : <GlassSurface testID="event-friends-icon-glass" interactive={false} pointerEvents="none" style={s.empty}><UsersRound size={14} color={colors.accent}/></GlassSurface>}
    </View>
    {remaining > 0 && <Text style={{ color: '#d4d4d8', fontSize: 11, fontWeight: '600' }}>+{remaining}</Text>}
  </View>}</>;
}

const s = StyleSheet.create({
  avatar: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#18181bcc' },
  glassAvatar: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // Expose a 1pt ring of the native glass; the photo stays sharp inside it.
  photo: { width: 22, height: 22, borderRadius: 11 },
  empty: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#ffffff0d' },
});
