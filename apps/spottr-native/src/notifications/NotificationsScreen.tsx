import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, SectionList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Bell, BellRing, Calendar, CheckCheck, Heart, MessageCircle, ShieldAlert, Sparkles, Ticket, UserPlus, UsersRound } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import type { RootParamList } from '../navigation/types';
import { openAccountPage } from '../navigation/accountNavigation';
import { usePreferences } from '../usePreferences';
import { formatDate, type Event } from '../data/events';
import { eventsApi } from '../data/api';
import { SocialPhoto } from '../social/components';
import { useSocial } from '../social/useSocial';
import { Text } from '../ui/Text';
import { Button, EventImage, Feedback, Loading } from '../ui/common';
import { GlassPressable } from '../ui/GlassPressable';
import { ActionIcon } from '../ui/ActionIcon';
import { colors, tokens } from '../ui/theme';
import { notificationText, formatNotificationTime } from '@packages/app-core/notifications/content';
import { groupNotifications, notificationDestination, pendingRequestNotifications, type Notification } from './data';
import { useNotifications } from './useNotifications';
import { PushPreference } from './PushProvider';

type Props = NativeStackScreenProps<RootParamList, 'Notifications'>;

export function NotificationsScreen(props: Props) {
  const { user } = useAuth('account');
  return <NotificationsInbox key={user?.id ?? 'guest'} {...props} />;
}

function NotificationsInbox({ navigation }: Props) {
  const { copy, language } = usePreferences('copy');
  const { user, ready } = useAuth('account');
  const safe = useSafeAreaInsets(), client = useQueryClient(), query = useNotifications();
  const compact = useWindowDimensions().width < 360;
  const social = useSocial({ includeFriends: false, includeFeed: false });
  const [settings, setSettings] = useState(false), [refreshing, setRefreshing] = useState(false);
  useFocusEffect(useCallback(() => {
    if (user) void query.refetch({ cancelRefetch: false });
  }, [user?.id, query.refetch]));
  const sections = useMemo(() => groupNotifications(query.data?.items ?? []), [query.data?.items]);
  const activeRequests = useMemo(() => pendingRequestNotifications(query.data?.items ?? [], (social.requests.data ?? []).map(request => request.id)), [query.data?.items, social.requests.data]);
  // Reuse Home/detail data; published events missing from that cache are loaded
  // only when their notification row is rendered by the virtualized list.
  const cachedEvents = useMemo(() => {
    const events = new Map((client.getQueryData<Event[]>(['home-events']) ?? []).map(event => [event.id, event]));
    for (const item of query.data?.items ?? []) if (item.eventId) {
      const detail = client.getQueryData<Event>(['event', item.eventId]);
      if (detail) events.set(item.eventId, detail);
    }
    return events;
  }, [client, query.data?.items]);
  const unread = query.data?.unreadCount ?? 0;
  const back = () => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Tabs', { screen: 'Home' });
  const select = (item: Notification) => {
    void query.markRead(item);
    const target = notificationDestination(item);
    if (item.type === 'ticket_transfer') navigation.navigate('TicketTransfers');
    else if (item.type === 'outing_plan_invite' || item.type === 'outing_plan_chosen') navigation.navigate('Outings');
    else if (item.type === 'ticket_purchased') openAccountPage(navigation, 'Tickets');
    else if (target?.kind === 'event') navigation.navigate('Event', { id: target.id, presentation: 'page' });
    else if (target?.kind === 'profile') navigation.navigate('PublicProfile', { id: target.id });
    else if (target) navigation.navigate('SafetyGroup', { eventId: target.id });
  };
  const respond = async (item: Notification, status: 'accepted' | 'declined') => {
    if (item.actorId && await social.respond(item.actorId, status, item.id) && status === 'accepted') await query.markRead(item);
  };
  const refresh = async () => {
    setRefreshing(true);
    try { await query.refetch(); } finally { setRefreshing(false); }
  };
  return <View testID="notifications-screen" style={[s.screen, { paddingTop: Math.max(safe.top, 16) }]}>
    <View style={s.header}>
      <GlassPressable testID="notifications-back" accessibilityLabel={copy('common.back')} onPress={back} style={s.control}>
        <ActionIcon name="back" color={colors.text} size={22} />
      </GlassPressable>
      <View style={s.heading}>
        <Text accessibilityRole="header" style={s.title}>{copy('notifications.title')}</Text>
        {unread > 0 && <Text style={s.subtitle}>{copy('notifications.unread', { count: unread })}</Text>}
      </View>
      {unread > 0 && <GlassPressable testID="notifications-read-all" accessibilityLabel={copy(query.markingAll ? 'notifications.markingAll' : 'notifications.markAll')}
        disabled={query.markingAll} onPress={() => void query.markAllRead()} style={s.control}>
        <CheckCheck size={20} color={colors.accent} />
      </GlassPressable>}
      {user && Platform.OS !== 'web' && <GlassPressable testID="notifications-settings" accessibilityLabel={copy('notifications.settings')}
        accessibilityState={{ expanded: settings }} onPress={() => setSettings(value => !value)} style={s.control}>
        <BellRing size={20} color={settings ? colors.accent : colors.text} />
      </GlassPressable>}
    </View>
    {!ready ? <Loading /> : !user ? <View style={s.empty}>
      <Bell size={32} color={colors.muted} /><Text style={s.emptyTitle}>{copy('notifications.signIn')}</Text>
      <Button title={copy('social.signIn')} onPress={() => navigation.navigate('Auth', { returnTab: 'Home' })} />
    </View> : <SectionList
      key={user.id}
      testID="notifications-list"
      sections={sections}
      keyExtractor={item => item.id}
      style={s.list}
      contentContainerStyle={{ paddingBottom: safe.bottom + 24, flexGrow: 1 }}
      showsVerticalScrollIndicator={false}
      stickySectionHeadersEnabled={false}
      initialNumToRender={12}
      maxToRenderPerBatch={8}
      windowSize={7}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      ListHeaderComponent={<>
        {settings && <View testID="notifications-preferences"><PushPreference /></View>}
        {(query.actionError || social.error) && <Feedback compact title={copy('feedback.actionFailed')} />}
        {query.isError && !!query.data && <Feedback compact title={copy('feedback.loadFailed')} retry={() => void query.refetch()} />}
      </>}
      ListEmptyComponent={query.isPending ? <Loading /> : query.isError ? <Feedback title={copy('feedback.loadFailed')} retry={() => void query.refetch()} />
        : <View testID="notifications-empty" style={s.empty}><View style={s.emptyIcon}><Bell size={28} color={colors.accent} /></View>
            <Text style={s.emptyTitle}>{copy('notifications.empty')}</Text><Text style={s.emptyHint}>{copy('notifications.emptyHint')}</Text></View>}
      renderSectionHeader={({ section }) => <Text accessibilityRole="header" testID={'notifications-section-' + section.key} style={s.sectionTitle}>{copy('notifications.section.' + section.key)}</Text>}
      renderItem={({ item }) => <NotificationRow item={item} cachedEvent={item.eventId ? cachedEvents.get(item.eventId) : undefined}
        onPress={() => select(item)} copy={copy} language={language}
        activeRequest={activeRequests.has(item.id)}
        compact={compact} responding={!!social.pendingId} pending={social.pendingId === item.actorId} onRespond={status => void respond(item, status)} />}
    />}
  </View>;
}

