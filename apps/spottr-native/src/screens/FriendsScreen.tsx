import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, UserMinus, UserRoundPlus, UsersRound, Search } from 'lucide-react-native';
import type { FeedParamList, RootParamList } from '../navigation/types';
import { useAuth } from '../auth/AuthProvider';
import { usePreferences } from '../PreferencesProvider';
import { useSocial } from '../social/useSocial';
import { groupFeedItems } from '../social/data';
import { FeedCard, FriendIdentity, FriendsListSheet } from '../social/components';
import { Text } from '../ui/Text';
import { Feedback, Loading } from '../ui/common';
import { colors } from '../ui/theme';
import { RefreshScrollView } from '../ui/RefreshScrollView';

type Navigation = CompositeNavigationProp<NativeStackNavigationProp<FeedParamList>, NativeStackNavigationProp<RootParamList>>;
export function FriendsScreen() {
  const { copy } = usePreferences(), { user, ready } = useAuth(), safe = useSafeAreaInsets(), social = useSocial();
  const navigation = useNavigation<Navigation>(), [open, setOpen] = useState(false), [visible, setVisible] = useState(8);
  const organizer = user?.role === 'organizer';
  const [refreshing, setRefreshing] = useState(false), refreshPending = useRef(false);
  const refresh = async () => {
    if (!user || refreshPending.current) return;
    refreshPending.current = true; setRefreshing(true);
    try {
      await Promise.allSettled([social.feed.refetch({ cancelRefetch: false }), ...(organizer ? [] : [social.friends.refetch({ cancelRefetch: false }), social.requests.refetch({ cancelRefetch: false })])]);
    } finally { refreshPending.current = false; setRefreshing(false); }
  };
  useEffect(() => { setOpen(false); setVisible(8); }, [user?.id]);
  const groups = useMemo(() => groupFeedItems((social.feed.data ?? []).filter(item => !organizer || item.activityType === 'organizer_event' || item.activityType === 'organizer_update')), [social.feed.data, organizer]);
  const openProfile = (id: string) => navigation.navigate('PublicProfile', { id });
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <RefreshScrollView testID="feed-list" refreshing={refreshing} onRefresh={user ? refresh : undefined} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: Math.max(24, safe.top), paddingBottom: 128 }}>
      {!ready ? <Loading /> : !user ? <>
        <Text style={{ color: 'white', fontSize: 20, fontWeight: '700' }}>{copy('feed.socialTitle')}</Text>
        <Text style={[s.muted, { marginTop: 8 }]}>{copy('feed.signInHint')}</Text>
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Auth', { returnTab: 'Feed' })} style={s.signin}><Text style={{ color: 'white', fontSize: 12, fontWeight: '500' }}>{copy('social.signIn')}</Text></Pressable>
      </> : <>
        <View style={s.header}><Text style={{ color: 'white', fontSize: 30, fontWeight: '600', letterSpacing: -1.2 }}>{copy('feed.socialTitle')}</Text>
          {!organizer && <Pressable testID="feed-friends" accessibilityRole="button" onPress={() => { void social.requests.refetch({ cancelRefetch: false }); void social.friends.refetch({ cancelRefetch: false }); setOpen(true); }} style={{ flexDirection: 'row', minHeight: 44, alignItems: 'center', gap: 8 }}><UsersRound color="#ffffffbf" size={20} /><Text style={{ color: '#ffffffbf', fontSize: 14, fontWeight: '500' }}>{copy('friends.title')}</Text>
            {!!social.requests.data?.length && <View style={{ minHeight: 20, minWidth: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: 99, backgroundColor: colors.accent }}><Text style={{ color: 'white', fontSize: 11, fontWeight: '600' }}>{social.requests.data.length}</Text></View>}</Pressable>}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}><Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>{copy('feed.recent').toUpperCase()}</Text>{groups.length > 0 && <Text style={{ color: colors.muted, fontSize: 11 }}>{copy('feed.of', { visible: Math.min(visible, groups.length), total: groups.length })}</Text>}</View>
        {social.feed.isError && !!social.feed.data && <Feedback compact title={copy('feedback.actionFailed')} retry={() => void social.feed.refetch()} />}
        {social.feed.isPending ? <>{[0,1,2].map(key => <View key={key} style={{ height: 140, backgroundColor: '#ffffff08', borderRadius: 16, marginBottom: 24 }} />)}</> : social.feed.isError && !social.feed.data ? <Feedback title={copy('feedback.actionFailed')} retry={() => void social.feed.refetch()} /> : groups.length === 0 ? <View style={s.empty}>
          <View style={{ height: 40, width: 40, borderRadius: 12, backgroundColor: '#ffffff0d', borderWidth: 1, borderColor: '#ffffff1a', alignItems: 'center', justifyContent: 'center' }}><UserRoundPlus size={20} color={colors.accent} /></View>
          <Text style={{ color: 'white', fontSize: 14, fontWeight: '600', marginTop: 12 }}>{copy('feed.empty')}</Text><Text style={[s.muted, { marginTop: 4, textAlign: 'center' }]}>{copy(organizer ? 'feed.emptyOrganizer' : 'feed.emptyUser')}</Text>
        </View> : <>
          {groups.slice(0, visible).map(item => <FeedCard key={`${item.kind}-${item.eventId}-${item.organizerUpdateId ?? item.actors[0]?.actorId}-${item.occurredAt}`} item={item} openProfile={openProfile} openEvent={id => navigation.navigate('Event', { id, presentation: 'sheet' })} />)}
          {visible < groups.length && <Pressable accessibilityRole="button" onPress={() => setVisible(count => Math.min(count + 8, groups.length))} style={{ minHeight: 40, paddingVertical: 10, borderWidth: 1, borderColor: '#ffffff1a', borderRadius: 99, backgroundColor: '#ffffff0d' }}><Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>{copy('feed.loadMore')}</Text></Pressable>}
        </>}
      </>}
    </RefreshScrollView>
    {open && user && !organizer && <FriendsListSheet social={social} close={() => setOpen(false)} openProfile={openProfile} manage={() => { setOpen(false); navigation.navigate('FriendsManage'); }} />}
  </View>;
}
export function FriendsManageScreen() {
  const { copy } = usePreferences(), { user, ready } = useAuth(), safe = useSafeAreaInsets(), social = useSocial();
  const navigation = useNavigation<Navigation>(), [query, setQuery] = useState('');
  useEffect(() => setQuery(''), [user?.id]);
  const friends = social.friends.data ?? [], matches = friends.filter(friend => friend.username.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const back = () => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('FeedHome');
  return <ScrollView testID="friends-page" style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: Math.max(32, safe.top), paddingBottom: 128 }}>
    <Pressable testID="friends-back" accessibilityRole="button" onPress={back} style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}><ArrowLeft size={16} color={colors.muted} /><Text style={[s.muted, { fontWeight: '600' }]}>{copy('friends.backToFeed')}</Text></Pressable>
    {!ready ? <Loading /> : !user ? <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Auth', { returnTab: 'Feed' })} style={s.signin}><Text style={{ color: 'white' }}>{copy('social.signIn')}</Text></Pressable> : user.role === 'organizer' ? <View style={s.empty}><Text style={s.title}>{copy('friends.organizerProfile')}</Text><Text style={s.muted}>{copy('friends.organizerHint')}</Text></View> : <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 }}><View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#ff004426', alignItems: 'center', justifyContent: 'center' }}><UsersRound size={20} color={colors.accent} /></View><View><Text style={s.title}>{copy('friends.title')}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>{social.friends.isPending ? copy('common.loading') : social.friends.isError && !social.friends.data ? '' : copy('friends.count', { count: friends.length })}</Text></View></View>
      <View style={s.search}><Search size={16} color="#ffffff66" /><TextInput testID="friends-page-search" value={query} onChangeText={setQuery} placeholder={copy('friends.searchPlaceholder')} accessibilityLabel={copy('friends.searchPlaceholder')} placeholderTextColor="#ffffff59" style={{ height: 48, minWidth: 0, flex: 1, fontSize: 14, color: 'white' }} /></View>
      {social.friends.isError && !!social.friends.data && <Feedback compact title={copy('feedback.actionFailed')} retry={() => void social.friends.refetch()} />}
      {social.friends.isPending ? <Loading /> : social.friends.isError && !social.friends.data ? <Feedback title={copy('feedback.actionFailed')} retry={() => void social.friends.refetch()} /> : friends.length === 0 ? <View style={[s.empty, { marginTop: 28 }]}><UserRoundPlus size={20} color={colors.accent} /><Text style={{ color: 'white', marginTop: 12, fontSize: 14, fontWeight: '500' }}>{copy('friends.empty')}</Text><Text style={[s.muted, { marginTop: 4 }]}>{copy('friends.emptyHint')}</Text></View> : matches.length === 0 ? <Text style={{ color: '#ffffff80', paddingVertical: 32, textAlign: 'center', fontSize: 14 }}>{copy('friends.noMatch')}</Text> : <View style={{ marginTop: 24, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: '#ffffff14', backgroundColor: '#ffffff06' }}>
        {matches.map((friend, index) => <View key={friend.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderTopWidth: index ? 1 : 0, borderTopColor: '#ffffff0f' }}>
          <FriendIdentity friend={friend} size={48} fallback={copy('friends.glowProfile')} open={() => navigation.navigate('PublicProfile', { id: friend.id })} />
          <Pressable testID={'friend-remove-' + friend.id} accessibilityRole="button" accessibilityLabel={copy('friends.remove', { name: friend.username })} disabled={!!social.pendingId} onPress={() => void social.remove(friend.id)} style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#ffffff26', alignItems: 'center', justifyContent: 'center', opacity: social.pendingId ? 0.6 : 1 }}>{social.pendingId === friend.id ? <ActivityIndicator size="small" color={colors.muted} /> : <UserMinus color={colors.muted} size={16} />}</Pressable>
        </View>)}
      </View>}
      {social.error && <Text accessibilityLiveRegion="polite" style={{ color: '#ef4444', fontSize: 14, marginTop: 16 }}>{copy('friends.removeFailed')}</Text>}
    </>}
  </ScrollView>;
}
const s = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 12 }, title: { color: 'white', fontSize: 24, fontWeight: '600' }, header: { marginBottom: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  signin: { marginTop: 16, alignSelf: 'flex-start', borderRadius: 99, backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 8 },
  empty: { borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: '#ffffff26', backgroundColor: '#ffffff03', paddingHorizontal: 16, paddingVertical: 32, alignItems: 'center' },
  search: { marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#ffffff09', paddingHorizontal: 16 },
});
