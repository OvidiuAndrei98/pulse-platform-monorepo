import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { ArrowUpRight, Calendar, Check, ImageIcon, Ticket, X } from 'lucide-react-native';
import { AppSheetTextInput } from '../ui/AppSheetTextInput';
import { Search } from 'lucide-react-native';
import { usePreferences } from '../PreferencesProvider';
import { useSocial } from './useSocial';
import type { FeedGroup, Friend } from './data';
import { Text } from '../ui/Text';
import { AppSheet } from '../ui/AppSheet';
import { AppSheetScrollView } from '../ui/AppSheetScrollView';
import { Feedback } from '../ui/common';
import { colors } from '../ui/theme';
import { formatDate } from '../data/events';

export function SocialPhoto({ uri, style, contain, initial, initialSize = 12 }: { uri?: string; style: StyleProp<ViewStyle>; contain?: boolean; initial?: string; initialSize?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  return <View style={[{ overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff09' }, style]}>
    {uri && !failed ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit={contain ? 'contain' : 'cover'} draggable={false} onError={() => setFailed(true)} />
      : initial ? <Text style={{ color: colors.accent, fontSize: initialSize, fontWeight: '600' }}>{initial.slice(0, 1).toUpperCase()}</Text> : <ImageIcon color="#ff004459" size={24} />}
  </View>;
}
export function FriendIdentity({ friend, open, size = 44, fallback }: { friend: Friend; open: () => void; size?: number; fallback?: string }) {
  return <Pressable accessibilityRole="button" onPress={open} style={s.identity}>
    <SocialPhoto uri={friend.avatarUrl} initial={friend.username} style={{ height: size, width: size, borderRadius: size / 2, borderWidth: 1, borderColor: '#ffffff26' }} />
    <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={s.name}>{friend.username}</Text>
      {!!(friend.bio || fallback) && <Text numberOfLines={1} style={[s.muted, { marginTop: 4 }]}>{friend.bio || fallback}</Text>}</View>
  </Pressable>;
}
export function FriendsListSheet({ social, close, openProfile, manage }: { social: ReturnType<typeof useSocial>; close: () => void; openProfile: (id: string) => void; manage: () => void }) {
  const { copy } = usePreferences(), [query, setQuery] = useState('');
  const friends = social.friends.data ?? [], requests = social.requests.data ?? [];
  const matches = friends.filter(friend => friend.username.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <AppSheet open onClose={close} label={copy('common.close')} testID="friends-sheet">
    <View style={{ paddingHorizontal: 20, paddingBottom: 20, paddingTop: 4 }}><Text style={{ color: 'white', fontSize: 24, fontWeight: '700', letterSpacing: -0.8 }}>{copy('friends.title')}</Text>
      <Text style={[s.muted, { marginTop: 8 }]}>{social.friends.isPending ? copy('common.loading') : social.friends.isError && !social.friends.data ? '—' : copy('friends.count', { count: friends.length })}</Text></View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginBottom: 16, borderRadius: 16, backgroundColor: '#161616', paddingHorizontal: 16 }}>
      <Search color="#ffffff66" size={16} /><AppSheetTextInput testID="friends-sheet-search" value={query} onChangeText={setQuery} placeholder={copy('friends.searchPlaceholder')} accessibilityLabel={copy('friends.searchPlaceholder')} placeholderTextColor="#ffffff59" style={{ flex: 1, minWidth: 0, height: 48, fontSize: 16, color: 'white' }} /></View>
    <AppSheetScrollView testID="friends-sheet-list" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }}>
      {social.requests.isError && !!social.requests.data && <Feedback compact title={copy('feedback.actionFailed')} retry={() => void social.requests.refetch()} />}
      {social.requests.isPending ? <View style={s.skeleton} /> : social.requests.isError && !social.requests.data ? <Feedback compact title={copy('feedback.actionFailed')} retry={() => void social.requests.refetch()} /> : requests.length > 0 && <View style={{ marginBottom: 24 }}>
        <Text style={[s.muted, { marginBottom: 8 }]}>{copy('feed.friendRequests')}</Text>
        {requests.map(request => <View key={request.id} style={s.request}>
          <FriendIdentity friend={request} open={() => { close(); openProfile(request.id); }} />
          <Pressable testID={'friend-accept-' + request.id} accessibilityRole="button" accessibilityLabel={copy('feed.acceptRequest', { name: request.username })} disabled={!!social.pendingId} onPress={() => void social.respond(request.id, 'accepted')} style={[s.action, { backgroundColor: colors.accent, opacity: social.pendingId ? 0.4 : 1 }]}>
            {social.pendingId === request.id ? <ActivityIndicator size="small" color="white" /> : <Check size={16} color="white" />}</Pressable>
          <Pressable testID={'friend-decline-' + request.id} accessibilityRole="button" accessibilityLabel={copy('feed.declineRequest', { name: request.username })} disabled={!!social.pendingId} onPress={() => void social.respond(request.id, 'declined')} style={[s.action, { opacity: social.pendingId ? 0.4 : 1 }]}><X size={16} color="white" /></Pressable>
        </View>)}
      </View>}
      {social.error && <Feedback compact title={copy('feedback.actionFailed')} />}
      {social.friends.isError && !!social.friends.data && <Feedback compact title={copy('feedback.actionFailed')} retry={() => void social.friends.refetch()} />}
      {social.friends.isPending ? <View style={[s.skeleton, { height: 112 }]} /> : social.friends.isError && !social.friends.data ? <Feedback compact title={copy('feedback.actionFailed')} retry={() => void social.friends.refetch()} /> : matches.length ? matches.map(friend => <View key={friend.id} style={s.friend}>
        <FriendIdentity friend={friend} open={() => { close(); openProfile(friend.id); }} /><ArrowUpRight size={16} color="#ffffff40" />
      </View>) : <Text style={[s.muted, { textAlign: 'center', paddingVertical: 32, fontSize: 14, lineHeight: 24 }]}>{copy(friends.length ? 'friends.noMatch' : 'friends.emptyHint')}</Text>}
      <Pressable testID="friends-manage" accessibilityRole="button" onPress={manage} style={s.manage}><Text style={s.name}>{copy('feed.manageFriends')}</Text><ArrowUpRight size={16} color={colors.accent} /></Pressable>
    </AppSheetScrollView>
  </AppSheet>;
}
export function FeedCard({ item, openEvent, openProfile }: { item: FeedGroup; openEvent: (id: string) => void; openProfile: (id: string) => void }) {
  const { copy, language } = usePreferences(), actor = item.actors[0];
  if (!actor) return null;
  const name = item.kind === 'friends' ? item.actors.length > 1 ? copy('feed.andOtherFriends', { name: actor.actorUsername, count: item.actors.length - 1 }) : actor.actorUsername : item.organizerName || actor.actorUsername;
  const verb = item.kind === 'update' ? 'feed.publishedUpdate' : item.kind === 'organizer' ? 'feed.publishedEvent' : item.ticketActors.length && item.goingActors.length ? 'feed.gettingReady' : item.ticketActors.length ? 'feed.haveTickets' : 'feed.goingTo';
  return <View style={{ borderBottomWidth: 1, borderBottomColor: '#ffffff14', paddingBottom: 24, marginBottom: 24 }}>
    <View style={{ flexDirection: 'row', gap: 12, paddingBottom: 16, alignItems: 'center' }}>
      <Pressable accessibilityRole="button" accessibilityLabel={copy('feed.viewProfile', { name: actor.actorUsername })} onPress={() => openProfile(actor.actorId)}><SocialPhoto uri={actor.actorAvatarUrl} initial={actor.actorUsername} style={{ height: 40, width: 40, borderRadius: 20, borderWidth: 1, borderColor: '#ffffff26' }} /></Pressable>
      <View style={{ flex: 1, minWidth: 0 }}><Pressable accessibilityRole="button" onPress={() => openProfile(actor.actorId)}><Text numberOfLines={1} style={s.name}>{name}</Text></Pressable><Text style={[s.muted, { lineHeight: 20, marginTop: 2 }]}>{copy(verb)}</Text></View>
      <Text style={{ color: '#ffffff59', fontSize: 11, alignSelf: 'flex-start', paddingTop: 2 }}>{new Date(item.occurredAt).toLocaleDateString(language, { day: 'numeric', month: 'short' })}</Text>
    </View>
    {item.kind === 'update' && !!item.organizerUpdateCaption && <Text style={{ paddingBottom: 16, color: '#ffffffbf', fontSize: 14, lineHeight: 24 }}>{item.organizerUpdateCaption}</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel={copy('feed.viewTickets') + ': ' + item.eventTitle} onPress={() => openEvent(item.eventId)}>
      {item.kind === 'update' && !!item.organizerUpdateImageUrl && <SocialPhoto uri={item.organizerUpdateImageUrl} contain style={{ aspectRatio: 4 / 3, width: '100%', borderRadius: 16, marginBottom: 16 }} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: '#ffffff09' }}>
        <SocialPhoto uri={item.eventBannerUrl} style={{ width: 56, height: 64, borderRadius: 8 }} />
        <View style={{ flex: 1, minWidth: 0 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}><Calendar size={12} color="#ffffff80" /><Text style={s.muted}>{formatDate(item.eventStartTime, language, false, { year: true, deviceTime: true })}</Text></View>
          <Text style={{ color: 'white', fontSize: 16, fontWeight: '600', lineHeight: 22, letterSpacing: -0.3 }}>{item.eventTitle}</Text>
          {item.kind === 'friends' && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>{item.ticketActors.length > 0 && <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Ticket size={12} color="#ffffff80" /><Text style={{ color: '#ffffff80', fontSize: 11 }}>{copy('feed.withTicket', { count: item.ticketActors.length })}</Text></View>}{item.goingActors.length > 0 && <Text style={{ color: '#ffffff80', fontSize: 11 }}>{copy('feed.going', { count: item.goingActors.length })}</Text>}</View>}
        </View><ArrowUpRight size={16} color="#ffffff66" />
      </View>
    </Pressable>
  </View>;
}
const s = StyleSheet.create({
  identity: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }, name: { color: 'white', fontSize: 14, fontWeight: '600' }, muted: { color: '#ffffff73', fontSize: 12 },
  request: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, backgroundColor: '#141113', padding: 12, marginBottom: 8 },
  action: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff0d', alignItems: 'center', justifyContent: 'center' },
  friend: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, paddingHorizontal: 8, paddingVertical: 12 },
  manage: { minHeight: 48, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 99, backgroundColor: '#161616', paddingHorizontal: 16, marginTop: 20 },
  skeleton: { height: 56, marginBottom: 20, borderRadius: 12, backgroundColor: '#ffffff0d' },
});