type Copy = ReturnType<typeof usePreferences>['copy'];
function NotificationRow({ item, cachedEvent, onPress, copy, language, activeRequest, compact, responding, pending, onRespond }: {
  item: Notification; cachedEvent?: Event; onPress: () => void; copy: Copy; language: 'ro' | 'en';
  activeRequest: boolean; compact: boolean; responding: boolean; pending: boolean; onRespond: (status: 'accepted' | 'declined') => void;
}) {
  const published = item.type === 'organizer_event';
  const purchased = item.type === 'ticket_purchased';
  const eventQuery = useQuery({ queryKey: ['event', item.eventId], enabled: (published || purchased) && !!item.eventId && !cachedEvent,
    staleTime: 300_000, refetchOnWindowFocus: false,
    queryFn: ({ signal }) => eventsApi.event(item.eventId!, signal) });
  const event = cachedEvent ?? eventQuery.data, image = event?.bannerUrl;
  const content = published && event?.title
    ? { title: copy('notifications.organizerEventTitle'), body: copy('notifications.organizerEventNamedBody', { name: item.actorUsername || 'SPOTTR', event: event.title }) }
    : purchased && event?.title ? { title: copy('notifications.ticketPurchasedNamedTitle', { event: event.title }), body: copy('notifications.ticketPurchasedBody') }
    : notificationText(item, copy);
  const time = formatNotificationTime(item.createdAt, copy, value => formatDate(value, language, false, { deviceTime: true }));
  const social = ['friend_request', 'friend_accepted', 'organizer_event', 'ticket_transfer'].includes(item.type);
  const name = item.actorUsername, nameIndex = name ? content.body.indexOf(name) : -1;
  const body = social && name && nameIndex >= 0 ? <>{content.body.slice(0, nameIndex)}<Text style={s.strong}>{name}</Text>{content.body.slice(nameIndex + name.length)}</> : content.body;
  return <Pressable testID={'notification-' + item.id} accessibilityRole="button"
    accessibilityLabel={[content.title, content.body, time, !item.isRead ? copy('notifications.unreadItem') : ''].filter(Boolean).join('. ')}
    onPress={onPress} style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
    <NotificationAvatar item={item} image={image} />
    <View style={s.rowBody}>
      <Text style={s.message}>
        {!social && <Text style={s.strong}>{content.title}{'\n'}</Text>}
        {body}{' '}<Text style={s.time}>{time}</Text>
      </Text>
    </View>
      {activeRequest && <View style={[s.requestActions, compact && s.requestActionsCompact]}>
        <Pressable testID={'notification-accept-' + item.id} accessibilityRole="button"
          accessibilityLabel={copy('notifications.acceptRequest', { name: item.actorUsername || copy('notifications.someone') })}
          disabled={responding} onPress={event => { event.stopPropagation(); onRespond('accepted'); }}
          style={s.requestTarget}>
          {({ pressed }) => <View style={[s.requestButton, s.accept, pressed && { backgroundColor: colors.actionHover }, responding && s.disabled]}>
            {pending ? <ActivityIndicator size="small" color="white" /> : <Text style={s.requestLabel}>{copy('notifications.accept')}</Text>}
          </View>}
        </Pressable>
        <Pressable testID={'notification-delete-' + item.id} accessibilityRole="button"
          accessibilityLabel={copy('notifications.deleteRequest', { name: item.actorUsername || copy('notifications.someone') })}
          disabled={responding} onPress={event => { event.stopPropagation(); onRespond('declined'); }}
          style={s.requestTarget}>
          {({ pressed }) => <View style={[s.requestButton, s.decline, pressed && { opacity: 0.7 }, responding && s.disabled]}>
            <Text style={s.requestLabel}>{copy('notifications.delete')}</Text>
          </View>}
        </Pressable>
      </View>}
    {image && (published || item.actorAvatarUrl) && <View testID={'notification-preview-' + item.id} style={s.preview}>
      <EventImage uri={image} fadeIn={false} style={StyleSheet.absoluteFill} />
    </View>}
    {!item.isRead && !activeRequest && <View testID={'notification-dot-' + item.id} style={s.unreadDot} />}
  </Pressable>;
}

