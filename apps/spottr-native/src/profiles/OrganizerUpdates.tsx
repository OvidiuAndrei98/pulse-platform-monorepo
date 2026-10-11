import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CalendarClock } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { profilesApi } from './usePublicProfile';
import { Text } from '../ui/Text';
import { EventImage, Feedback } from '../ui/common';
import { colors } from '../ui/theme';
import { usePreferences } from '../PreferencesProvider';

export function OrganizerUpdates({ id, kind, openEvent }: { id: string; kind: 'events' | 'organizers'; openEvent: (id: string) => void }) {
  const { user } = useAuth(), { copy, language } = usePreferences();
  const query = useQuery({ queryKey: ['organizer-updates', kind, id, user?.id ?? 'guest'], queryFn: ({ signal }) => profilesApi.updates(kind, id, signal) });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const expiration = Math.min(...(query.data ?? []).map(update => Date.parse(update.expiresAt)).filter(time => time > now));
    if (!Number.isFinite(expiration)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(2147483647, Math.max(1, expiration - Date.now())));
    return () => clearTimeout(timer);
  }, [query.data, now]);
  const updates = (query.data ?? []).filter(update => Date.parse(update.expiresAt) > now);
  if (!query.isPending && !query.isError && !updates.length) return null;
  return <View testID="organizer-updates" style={{ gap: 12 }}>
    <Text style={{ fontSize: 14, fontWeight: '600', color: '#ffffffe6' }}>{copy('organizerUpdates.title')}</Text>
    {query.isError && <Feedback compact title={copy('feedback.loadFailed')} retry={() => void query.refetch()} />}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
      {query.isPending ? [0, 1].map(key => <View key={key} style={{ width: 192, height: 176, borderRadius: 16, backgroundColor: '#ffffff0d' }} />) : updates.map(update => <View key={update.id} testID={'organizer-update-' + update.id} style={{ width: 192, height: 176, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#ffffff1a' }}>
        <EventImage uri={update.imageUrl} style={StyleSheet.absoluteFill} />
        <LinearGradient pointerEvents="none" colors={['transparent', '#00000040', '#000000e6']} style={StyleSheet.absoluteFill} />
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: 12 }}>
          {kind === 'organizers' && <Pressable accessibilityRole="button" onPress={() => openEvent(update.eventId)}><Text numberOfLines={1} style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>{update.eventTitle}</Text></Pressable>}
          {!!update.caption && <Text numberOfLines={2} style={{ marginTop: 4, color: 'white', fontSize: 12, lineHeight: 16 }}>{update.caption}</Text>}
          <View style={{ marginTop: 8, flexDirection: 'row', gap: 4, alignItems: 'center' }}><CalendarClock color="#ffffffa6" size={12} /><Text style={{ fontSize: 10, color: '#ffffffa6' }}>{copy('organizerUpdates.expires', { time: new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(new Date(update.expiresAt)) })}</Text></View>
        </View>
      </View>)}
    </ScrollView>
  </View>;
}
