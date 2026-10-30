import type { ScrollViewInstance } from 'react-native';
import { GlassPressable } from '../ui/GlassPressable';
import { ActionIcon } from '../ui/ActionIcon';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import { BadgeCheck, Check, ChevronLeft, ChevronRight, Info, UserMinus, UserPlus, UsersRound } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StackActions } from '@react-navigation/native';
import type { RootParamList } from '../navigation/types';
import { PublicProfileTabBar } from '../navigation/PublicProfileTabBar';
import { useAuth } from '../auth/AuthProvider';
import { usePreferences } from '../usePreferences';
import { eventsApi, ApiError } from '../data/api';
import { seedEvent } from '../data/queries';
import type { Event } from '../data/events';
import { loadOrganizerEvents, splitOrganizerEvents, type PublicProfile } from '../profiles/data';
import { usePublicProfile, useProfileAction } from '../profiles/usePublicProfile';
import { OrganizerUpdates } from '../profiles/OrganizerUpdates';
import { SocialPhoto } from '../social/components';
import { EventBrowseCard } from '../ui/EventBrowseCard';
import { AppSheet } from '../ui/AppSheet';
import { AppSheetScrollView } from '../ui/AppSheetScrollView';
import { EventImage, Feedback, Loading } from '../ui/common';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { useToast } from '../ui/ToastProvider';
import { WEB_URL } from '../config';
import { drawerDesign } from '../../../pulse-app/src/components/ui/drawerDesign';
import { useNavbarScroll } from '../navigation/useNavbarScroll';

