import React from 'react';
import { View } from 'react-native';
import { UsersRound } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { eventsApi } from '../data/api';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { SocialPhoto } from './components';

export function EventFriendsPreview({ eventId }: { eventId: string }) {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['event-social', eventId, user?.id ?? 'guest'], staleTime: 120_000, queryFn: ({ signal }) => eventsApi.social(eventId, signal) });
  if (!query.data) return null;
  const friends = query.data.friends.filter(friend => friend.status !== 'interested').slice(0, 3);
  if (!query.data.goingCount && !friends.length) return null;
  const remaining = Math.max(0, query.data.goingCount - friends.length);
  return <View testID="event-card-friends" style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexShrink: 1 }}>
    <View style={{ flexDirection: 'row' }}>
      {friends.length ? friends.map((friend, i) => <SocialPhoto key={friend.id} uri={friend.avatarUrl} initial={friend.username} initialSize={10} style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#18181bcc', marginLeft: i ? -8 : 0 }} />)
        : <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#ffffff0d' }}><UsersRound size={14} color={colors.accent}/></View>}
    </View>
    {remaining > 0 && <Text style={{ color: '#d4d4d8', fontSize: 11, fontWeight: '600' }}>+{remaining}</Text>}
  </View>;
}
