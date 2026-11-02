import React, {useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Plus, QrCode, Search, UsersRound} from 'lucide-react-native';
import {useAuth} from '../auth/AuthProvider';
import {usePreferences} from '../usePreferences';
import {useOutings} from '../outings/useOutings';
import {PlanCard} from '../outings/OutingPrimitives';
import {QuickConnectSheet} from '../profile/QuickConnectSheet';
import {ActionButton} from '../ui/ActionButton';
import {Text} from '../ui/Text';
import {Feedback, Loading} from '../ui/common';
import {colors} from '../ui/theme';
import {useNavbarScroll} from '../navigation/useNavbarScroll';
import {groupFeedItems} from './data';
import {FeedCard, FriendsListSheet} from './components';
import {useSocial} from './useSocial';

export function FriendsHome() {
  const {user} = useAuth(); return <FriendsContent key={user?.id ?? 'guest'} />;
}
function FriendsContent() {
  const {user, ready} = useAuth(), {copy} = usePreferences(), safe = useSafeAreaInsets(), navigation = useNavigation<any>();
  const social = useSocial(), plans = useOutings(), scroll = useNavbarScroll();
  const [sheet, setSheet] = useState<'friends' | 'qr' | null>(null), [visible, setVisible] = useState(6);
  const groups = useMemo(() => groupFeedItems((social.feed.data ?? []).filter(item => item.activityType === 'friend_ticket' || item.activityType === 'friend_going')), [social.feed.data]);
  const organizer = user?.role === 'organizer', signIn = () => navigation.navigate('Auth', {returnTab: 'Friends'});
  return <View testID="friends-hub" style={{flex: 1, backgroundColor: colors.bg}}>
    <ScrollView {...scroll} contentContainerStyle={[s.page, {paddingTop: Math.max(28, safe.top), paddingBottom: safe.bottom + 128}]}>
      <View style={s.header}><View style={{gap: 8, flex: 1}}><Text accessibilityRole="header" style={s.title}>{copy('friendsHub.title')}</Text><Text style={s.muted}>{copy('friendsHub.hint')}</Text></View>{user && !organizer && <ActionButton testID="friends-manage" tone="secondary" accessibilityLabel={copy('friendsHub.manage')} onPress={() => setSheet('friends')} style={{width: 48, paddingHorizontal: 0}}><UsersRound size={21} color="white" />{!!social.requests.data?.length && <Text style={s.badge}>{social.requests.data.length}</Text>}</ActionButton>}</View>
      {!ready ? <Loading /> : !user ? <View style={s.section}><Text style={s.muted}>{copy('friendsHub.guestHint')}</Text><ActionButton title={copy('social.signIn')} onPress={signIn} /></View> : organizer ? <View style={s.section}><Text style={s.muted}>{copy('friendsHub.organizer')}</Text><ActionButton title={copy('nav.feed')} onPress={() => navigation.navigate('Tabs', {screen: 'Feed'})} /></View> : <>
        <View style={s.section}><Text accessibilityRole="header" style={s.heading}>{copy('friendsHub.plans')}</Text><Text style={s.muted}>{copy('friendsHub.plansHint')}</Text><ActionButton title={copy('friendsHub.newPlan')} icon={<Plus size={18} />} onPress={() => navigation.navigate('Outings', {new: true})} />
          {plans.pending ? <Loading /> : plans.error ? <Feedback title={copy(plans.error)} retry={() => void plans.store.load()} /> : <>
            {plans.plans.some(plan => plan.status === 'pending') && <Text style={{color: colors.accent, fontSize: 13}}>{copy('friendsHub.invitations', {count: plans.plans.filter(plan => plan.status === 'pending').length})}</Text>}
            {[...plans.plans].sort((a,b) => Number(b.status === 'pending') - Number(a.status === 'pending')).slice(0,3).map(plan => <PlanCard key={plan.id} plan={plan} onOpen={() => navigation.navigate('Outings', {planId: plan.id})} />)}
            {!!plans.plans.length && <ActionButton title={copy('friendsHub.allPlans')} tone="ghost" onPress={() => navigation.navigate('Outings')} />}
          </>}
        </View>
        <View style={s.row}><View style={{flex:1}}><ActionButton title={copy('qr.quickConnect')} icon={<QrCode size={18}/>} tone="secondary" onPress={() => setSheet('qr')} /></View><View style={{flex:1}}><ActionButton title={copy('friendsHub.find')} icon={<Search size={18}/>} tone="secondary" onPress={() => navigation.navigate('Search')} /></View></View>
        <View style={{gap: 20}}><View style={{gap: 8}}><Text accessibilityRole="header" style={s.heading}>{copy('friendsHub.events')}</Text><Text style={s.muted}>{copy('friendsHub.eventsHint')}</Text></View>
          {social.feed.isPending ? <Loading /> : social.feed.isError && !groups.length ? <Feedback title={copy('feedback.loadFailed')} retry={() => void social.feed.refetch()} /> : !groups.length ? <View style={s.section}><Text style={s.heading}>{copy('friendsHub.noEvents')}</Text><Text style={s.muted}>{copy('friendsHub.noEventsHint')}</Text><ActionButton title={copy('nav.feed')} tone="secondary" onPress={() => navigation.navigate('Tabs', {screen: 'Feed'})} /></View> : <>
            {groups.slice(0,visible).map(item => <FeedCard key={item.eventId} item={item} openProfile={id => navigation.navigate('PublicProfile', {id})} openEvent={id => navigation.navigate('Event', {id, presentation: 'sheet'})} />)}
            {visible < groups.length && <ActionButton title={copy('feed.loadMore')} tone="secondary" onPress={() => setVisible(count => count + 6)} />}
          </>}
        </View>
      </>}
    </ScrollView>
    {sheet === 'friends' && user && !organizer && <FriendsListSheet social={social} close={() => setSheet(null)} openProfile={id => navigation.navigate('PublicProfile', {id})} manage={() => {setSheet(null); navigation.navigate('FriendsManage');}} />}
    {sheet === 'qr' && user && !organizer && <QuickConnectSheet onClose={() => setSheet(null)} />}
  </View>;
}
const s = StyleSheet.create({page: {paddingHorizontal: 20, gap: 28, maxWidth: 900, width: '100%', alignSelf: 'center'}, header: {flexDirection: 'row', alignItems: 'center', gap: 16}, title: {fontSize: 32, lineHeight: 36, letterSpacing: -1, color: colors.text, fontWeight: '600'}, heading: {fontSize: 22, color: colors.text, fontWeight: '600', letterSpacing: -.5}, muted: {fontSize: 14, lineHeight: 22, color: colors.muted}, section: {padding: 20, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, gap: 16}, row: {flexDirection: 'row', gap: 12}, badge: {position: 'absolute', right: -4, top: -4, backgroundColor: colors.action, color: 'white', fontSize: 11, paddingHorizontal: 5, borderRadius: 20}});
