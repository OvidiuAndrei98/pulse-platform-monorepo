import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Share, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, Heart, MapPin, Share2, UsersRound } from 'lucide-react-native';
import { feedDate, feedMoney, type FeedEvent } from '@packages/app-core/feed/model';
import { ActionButton } from '../ui/ActionButton';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { usePreferences } from '../usePreferences';
import { useToast } from '../ui/ToastProvider';
import { WEB_URL } from '../config';
import type { RootParamList } from '../navigation/types';
import { useEventFeed } from './useEventFeed';

function FeedPoster({event}: {event: FeedEvent}) {
  const [failed, setFailed] = useState(false), source = !failed && event.bannerUrl ? {uri: event.bannerUrl} : require('../../assets/party-event.webp');
  return <View pointerEvents="none" style={StyleSheet.absoluteFill} accessible={false}>
    <Image source={source} style={[StyleSheet.absoluteFill, {opacity: .35}]} contentFit="cover" blurRadius={28} cachePolicy="memory-disk" onError={() => setFailed(true)} />
    <Image source={source} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" onError={() => setFailed(true)} />
  </View>;
}
function FeedSlide({event, height, working, error, onLike, onOpen, onPropose, footer}: {
  event: FeedEvent; height: number; working: boolean; error: boolean; onLike: () => void; onOpen: () => void; onPropose: () => void; footer?: React.ReactNode;
}) {
  const {copy, language} = usePreferences(), safe = useSafeAreaInsets(), toast = useToast();
  const share = async () => { try { await Share.share({title: event.title, message: event.title + '\n' + WEB_URL + '/events/' + event.id}); } catch { toast.show({key: 'feedback.shareFailed', kind: 'error'}); } };
  return <View testID={'feed-slide-' + event.id} style={[s.slide, {height}]}>
    <FeedPoster event={event} />
    <LinearGradient pointerEvents="none" colors={['#0009', '#0000', '#0004', '#000e', '#000']} locations={[0, .3, .45, .8, 1]} style={StyleSheet.absoluteFill} />
    <View style={[s.content, {bottom: safe.bottom + (height < 650 ? 122 : 142)}]}>
      <View style={s.details}>
        <Text style={s.category}>{event.category}</Text><Text accessibilityRole="header" numberOfLines={3} style={[s.title, height < 650 && {fontSize: 26, lineHeight: 29}]}>{event.title}</Text>
        <View style={s.meta}><CalendarDays size={16} color="white" /><Text style={s.metaText}>{feedDate(event, language)}</Text></View>
        <View style={s.meta}><MapPin size={16} color="white" /><Text numberOfLines={2} style={s.metaText}>{event.locationName}{event.city ? ' · ' + event.city : ''}</Text></View>
        {event.externalTickets || event.priceRon !== undefined ? <Text style={s.price}>{copy(event.externalTickets ? 'discovery.external' : event.priceRon === 0 ? 'discovery.free' : 'discovery.from', {price: event.priceRon !== undefined ? feedMoney(event.priceRon, language) : ''})}</Text> : null}
        <ActionButton testID={'feed-open-' + event.id} title={copy('discovery.view')} onPress={onOpen} />
      </View>
      <View style={s.actions}>
        <View style={{alignItems: 'center', gap: 5}}><ActionButton testID={'feed-like-' + event.id} accessibilityLabel={copy(event.liked ? 'discovery.unlike' : 'discovery.like', {event: event.title})} accessibilityState={{selected: event.liked}} tone="secondary" disabled={working} onPress={onLike} style={s.icon}><Heart size={25} color={event.liked ? colors.accent : 'white'} fill={event.liked ? colors.accent : 'none'} /></ActionButton><Text accessibilityLabel={copy('discovery.likes', {count: event.likeCount})} accessibilityLiveRegion="polite" style={s.count}>{event.likeCount}</Text></View>
        <ActionButton accessibilityLabel={copy('discovery.share')} tone="secondary" onPress={() => void share()} style={s.icon}><Share2 size={22} color="white" /></ActionButton>
        <ActionButton accessibilityLabel={copy('discovery.propose')} tone="secondary" onPress={onPropose} style={s.icon}><UsersRound size={23} color="white" /></ActionButton>
      </View>
    </View>
    {error && <Text accessibilityRole="alert" style={[s.likeError, {bottom: safe.bottom + 110}]}>{copy('discovery.likeFailed')}</Text>}
    {!!footer && <View style={[s.footer, {bottom: safe.bottom + 80}]}>{footer}</View>}
  </View>;
}
export function EventFeedScreen() {
  const model = useEventFeed(), {copy} = usePreferences(), safe = useSafeAreaInsets(), navigation = useNavigation<NativeStackNavigationProp<RootParamList>>();
  const [height, setHeight] = useState(0), list = useRef<FlatList<FeedEvent>>(null), owner = model.actor ?? 'guest';
  const [active, setActive] = useState(0);
  useEffect(() => { setActive(0); }, [owner]);
  const viewable = useRef(({viewableItems}: {viewableItems: {index?: number | null}[]}) => { const index = viewableItems[0]?.index; if (index !== null && index !== undefined) setActive(index); });
  useEffect(() => { if (active >= model.items.length - 2 && model.items.length > 0 && model.nextPage && !model.error) void model.store.load(true); }, [active, model.items.length, model.nextPage, model.error, model.store]);
  const like = useCallback((event: FeedEvent) => model.actor ? void model.store.setLike(event.id, !event.liked) : navigation.navigate('Auth', {returnTab: 'Feed'}), [model.actor, model.store, navigation]);
  const footer = model.loadingMore ? <ActivityIndicator color="white" /> : model.error ? <ActionButton title={copy('common.retry')} tone="secondary" onPress={() => void model.store.load(true)} /> : model.nextPage ? <ActionButton title={copy('discovery.loadMore')} tone="secondary" onPress={() => void model.store.load(true)} /> : <Text style={s.end}>{copy('discovery.end')}</Text>;
  return <View testID="event-feed" style={s.page} onLayout={event => setHeight(event.nativeEvent.layout.height)}>
    {model.pending || !model.ready ? <View style={s.center}><ActivityIndicator accessibilityLabel={copy('common.loading')} color={colors.accent} /></View> : !model.items.length ? <View style={s.center}>
      <Text style={s.emptyTitle}>{copy(model.error ? 'feedback.loadFailed' : 'discovery.empty')}</Text>
      {!model.error && <Text style={s.emptyHint}>{copy('discovery.emptyHint')}</Text>}
      <ActionButton tone="secondary" title={copy(model.error ? 'common.retry' : 'nav.map')} onPress={() => model.error ? void model.store.load() : navigation.navigate('Tabs', {screen: 'Explore'})} />
    </View> : height > 0 && <FlatList key={owner} ref={list} testID="event-feed-list" data={model.items} keyExtractor={item => item.id} pagingEnabled decelerationRate="fast" snapToInterval={height} snapToAlignment="start" showsVerticalScrollIndicator={false} directionalLockEnabled
      windowSize={3} initialNumToRender={2} maxToRenderPerBatch={2} getItemLayout={(_, index) => ({length: height, offset: height * index, index})}
      onViewableItemsChanged={viewable.current} viewabilityConfig={{itemVisiblePercentThreshold: 65}}
      extraData={{working: model.working, errors: model.likeErrors, footer, height}}
      renderItem={({item, index}) => <FeedSlide event={item} height={height} working={model.working.includes(item.id)} error={model.likeErrors.includes(item.id)} onLike={() => like(item)} onOpen={() => navigation.navigate('Event', {id: item.id, presentation: 'sheet'})} onPropose={() => navigation.navigate('Outings', {event: item.id})} footer={index === model.items.length - 1 ? footer : undefined} />} />}
    <View pointerEvents="none" style={[s.header, {top: Math.max(22, safe.top)}]}><Text accessibilityRole="header" style={s.heading}>{copy('discovery.title')}</Text><Text style={s.headerHint}>{copy('discovery.hint')}</Text></View>
  </View>;
}
const s = StyleSheet.create({
  page: {flex: 1, backgroundColor: colors.bg}, slide: {backgroundColor: '#0c0c0e', overflow: 'hidden'},
  header: {position: 'absolute', left: 20, right: 20, gap: 5}, heading: {color: 'white', fontSize: 24, fontWeight: '700', letterSpacing: -.8}, headerHint: {color: '#ddd', fontSize: 12},
  content: {position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'flex-end', gap: 18},
  details: {flex: 1, minWidth: 0, gap: 12, alignItems: 'flex-start'}, category: {color: 'white', fontSize: 11, letterSpacing: 2, fontWeight: '700'}, title: {color: 'white', fontSize: 32, lineHeight: 35, fontWeight: '700', letterSpacing: -.8},
  meta: {flexDirection: 'row', gap: 8, alignItems: 'flex-start'}, metaText: {flex: 1, color: '#eee', fontSize: 13, lineHeight: 19}, price: {color: 'white', fontSize: 13, fontWeight: '600'},
  actions: {alignItems: 'center', gap: 14}, icon: {width: 48, height: 48, paddingHorizontal: 0, paddingVertical: 0, backgroundColor: '#161619d9', borderColor: '#ffffff40'}, count: {color: 'white', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums']},
  likeError: {position: 'absolute', left: 20, right: 20, color: '#ffb3c5', fontSize: 12}, footer: {position: 'absolute', alignItems: 'center', left: 20, right: 20}, end: {color: '#b5b5bd', fontSize: 11},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', gap: 18, paddingHorizontal: 24, paddingBottom: 100}, emptyTitle: {fontSize: 24, fontWeight: '600', textAlign: 'center', color: 'white'}, emptyHint: {color: colors.muted, fontSize: 14, textAlign: 'center'},
});
