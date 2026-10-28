import { GlassPressable } from '../ui/GlassPressable';
import { ActionIcon } from '../ui/ActionIcon';
import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { BadgeCheck, Ticket, UsersRound } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { accountApi, useAuth } from '../auth/AuthProvider';
import { usePreferences } from '../PreferencesProvider';
import { isEventId } from '../data/events';
import { createProfilesApi } from '../profiles/data';
import { publicProfileKey } from '../profiles/usePublicProfile';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { SocialPhoto } from './components';
import { parseEventFriends, type EventAttendee } from './eventAttendeesData';

const api = createProfilesApi(accountApi);
export function EventAttendees({ eventId, compact = false }: { eventId: string; compact?: boolean }) {
  const { user, controller } = useAuth(), { copy } = usePreferences(), token = controller.getToken();
  const [selected, setSelected] = useState<{ person: EventAttendee; viewer: string; event: string } | null>(null);
  const query = useQuery({ queryKey: ['event-friends', user?.id, eventId.toLowerCase()], enabled: !!user && isEventId(eventId), staleTime: 120_000,
    queryFn: async ({ signal }) => parseEventFriends(await accountApi('/events/' + eventId.toLowerCase() + '/attendees', { signal, token })) });
  useEffect(() => { setSelected(null); }, [eventId, user?.id]);
  const friends = query.data ?? [];
  if (!user || !friends.length) return null;
  const visible = friends.slice(0, compact ? 3 : 12);
  const avatars = <View style={{ flexDirection: 'row', flexWrap: compact ? 'nowrap' : 'wrap', gap: compact ? 0 : 8, marginTop: compact ? 0 : 12 }}>
    {visible.map((person, index) => <Pressable key={person.id} testID={'event-friend-' + person.id} accessibilityRole="button" accessibilityLabel={'@' + person.username}
      onPress={event => { event.stopPropagation(); setSelected({ person, viewer: user.id, event: eventId }); }}
      style={[s.avatar, { width: compact ? 32 : 40, height: compact ? 32 : 40, borderWidth: compact ? 2 : 1, borderColor: compact ? '#090b0a' : '#ffffff26', marginLeft: compact && index ? -8 : 0 }]}>
      <SocialPhoto uri={person.avatarUrl} initial={person.username} initialSize={compact ? 10 : 12} style={StyleSheet.absoluteFill} />
      {person.attendanceStatus === 'has_ticket' && <View style={[s.ticketBadge, { width: compact ? 14 : 16, height: compact ? 14 : 16 }]}><Ticket color="white" size={compact ? 8 : 10} /></View>}
    </Pressable>)}
  </View>;
  return <View testID="event-friends" style={compact ? undefined : { borderBottomWidth: 1, borderColor: '#ffffff1a', paddingBottom: 20 }}>
    {compact ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>{avatars}<Text style={{ color: '#ffffffa6', fontSize: 12, fontWeight: '500' }}>{copy('social.friendsGoing')}{friends.length > visible.length && <Text style={{ color: 'white' }}> +{friends.length - visible.length}</Text>}</Text></View>
      : <><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><UsersRound color={colors.accent} size={16} /><Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{copy('social.friendsGoing')}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{friends.length}</Text></View>{avatars}</>}
    {selected && selected.viewer === user.id && selected.event === eventId && <EventFriendProfilePopup key={selected.person.id + ':' + user.id} attendee={selected.person} viewerId={user.id} onClose={() => setSelected(null)} />}
  </View>;
}

export function EventFriendProfilePopup({ attendee, viewerId, onClose }: { attendee: EventAttendee; viewerId: string; onClose: () => void }) {
  const { user } = useAuth(), { copy } = usePreferences();
  const query = useQuery({ queryKey: publicProfileKey(attendee.id, viewerId), enabled: user?.id === viewerId,
    queryFn: ({ signal }) => api.profile(attendee.id, signal), staleTime: 60_000 });
  const profile = query.data ?? attendee, name = profile.role === 'organizer' ? profile.organizerName || profile.username : profile.username;
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [onClose]);
  if (user?.id !== viewerId) return null;
  return <Modal transparent animationType="none" visible onRequestClose={onClose} statusBarTranslucent>
    <View style={[s.overlay, Platform.OS === 'web' && ({ backdropFilter: 'blur(4px)' } as ViewStyle)]}>
      {Platform.OS !== 'web' && <BlurView pointerEvents="none" intensity={12} tint="dark" style={StyleSheet.absoluteFill} />}
      <Pressable testID="event-friend-backdrop" accessibilityRole="button" accessibilityLabel={copy('social.closeProfile')} onPress={onClose} style={StyleSheet.absoluteFill} />
      <View testID="event-friend-popup" accessibilityViewIsModal accessibilityLabel={copy('social.attendeeProfile', { name })} style={s.popup}>
        <GlassPressable fallback={Pressable} testID="event-friend-close" accessibilityRole="button" accessibilityLabel={copy('social.closeProfile')} onPress={onClose} style={s.close}><ActionIcon name="close" color={colors.muted} size={16} /></GlassPressable>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingRight: 36 }}><SocialPhoto uri={profile.avatarUrl} initial={profile.username} initialSize={18} style={s.profileAvatar} /><View style={{ flex: 1 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text numberOfLines={1} style={{ flexShrink: 1, color: colors.text, fontSize: 18, fontWeight: '600' }}>{name}</Text>{profile.organizerVerified && <BadgeCheck size={16} color={colors.accent} />}</View><Text style={{ marginTop: 2, color: colors.muted, fontSize: 14 }}>@{profile.username}</Text></View></View>
        {!!profile.bio && <Text numberOfLines={3} style={{ marginTop: 16, fontSize: 14, lineHeight: 24, color: colors.muted }}>{profile.bio}</Text>}
        <View style={s.attendance}>{attendee.attendanceStatus === 'has_ticket' ? <Ticket size={16} color={colors.accent} /> : <UsersRound size={16} color={colors.accent} />}<Text style={{ flexShrink: 1, fontSize: 12, fontWeight: '500', color: colors.muted }}>{copy(attendee.attendanceStatus === 'has_ticket' ? 'social.hasTicketForEvent' : 'social.goingToEvent')}</Text></View>
      </View>
    </View>
  </Modal>;
}
const s = StyleSheet.create({
  avatar: { position: 'relative', borderRadius: 99, overflow: 'hidden', backgroundColor: '#141414', justifyContent: 'center', alignItems: 'center' },
  ticketBadge: { position: 'absolute', bottom: 0, right: 0, borderRadius: 99, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000a6', padding: 20 },
  popup: { position: 'relative', width: '100%', maxWidth: 384, overflow: 'hidden', borderRadius: 24, borderWidth: 1, borderColor: '#ffffff26', backgroundColor: '#101311', padding: 20, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' },
  close: { position: 'absolute', right: 12, top: 12, zIndex: 1, width: 32, height: 32, borderRadius: 99, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#ffffff08', alignItems: 'center', justifyContent: 'center' },
  profileAvatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: '#ff004459', backgroundColor: '#ff00441a' },
  attendance: { marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#00000026', padding: 12 },
});