export function PublicProfileScreen({ route, navigation }: NativeStackScreenProps<RootParamList, 'PublicProfile'>) {
  const navbarScroll = useNavbarScroll();
  const toast = useToast();
  const id = route.params.id.toLowerCase(), { user } = useAuth(), { copy } = usePreferences(), safe = useSafeAreaInsets();
  const viewport = useWindowDimensions(), heroFontSize = Math.max(32, Math.min(48, viewport.width * .08));
  const query = usePublicProfile(id), profile = query.data;
  const events = useQuery({ queryKey: ['organizer-events', id, user?.id ?? 'guest'], enabled: profile?.role === 'organizer',
    queryFn: ({ signal }) => loadOrganizerEvents(eventsApi, id, signal) });
  const [infoOpen, setInfoOpen] = useState(false), [shareFailed, setShareFailed] = useState(false), [now, setNow] = useState(Date.now);
  useEffect(() => { setInfoOpen(false); setShareFailed(false); }, [id]);
  useEffect(() => {
    const nextEnd = Math.min(...(events.data ?? []).map(event => Date.parse(event.endTime)).filter(time => time > now));
    if (!Number.isFinite(nextEnd)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(2147483647, Math.max(1, nextEnd - Date.now())));
    return () => clearTimeout(timer);
  }, [events.data, now]);
  const { upcomingEvents, pastEvents } = useMemo(() => splitOrganizerEvents(events.data ?? [], now), [events.data, now]);
  const back = () => navigation.canGoBack() ? navigation.goBack() : navigation.replace('Tabs', { screen: 'Feed' });
  const signIn = () => navigation.navigate('Auth', { returnProfile: id });
  const openEvent = (eventId: string, presentation: 'sheet' | 'page' = 'sheet') => {
    const event = events.data?.find(item => item.id === eventId);
    if (event) seedEvent(event);
    const eventRoute = navigation.getState().routeNames.find(name => name.startsWith('NestedEvent:')) ?? 'Event';
    navigation.dispatch(StackActions.push(eventRoute, { id: eventId, presentation }));
  };
  const share = async () => {
    if (!profile) return;
    setShareFailed(false);
    try {
      const title = profile.organizerName || profile.username, url = `${WEB_URL}/users/${encodeURIComponent(id)}`;
      if (Platform.OS === 'web') {
        if (navigator.share) await navigator.share({ title, url });
        else { await navigator.clipboard.writeText(url); toast.show({ key: 'toast.linkCopied' }); }
      } else await Share.share({ title, message: `${title}\n${url}` });
    }
    catch (cause) { if (!(cause instanceof Error && cause.name === 'AbortError')) { setShareFailed(true); toast.show({ key: 'feedback.shareFailed', kind: 'error' }); } }
  };
  const organizer = profile?.role === 'organizer', name = profile?.organizerName || profile?.username;
  const hero = [...upcomingEvents, ...pastEvents].find(event => event.bannerUrl)?.bannerUrl || profile?.avatarUrl;
  return <View testID="public-profile-screen" style={{ flex: 1, backgroundColor: organizer ? '#050505' : colors.bg }}>
    <ScrollView {...navbarScroll} testID="public-profile-scroll" contentContainerStyle={{ paddingBottom: 128 }}>
      {!profile ? <View style={{ paddingHorizontal: 20, paddingTop: Math.max(32, safe.top) }}>
        <Back onPress={back} />
        {query.isPending ? <Loading /> : <Feedback title={copy(query.error instanceof ApiError && query.error.status === 404 ? 'publicProfile.unavailable' : 'feedback.loadFailed')}
          retry={query.error instanceof ApiError && query.error.status === 404 ? undefined : () => void query.refetch()} />}
      </View> : organizer ? <>
        <View style={{ minHeight: 352, justifyContent: 'space-between', overflow: 'hidden' }}>
          {hero ? <EventImage uri={hero} style={StyleSheet.absoluteFill} /> : <LinearGradient colors={['#3e0818', '#050505']} style={StyleSheet.absoluteFill} />}
          <LinearGradient colors={['#00000040', '#0000001a', '#050505']} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['transparent', '#05050580', '#050505']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '67%' }} />
          <View style={[s.controls, { paddingTop: Math.max(20, safe.top) }]}>
            <GlassPressable fallback={Pressable} testID="public-profile-back" accessibilityRole="button" accessibilityLabel={copy('common.back')} onPress={back} style={s.icon}><ActionIcon name="close" size={16} color={colors.text} strokeWidth={2.2} /></GlassPressable>
            <GlassPressable fallback={Pressable} testID="public-profile-share" accessibilityRole="button" accessibilityLabel={copy('publicProfile.share')} onPress={() => void share()} style={s.icon}><ActionIcon name="share" size={16} color={colors.text} strokeWidth={2.2} /></GlassPressable>
          </View>
          <View style={{ paddingHorizontal: 20, paddingTop: 96, paddingBottom: 20 }}>
            <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1.98, textTransform: 'uppercase', marginBottom: 8 }}>@{profile.username}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ flexShrink: 1, color: colors.text, fontSize: heroFontSize, fontWeight: '700', lineHeight: heroFontSize * 1.05, letterSpacing: -0.8 }}>{name}</Text>{profile.organizerVerified && <Verified />}</View>
          </View>
        </View>
        <View style={{ paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', gap: 12, paddingTop: 12 }}>
            <Pressable testID="organizer-info" accessibilityRole="button" onPress={() => setInfoOpen(true)} style={s.info}><Info size={16} color="#ffffffa6" /><Text style={s.buttonText}>{copy('publicProfile.info')}</Text></Pressable>
            {profile.relationship !== 'self' && user?.id !== profile.id && <View style={{ flex: 1 }}><ProfileActions profile={profile} signIn={signIn} large /></View>}
          </View>
          {(query.isError || shareFailed) && <Feedback compact title={copy('feedback.actionFailed')} retry={query.isError ? () => void query.refetch() : undefined} />}
          <View style={{ marginTop: 36, gap: 40 }}>
            <EventRail kind="upcoming" events={upcomingEvents} loading={events.isPending} error={events.isError} retry={() => void events.refetch()} onOpen={event => openEvent(event.id)} />
            <OrganizerStats profile={profile} />
            <EventRail kind="past" events={pastEvents} loading={events.isPending} error={events.isError} retry={() => void events.refetch()} onOpen={event => openEvent(event.id)} />
            <OrganizerUpdates id={id} kind="organizers" openEvent={eventId => openEvent(eventId, 'page')} />
          </View>
        </View>
      </> : <View style={{ paddingHorizontal: 20, paddingTop: Math.max(32, safe.top) }}>
        <Back onPress={back} />
        <View style={s.userCard}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
            <SocialPhoto uri={profile.avatarUrl} initial={profile.username} initialSize={20} style={s.avatar} />
            <View style={{ flex: 1, minWidth: 0 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text numberOfLines={1} style={{ flexShrink: 1, color: colors.text, fontSize: 24, fontWeight: '600' }}>{profile.username}</Text>{profile.organizerVerified && <Verified size={20} />}</View><Text style={[s.muted, { marginTop: 4 }]}>@{profile.username}</Text></View>
            <ProfileActions profile={profile} signIn={signIn} />
          </View>
          {!!profile.bio && <Text style={[s.muted, { marginTop: 20, lineHeight: 24 }]}>{profile.bio}</Text>}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', borderTopWidth: 1, borderColor: '#ffffff1a', marginTop: 24, paddingTop: 16 }}><UsersRound size={16} color={colors.accent} /><Text style={[s.muted, { flex: 1, fontSize: 12 }]}>{copy(profile.relationship === 'friends' ? 'publicProfile.connected' : 'publicProfile.connectHint')}</Text></View>
        </View>
        {query.isError && <Feedback compact title={copy('feedback.loadFailed')} retry={() => void query.refetch()} />}
      </View>}
    </ScrollView>
    <PublicProfileTabBar />
    {infoOpen && profile && <OrganizerInfo profile={profile} close={() => setInfoOpen(false)} />}
  </View>;
}
function Back({ onPress }: { onPress: () => void }) {
  const { copy } = usePreferences();
  return <Pressable testID="public-profile-back" accessibilityRole="button" onPress={onPress} style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8 }}><ActionIcon name="back" size={16} color={colors.muted} /><Text style={{ fontSize: 12, color: colors.muted, fontWeight: '600' }}>{copy('common.back')}</Text></Pressable>;
}
function Verified({ size = 24 }: { size?: number }) { const { copy } = usePreferences(); return <BadgeCheck accessibilityLabel={copy('publicProfile.verifiedOrganizer')} size={size} color={colors.accent} />; }
function ProfileActions({ profile, signIn, large }: { profile: PublicProfile; signIn: () => void; large?: boolean }) {
  const { copy } = usePreferences(), { action, busy, error, run } = useProfileAction(profile);
  if (!action) return null;
  const labels = { signin: 'social.signIn', follow: 'social.follow', unfollow: 'social.following', request: 'social.addFriend', pending: 'social.requestSent', accept: 'social.accept', remove: 'social.removeFriend' };
  const selected = action === 'unfollow', tint = selected ? colors.accent : action === 'remove' || action === 'signin' ? colors.muted : colors.text;
  const Icon = selected ? Check : action === 'remove' ? UserMinus : UserPlus;
  return <View style={large ? { width: '100%' } : undefined}>
    <Pressable testID="public-profile-action" accessibilityRole="button" accessibilityState={{ disabled: busy || action === 'pending', busy }} disabled={busy || action === 'pending'} onPress={action === 'signin' ? signIn : () => void run()}
      style={[s.action, large && { minHeight: 48, justifyContent: 'center', width: '100%' }, selected && { borderColor: '#ff004466', backgroundColor: '#ff004426' }, action === 'signin' && large && { borderColor: '#ffffff0d', backgroundColor: '#ffffff0f' }, (busy || action === 'pending') && { opacity: 0.6 }]}>
      {busy ? <ActivityIndicator size="small" color={tint} /> : action !== 'signin' && <Icon size={14} color={tint} />}
      <Text style={{ color: tint, fontSize: large ? 14 : 12, fontWeight: '600' }}>{copy(labels[action])}</Text>
    </Pressable>
    {error && <Text testID="public-profile-action-error" accessibilityLiveRegion="polite" style={{ marginTop: 8, fontSize: 12, color: '#f87171' }}>{copy('feedback.actionFailed')}</Text>}
  </View>;
}
function OrganizerStats({ profile, border = true }: { profile: PublicProfile; border?: boolean }) {
  const { copy, language } = usePreferences(), number = new Intl.NumberFormat(language);
  return <View testID="organizer-stats" style={{ flexDirection: 'row', paddingVertical: border ? 24 : 0, borderTopWidth: border ? 1 : 0, borderBottomWidth: border ? 1 : 0, borderColor: '#ffffff1a' }}>
    {[['publicProfile.followersShort', profile.followerCount], ['publicProfile.ticketsShort', profile.ticketsSoldCount]].map(([label, value], index) => <View key={label} style={{ flex: 1, alignItems: 'center', gap: 6, paddingHorizontal: 12, borderLeftWidth: index ? 1 : 0, borderColor: '#ffffff1a' }}><Text style={{ color: colors.text, fontSize: 24, fontWeight: '600', letterSpacing: -0.6 }}>{number.format(Number(value))}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{copy(String(label))}</Text></View>)}
  </View>;
}
function OrganizerInfo({ profile, close }: { profile: PublicProfile; close: () => void }) {
  const { copy } = usePreferences(), viewport = useWindowDimensions();
  const [headerHeight, setHeaderHeight] = useState(80), [contentHeight, setContentHeight] = useState(328);
  const height = Math.min(.9, (drawerDesign.handleAreaHeight + headerHeight + contentHeight) / viewport.height);
  return <AppSheet open onClose={close} height={height} label={copy('common.close')} testID="organizer-info-sheet">
    <View onLayout={event => setHeaderHeight(Math.ceil(event.nativeEvent.layout.height))} style={{ paddingTop: 4, paddingHorizontal: 20, paddingBottom: 20 }}><Text style={{ fontSize: 24, fontWeight: '700', letterSpacing: -0.84, color: 'white' }}>{copy('publicProfile.aboutOrganizer')}</Text><Text style={{ color: '#ffffff8c', fontSize: 12, marginTop: 8 }}>@{profile.username}</Text></View>
    <AppSheetScrollView testID="organizer-info-content" onContentSizeChange={(_, height) => setContentHeight(Math.ceil(height))} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }}>
      <View style={{ borderRadius: 26, padding: 20, backgroundColor: '#110d0f', overflow: 'hidden' }}>
        <LinearGradient colors={['#ff004414', 'transparent']} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><SocialPhoto uri={profile.avatarUrl} initial={profile.username} initialSize={18} style={{ width: 56, height: 56, borderRadius: 28 }} /><Text style={{ flex: 1, fontSize: 20, fontWeight: '600', color: colors.text, letterSpacing: -0.5 }}>{profile.organizerName || profile.username}</Text>{profile.organizerVerified && <Verified size={20} />}</View>
        <Text style={{ color: '#ffffff99', fontSize: 14, lineHeight: 28, marginTop: 20 }}>{profile.bio || copy('publicProfile.noBio')}</Text>
      </View>
      <View style={{ marginTop: 16, borderRadius: 26, backgroundColor: '#141414', paddingHorizontal: 8, paddingVertical: 20 }}><OrganizerStats profile={profile} border={false} /><Text style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: '#ffffff80' }}><Text style={{ fontWeight: '600', color: 'white' }}>{profile.eventCount}</Text> {copy('publicProfile.eventsShort')}</Text></View>
    </AppSheetScrollView>
  </AppSheet>;
}
function EventRail({ events, loading, error, retry, onOpen, kind }: { events: Event[]; loading: boolean; error: boolean; retry: () => void; onOpen: (event: Event) => void; kind: 'upcoming' | 'past' }) {
  const { copy } = usePreferences(), viewport = useWindowDimensions(), rail = useRef<ScrollViewInstance>(null);
  const [width, setWidth] = useState(0), [offset, setOffset] = useState(0);
  const cardWidth = Math.max(1, (width - 4) * 0.46), gap = 12, total = events.length * (cardWidth + gap) - gap + 4;
  const title = copy(kind === 'upcoming' ? 'publicProfile.upcomingEvents' : 'publicProfile.pastEvents');
  return <View testID={'organizer-' + kind} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <View style={{ marginBottom: 20, flexDirection: 'row', gap: 12, alignItems: 'baseline', justifyContent: 'space-between' }}><Text style={{ color: colors.text, fontSize: 20, fontWeight: '600', letterSpacing: -0.5 }}>{title}</Text>{!loading && events.length > 0 && <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Text style={{ color: colors.muted, fontSize: 12 }}>{events.length}</Text>{viewport.width >= 640 && total > width && [-1, 1].map(direction => <Pressable key={direction} accessibilityRole="button" accessibilityLabel={copy(direction < 0 ? 'common.back' : 'common.next') + ' · ' + title} disabled={direction < 0 ? offset < 1 : offset + width >= total - 1} onPress={() => rail.current?.scrollTo({ x: Math.max(0, offset + direction * width * .9), animated: true })} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#ffffff1a', alignItems: 'center', justifyContent: 'center' }}>{direction < 0 ? <ChevronLeft size={16} color={colors.muted} /> : <ChevronRight size={16} color={colors.muted} />}</Pressable>)}</View>}</View>
    {error && <Feedback compact title={copy('publicProfile.eventsLoadFailed')} retry={retry} />}
    {!loading && !error && !events.length ? <Text style={[s.muted, { lineHeight: 24 }]}>{copy(kind === 'upcoming' ? 'publicProfile.noUpcomingEvents' : 'publicProfile.noPastEvents')}</Text> : <ScrollView testID={'organizer-' + kind + '-rail'} ref={rail} horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardWidth + gap} decelerationRate="fast" onScroll={event => setOffset(event.nativeEvent.contentOffset.x)} scrollEventThrottle={32} contentContainerStyle={{ paddingHorizontal: 2, paddingTop: 2, paddingBottom: 8, gap }}>
      {loading ? [0, 1, 2].map(key => <View key={key} style={{ width: cardWidth, height: cardWidth + 60, borderRadius: 20, backgroundColor: '#ffffff09' }} />) : events.map(event => <View key={event.id} style={{ width: cardWidth }}><EventBrowseCard event={event} onOpen={() => onOpen(event)} fill /></View>)}
    </ScrollView>}
  </View>;
}
const s = StyleSheet.create({
  controls: { paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between' },
  icon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#ffffff26', backgroundColor: '#ffffff0f', justifyContent: 'center', alignItems: 'center' },
  info: { flex: 1, height: 48, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', borderRadius: 99, borderWidth: 1, borderColor: '#ffffff0d', backgroundColor: '#ffffff0f' },
  buttonText: { color: colors.text, fontSize: 14, fontWeight: '600' }, muted: { color: colors.muted, fontSize: 14 },
  userCard: { marginTop: 24, borderRadius: 24, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#ffffff09', padding: 20 },
  avatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderColor: '#ff004459', backgroundColor: '#ff00441a' },
  action: { minHeight: 36, borderRadius: 99, borderWidth: 1, borderColor: '#ffffff26', paddingHorizontal: 12, flexDirection: 'row', gap: 6, alignItems: 'center' },
});
