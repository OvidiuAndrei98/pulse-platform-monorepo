import { ActionIcon } from '../ui/ActionIcon';
import { FormInput as TextInput } from '../ui/FormInput';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { UserMinus, UserRoundPlus, UsersRound, Search } from 'lucide-react-native';
import type { FriendsParamList, RootParamList } from '../navigation/types';
import { useAuth } from '../auth/AuthProvider';
import { usePreferences } from '../usePreferences';
import { useSocial } from '../social/useSocial';
import { FriendIdentity } from '../social/components';
import { Text } from '../ui/Text';
import { Feedback, Loading } from '../ui/common';
import { colors } from '../ui/theme';
import { useNavbarScroll } from '../navigation/useNavbarScroll';
import {ActionButton as UIActionButton} from '../ui/ActionButton';

type Navigation = CompositeNavigationProp<NativeStackNavigationProp<FriendsParamList>, NativeStackNavigationProp<RootParamList>>;
export {FriendsHome as FriendsScreen} from '../social/FriendsHome';
export function FriendsManageScreen() {
  const navbarScroll = useNavbarScroll();
  const { copy } = usePreferences('copy'), { user, ready } = useAuth('account'), safe = useSafeAreaInsets(), social = useSocial();
  const navigation = useNavigation<Navigation>(), [query, setQuery] = useState('');
  useEffect(() => setQuery(''), [user?.id]);
  const friends = social.friends.data ?? [], matches = friends.filter(friend => friend.username.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const back = () => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('FriendsHome');
  return <ScrollView {...navbarScroll} testID="friends-page" style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: Math.max(32, safe.top), paddingBottom: 128 }}>
    <Pressable testID="friends-back" accessibilityRole="button" onPress={back} style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}><ActionIcon name="back" size={16} color={colors.muted} /><Text style={[s.muted, { fontWeight: '600' }]}>{copy('friendsHub.back')}</Text></Pressable>
    {!ready ? <Loading /> : !user ? <UIActionButton accessibilityRole="button" onPress={() => navigation.navigate('Auth', { returnTab: 'Friends' })} style={s.signin}><Text style={{ color: 'white' }}>{copy('social.signIn')}</Text></UIActionButton> : user.role === 'organizer' ? <View style={s.empty}><Text style={s.title}>{copy('friends.organizerProfile')}</Text><Text style={s.muted}>{copy('friends.organizerHint')}</Text></View> : <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 }}><View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#ff004426', alignItems: 'center', justifyContent: 'center' }}><UsersRound size={20} color={colors.accent} /></View><View><Text style={s.title}>{copy('friends.title')}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>{social.friends.isPending ? copy('common.loading') : social.friends.isError && !social.friends.data ? '' : copy('friends.count', { count: friends.length })}</Text></View></View>
      <View style={s.search}><Search size={16} color="#ffffff66" /><TextInput variant="bare" testID="friends-page-search" value={query} onChangeText={setQuery} placeholder={copy('friends.searchPlaceholder')} accessibilityLabel={copy('friends.searchPlaceholder')} placeholderTextColor="#ffffff59" style={{ height: 48, minWidth: 0, flex: 1, fontSize: 14, color: 'white' }} /></View>
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
