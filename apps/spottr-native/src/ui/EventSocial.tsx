import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ticket, UsersRound } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { accountApi, useAuth } from '../auth/AuthProvider';
import { eventsApi, parseEventSocial } from '../data/api';
import { queryClient } from '../data/queries';
import { usePreferences } from '../PreferencesProvider';
import { Text } from './Text';
import { Feedback } from './common';
import { colors } from './theme';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootParamList } from '../navigation/types';

export function EventSocial({ eventId, signIn }: { eventId: string; signIn: () => void }) {
  const { user, controller } = useAuth(), { copy } = usePreferences(), navigation = useNavigation<NativeStackNavigationProp<RootParamList>>();
  const key = ['event-social', eventId, user?.id ?? 'guest'];
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => eventsApi.social(eventId, signal) });
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const pending = useRef(false), revision = useRef(0);
  useEffect(() => { revision.current++; setBusy(false); pending.current = false; setError(false); return () => { revision.current++; }; }, [eventId, user?.id]);
  const update = async (status: 'interested' | 'going') => {
    if (!user || pending.current || !query.data || query.data.currentUserStatus === 'has_ticket') return;
    const version = revision.current, token = controller.getToken();
    pending.current = true; setBusy(true); setError(false);
    try {
      await queryClient.cancelQueries({ queryKey: key });
      if (version !== revision.current) return;
      const result = parseEventSocial(await accountApi('/events/' + eventId + '/rsvp', { token, method: query.data.currentUserStatus === status ? 'DELETE' : 'PUT', ...(query.data.currentUserStatus === status ? {} : { body: { status } }) }));
      if (version !== revision.current || controller.getToken() !== token) return;
      queryClient.setQueryData(key, result);
      for (const name of ['social-feed', 'event-friends']) void queryClient.invalidateQueries({ queryKey: [name] });
    } catch { if (version === revision.current) setError(true); }
    finally { if (version === revision.current) { pending.current = false; setBusy(false); } }
  };
  return <View style={s.container}>
    {query.data ? <View style={s.row}>
      <View style={s.count}><UsersRound size={16} color={colors.accent} /><Text style={s.text}>{copy('social.attendeesGoing', { count: query.data.goingCount })}<Text style={{ color: colors.muted }}> · {copy('social.interestedCount', { count: query.data.interestedCount })}</Text></Text></View>
      {query.data.currentUserStatus === 'has_ticket' ? <View style={s.row}>
        <View style={[s.pill, { backgroundColor: '#ff004426', borderColor: '#ff004466', flexDirection: 'row', gap: 6, alignItems: 'center' }]}><Ticket size={14} color={colors.accent} /><Text style={[s.small, { color: colors.accent }]}>{copy('social.ticketHolder')}</Text></View>
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate('SafetyGroup', { eventId })} style={[s.pill, { borderColor: '#34d39959', backgroundColor: '#34d3991a' }]}><Text style={[s.small, { color: '#6ee7b7' }]}>{copy('safetyGroup.openOrCreate')}</Text></Pressable>
      </View> : user ? <View style={s.switch}>{(['interested', 'going'] as const).map(status => <Pressable testID={'event-rsvp-' + status} key={status} accessibilityRole="button" accessibilityState={{ selected: query.data.currentUserStatus === status, disabled: busy }} disabled={busy} onPress={() => void update(status)} style={[s.option, query.data.currentUserStatus === status && { backgroundColor: colors.accent }, busy && { opacity: .5 }]}><Text style={[s.small, query.data.currentUserStatus === status && { color: 'white' }]}>{copy('social.' + status)}</Text></Pressable>)}</View> : <Pressable testID="event-sign-in" accessibilityRole="button" onPress={signIn} style={s.pill}><Text style={s.small}>{copy('social.signInToRsvp')}</Text></Pressable>}
    </View> : <Feedback compact title={copy(query.isError ? 'feedback.loadFailed' : 'common.loading')} retry={query.isError ? () => void query.refetch() : undefined} />}
    {error && <Feedback compact title={copy('feedback.actionFailed')} />}
  </View>;
}
const s = StyleSheet.create({ container: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#ffffff1a', paddingVertical: 16, gap: 12 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }, count: { flexDirection: 'row', alignItems: 'center', gap: 10 }, text: { color: colors.text, fontSize: 14, fontWeight: '600' }, small: { color: colors.muted, fontSize: 12, fontWeight: '600' }, pill: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: '#ffffff26', borderRadius: 99 }, switch: { height: 36, flexDirection: 'row', padding: 2, borderRadius: 99, backgroundColor: '#ffffff0a', borderWidth: 1, borderColor: '#ffffff26' }, option: { borderRadius: 99, paddingHorizontal: 12, justifyContent: 'center' } });
