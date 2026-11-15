import React, {useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Plus, UsersRound} from 'lucide-react-native';
import {useAuth} from '../auth/AuthProvider';
import {usePreferences} from '../usePreferences';
import {useGroups} from '../groups/useGroups';
import {GroupRow} from '../groups/GroupsScreen';
import { OutingAction as ActionButton } from '../outings/OutingPrimitives';
import {Text} from '../ui/Text';
import {Feedback, Loading} from '../ui/common';
import {colors} from '../ui/theme';
import {useNavbarScroll} from '../navigation/useNavbarScroll';
import {friendsEventGroups} from '@packages/app-core/social/groupPresentation';
import {EventPreview} from '../groups/GroupContent';
import {MemberAvatar} from '../outings/OutingPrimitives';
import {FriendsListSheet} from './components';
import {useSocial} from './useSocial';

export function FriendsHome() {
  const {user} = useAuth('account'); return <FriendsContent key={user?.id ?? 'guest'} />;
}
function FriendsContent() {
  const {user, ready} = useAuth('account'), {copy} = usePreferences('copy'), safe = useSafeAreaInsets(), navigation = useNavigation<any>();
  const social = useSocial(), plans = useGroups(), scroll = useNavbarScroll();
  const [sheet, setSheet] = useState<'friends' | null>(null), [visible, setVisible] = useState(6);
  const groups = useMemo(() => friendsEventGroups(social.feed.data ?? []), [social.feed.data]);
  const planCards = useMemo(() => plans.groups.slice(0,3)
    .map(group => <GroupRow key={group.id} group={group} onPress={() => navigation.navigate('FriendGroup', {id: group.id})} />), [plans.groups, navigation]);
  const eventCards = groups.slice(0,visible).map(item => <EventPreview key={item.eventId} testID={'friends-event-'+item.eventId} title={item.eventTitle} imageUrl={item.eventBannerUrl} startTime={item.eventStartTime} location={item.eventLocation} city={item.eventCity} onPress={()=>navigation.navigate('Event',{id:item.eventId,presentation:'sheet'})}>
    <View style={{gap:6,marginTop:4}}><View style={{flexDirection:'row',alignItems:'center'}}>{item.actors.slice(0,4).map((actor,index)=><View key={actor.actorId} style={{marginLeft:index?-8:0}}><MemberAvatar name={actor.actorUsername} userId={actor.actorId} uri={actor.actorAvatarUrl} size={28}/></View>)}{item.actors.length>4&&<Text style={[s.muted,{marginLeft:6}]}>+{item.actors.length-4}</Text>}</View>
    <Text style={[s.muted,{fontSize:13,lineHeight:19}]}>{[item.ticketActors.length?copy('groups.friendsWithTickets',{count:item.ticketActors.length}):'',item.goingActors.length?copy('groups.friendsGoing',{count:item.goingActors.length}):''].filter(Boolean).join(' · ')}</Text></View>
  </EventPreview>);
  const organizer = user?.role === 'organizer', signIn = () => navigation.navigate('Auth', {returnTab: 'Friends'});
  return <View testID="friends-hub" style={{flex: 1, backgroundColor: colors.bg}}>
    <ScrollView {...scroll} contentContainerStyle={[s.page, {paddingTop: Math.max(28, safe.top), paddingBottom: safe.bottom + 128}]}>
      <View style={s.header}><View style={{gap: 8, flex: 1}}><Text accessibilityRole="header" style={s.title}>{copy('friendsHub.title')}</Text></View>{user && !organizer && <ActionButton testID="friends-manage" tone="secondary" accessibilityLabel={copy('friendsHub.manage')} onPress={() => setSheet('friends')} style={{width: 48, paddingHorizontal: 0}}><UsersRound size={21} color="white" />{!!social.requests.data?.length && <Text style={s.badge}>{social.requests.data.length}</Text>}</ActionButton>}</View>
      {!ready ? <Loading /> : !user ? <View style={s.section}><Text style={s.muted}>{copy('friendsHub.guestHint')}</Text><ActionButton title={copy('social.signIn')} onPress={signIn} /></View> : organizer ? <View style={s.section}><Text style={s.muted}>{copy('friendsHub.organizer')}</Text><ActionButton title={copy('nav.feed')} onPress={() => navigation.navigate('Tabs', {screen: 'Feed'})} /></View> : <>
        <View style={{gap:8}}><View style={{flexDirection:'row',alignItems:'center',gap:12}}><Text accessibilityRole="header" style={[s.heading,{flex:1}]}>{copy('groups.title')}</Text><ActionButton testID="friends-new-plan" accessibilityLabel={copy('groups.create')} icon={<Plus size={20}/>} style={{width:44,paddingHorizontal:0}} onPress={()=>navigation.navigate('Groups',{new:true})}/></View>
          {plans.loading ? <Loading /> : plans.error ? <Feedback title={copy(plans.error)} retry={() => void plans.store.load()} /> : <>
            {planCards}
            {plans.groups.length>3&&<ActionButton title={copy('friendsHub.allPlans')} style={{alignSelf:'flex-end'}} tone="ghost" onPress={() => navigation.navigate('Groups')} />}
            {!plans.groups.length&&<View style={{gap:12,paddingVertical:16}}><Text style={s.heading}>{copy('groups.newGroup')}</Text><Text style={s.muted}>{copy('groups.empty')}</Text><ActionButton title={copy('groups.create')} tone="secondary" onPress={()=>navigation.navigate('Groups',{new:true})}/></View>}
          </>}
        </View>

        <View style={{gap: 20}}><View style={{gap: 8}}><Text accessibilityRole="header" style={s.heading}>{copy('friendsHub.events')}</Text><Text style={s.muted}>{copy('friendsHub.eventsHint')}</Text></View>
          {social.feed.isPending ? <Loading /> : social.feed.isError && !groups.length ? <Feedback title={copy('feedback.loadFailed')} retry={() => void social.feed.refetch()} /> : !groups.length ? <View style={s.section}><Text style={s.heading}>{copy('friendsHub.noEvents')}</Text><Text style={s.muted}>{copy('friendsHub.noEventsHint')}</Text><ActionButton title={copy('nav.feed')} tone="secondary" onPress={() => navigation.navigate('Tabs', {screen: 'Feed'})} /></View> : <>
            {eventCards}
            {visible < groups.length && <ActionButton title={copy('feed.loadMore')} tone="secondary" onPress={() => setVisible(count => count + 6)} />}
          </>}
        </View>
      </>}
    </ScrollView>
    {sheet === 'friends' && user && !organizer && <FriendsListSheet social={social} close={() => setSheet(null)} openProfile={id => navigation.navigate('PublicProfile', {id})} manage={() => {setSheet(null); navigation.navigate('FriendsManage');}} />}
  </View>;
}
const s = StyleSheet.create({page: {paddingHorizontal: 20, gap: 32, maxWidth: 760, width: '100%', alignSelf: 'center'}, header: {flexDirection: 'row', alignItems: 'center', gap: 16}, title: {fontSize: 28, lineHeight: 34, letterSpacing: -.7, color: colors.text, fontWeight: '600'}, heading: {fontSize: 18, color: colors.text, fontWeight: '600', letterSpacing: -.5}, muted: {fontSize: 14, lineHeight: 22, color: colors.muted}, section: {padding: 20, borderRadius: 24, borderWidth: 0, borderColor: colors.line, backgroundColor: colors.raised, gap: 16}, row: {flexDirection: 'row', gap: 12}, badge: {position: 'absolute', right: -4, top: -4, backgroundColor: colors.action, color: 'white', fontSize: 11, paddingHorizontal: 5, borderRadius: 20}});