function NotificationAvatar({ item, image }: { item: Notification; image?: string }) {
  if (item.actorAvatarUrl || item.actorUsername) return <SocialPhoto uri={item.actorAvatarUrl} initial={item.actorUsername} initialSize={18} style={s.avatar} />;
  if (image) return <EventImage uri={image} fadeIn={false} style={s.eventAvatar} />;
  const Icon = item.type.startsWith('safety_') ? ShieldAlert : item.type === 'ticket_purchased' ? Ticket : item.type === 'organizer_event' ? Calendar
    : item.type === 'friend_request' ? UserPlus : item.type === 'friend_accepted' ? UsersRound : item.type === 'saved_event' ? Heart : item.type === 'message' ? MessageCircle : Sparkles;
  return <View style={[s.avatar, s.icon]}><Icon size={23} strokeWidth={1.7} color={colors.accent} /></View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: tokens.spacing.lg, paddingTop: tokens.spacing.sm, paddingBottom: tokens.spacing.lg, gap: tokens.spacing.sm },
  control: { width: tokens.control.regular, height: tokens.control.regular, borderRadius: tokens.control.regular / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#ffffff0d' },
  heading: { flex: 1, minWidth: 0, gap: 2, paddingLeft: tokens.spacing.xs },
  title: { color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.6 },
  subtitle: { color: colors.muted, fontSize: 12 },
  list: { flex: 1 },
  sectionTitle: { color: colors.text, fontSize: tokens.type.section.size, fontWeight: '700', paddingHorizontal: tokens.spacing.lg, paddingTop: tokens.spacing.xl, paddingBottom: tokens.spacing.md, letterSpacing: -0.3 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: tokens.spacing.md, paddingHorizontal: tokens.spacing.lg, gap: tokens.spacing.md, minHeight: 80 },
  rowPressed: { backgroundColor: colors.surface },
  rowBody: { flex: 1, minWidth: 0 },
  message: { color: colors.text, fontSize: 14, lineHeight: 21 },
  strong: { fontWeight: '600', color: colors.text },
  time: { color: colors.muted, fontSize: 12 },
  requestActions: { flexDirection: 'row', gap: tokens.spacing.sm, flexShrink: 0 },
  requestActionsCompact: { flexDirection: 'column' },
  requestTarget: { minHeight: tokens.control.regular, justifyContent: 'center' },
  requestButton: { minHeight: 32, minWidth: 64, paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.xs, borderRadius: tokens.radius.field, alignItems: 'center', justifyContent: 'center' },
  accept: { backgroundColor: colors.action },
  decline: { backgroundColor: colors.raised },
  requestLabel: { color: colors.onAction, fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  avatar: { width: tokens.control.large, height: tokens.control.large, borderRadius: tokens.control.large / 2, flexShrink: 0 },
  eventAvatar: { width: tokens.control.large, height: tokens.control.large, borderRadius: tokens.radius.field, flexShrink: 0 },
  icon: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  preview: { width: tokens.control.compact, height: tokens.control.regular, borderRadius: tokens.spacing.sm, overflow: 'hidden', flexShrink: 0 },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, flexShrink: 0 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.md, paddingVertical: 80, paddingHorizontal: tokens.spacing.xxl },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: tokens.spacing.sm },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '600', textAlign: 'center' },
  emptyHint: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
