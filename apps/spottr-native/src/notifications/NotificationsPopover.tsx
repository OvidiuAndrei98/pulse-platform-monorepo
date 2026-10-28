import { GlassPressable } from '../ui/GlassPressable';
import { ActionIcon } from '../ui/ActionIcon';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Bell, Calendar, Heart, MessageCircle, ShieldAlert, Sparkles, Ticket, UserPlus, UsersRound } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePreferences } from '../PreferencesProvider';
import { Text } from '../ui/Text';
import { Feedback, Loading } from '../ui/common';
import { SocialPhoto } from '../social/components';
import { colors } from '../ui/theme';
import type { RootParamList } from '../navigation/types';
import { notificationText, formatNotificationTime } from '../../../pulse-app/src/components/notificationContent';
import { notificationDestination, type Notification } from './data';
import { useNotifications } from './useNotifications';
import { PushPreference } from './PushProvider';
import { MotionPressable } from '../ui/MotionPressable';
import { formatDate } from '../data/events';

export function NotificationsPopover() {
  const { copy, language } = usePreferences(), query = useNotifications(), navigation = useNavigation<NativeStackNavigationProp<RootParamList>>();
  const anchor = useRef<View>(null), [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const viewport = useWindowDimensions(), insets = useSafeAreaInsets();
  const width = Math.min(380, viewport.width - 32);
  const webOpacity = useSharedValue(0);
  const webFade = useAnimatedStyle(() => ({ opacity: webOpacity.value }));
  useEffect(() => {
    // Web layout entering hides the hit area for a frame, letting a quick tap reach the backdrop.
    if (Platform.OS === 'web') webOpacity.value = position ? withTiming(1, { duration: 180 }) : 0;
  }, [position, webOpacity]);
  useEffect(() => { setPosition(null); }, [viewport.width, viewport.height]);
  const open = () => {
    anchor.current?.measureInWindow((x, y, anchorWidth, anchorHeight) => setPosition({ x: Math.max(16, Math.min(viewport.width - width - 16, x + anchorWidth - width)), y: Math.max(insets.top, Math.min(y + anchorHeight + 8, viewport.height - insets.bottom - 240)) }));
    void query.refetch();
  };
  const select = (item: Notification) => {
    void query.markRead(item);
    setPosition(null);
    const target = notificationDestination(item);
    if (item.type === 'ticket_purchased') navigation.navigate('Tabs', { screen: 'Profile', params: { screen: 'Tickets' } });
    else if (target?.kind === 'event') navigation.navigate('Event', { id: target.id, presentation: 'page' });
    else if (target?.kind === 'profile') navigation.navigate('PublicProfile', { id: target.id });
    else if (target) navigation.navigate('SafetyGroup', { eventId: target.id });
  };
  return <View ref={anchor} collapsable={false}>
    <GlassPressable fallback={MotionPressable} testID="home-notifications" accessibilityRole="button" accessibilityLabel={copy('notifications.title')} onPress={open} style={s.bell}>
      <View><ActionIcon name="bell" color={colors.text} size={16} strokeWidth={2.2} />{(query.data?.unreadCount ?? 0) > 0 && <View testID="notification-unread" style={s.badge} />}</View>
    </GlassPressable>
    {/* Web Modal keeps an invisible backdrop until an effect runs; unmount it with the panel. */}
    {(Platform.OS !== 'web' || position !== null) && <Modal transparent visible={position !== null} animationType="none" onRequestClose={() => setPosition(null)} statusBarTranslucent>
      <Pressable testID="notifications-backdrop" accessibilityRole="button" accessibilityLabel={copy('notifications.close')} onPress={() => setPosition(null)} style={StyleSheet.absoluteFill} />
      {position && <Animated.View testID="notifications-panel" accessibilityViewIsModal entering={Platform.OS === 'web' ? undefined : FadeIn.duration(180)} exiting={Platform.OS === 'web' ? undefined : FadeOut.duration(120)} style={[s.panel, { left: position.x, top: position.y, width }, Platform.OS === 'web' && webFade]}>
        <LinearGradient pointerEvents="none" colors={['#ffffff0f', '#ffffff00']} style={StyleSheet.absoluteFill} />
        <View style={s.header}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Bell color={colors.accent} size={16} strokeWidth={2.2} /><Text style={s.title}>{copy('notifications.title')}</Text></View>
          <GlassPressable fallback={Pressable} testID="notifications-close" accessibilityRole="button" accessibilityLabel={copy('notifications.close')} onPress={() => setPosition(null)} style={s.close}><ActionIcon name="close" size={14} color={colors.text} /></GlassPressable></View>
        <ScrollView testID="notifications-list" style={{ maxHeight: Math.min(viewport.height * 0.6, viewport.height - position.y - insets.bottom - 72), marginTop: 12 }} contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 12, gap: 4 }}>
          <PushPreference />
          {(query.data?.unreadCount ?? 0) > 0 && <View style={s.unreadHeader}>
            <Text style={s.unreadCount}>{copy('notifications.unread', { count: query.data!.unreadCount })}</Text>
            <MotionPressable testID="notifications-read-all" accessibilityRole="button" disabled={query.markingAll} onPress={() => void query.markAllRead()} style={{ paddingVertical: 12, opacity: query.markingAll ? 0.5 : 1 }}><Text style={s.markAll}>{copy(query.markingAll ? 'notifications.markingAll' : 'notifications.markAll')}</Text></MotionPressable>
          </View>}
          {query.actionError && <Feedback compact title={copy('feedback.actionFailed')} />}
          {query.isPending ? <Loading /> : query.isError && !query.data ? <Feedback compact title={copy('feedback.actionFailed')} retry={() => void query.refetch()} /> : <>
            {query.isError && <Feedback compact title={copy('feedback.actionFailed')} retry={() => void query.refetch()} />}
            {!query.data?.items.length ? <Text style={s.empty}>{copy('notifications.empty')}</Text> : query.data.items.map(item => {
              const content = notificationText(item, copy);
              return <MotionPressable key={item.id} testID={'notification-' + item.id} accessibilityRole="button" onPress={() => select(item)} style={[s.item, !item.isRead && { backgroundColor: '#ff00440d' }]}>
                <NotificationIcon item={item} /><View style={{ flex: 1, minWidth: 0 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={[s.title, { flex: 1, fontWeight: '500', lineHeight: 18 }]} numberOfLines={2}>{content.title}</Text><Text style={s.time}>{formatNotificationTime(item.createdAt, copy, value => formatDate(value, language, false, { deviceTime: true }))}</Text></View>
                  <Text style={s.body}>{content.body}</Text></View>{!item.isRead && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 8 }} />}
              </MotionPressable>;
            })}
          </>}
        </ScrollView>
      </Animated.View>}
    </Modal>}
  </View>;
}
function NotificationIcon({ item }: { item: Notification }) {
  if (item.actorAvatarUrl) return <SocialPhoto uri={item.actorAvatarUrl} initial={item.actorUsername} style={s.icon} />;
  const Icon = item.type.startsWith('safety_') ? ShieldAlert : item.type === 'ticket_purchased' ? Ticket : item.type === 'organizer_event' ? Calendar : item.type === 'friend_request' ? UserPlus : item.type === 'friend_accepted' ? UsersRound : item.type === 'saved_event' ? Heart : item.type === 'message' ? MessageCircle : Sparkles;
  return <View style={s.icon}><Icon size={16} color={colors.accent} /></View>;
}
const s = StyleSheet.create({
  bell: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: '#ffffff26', backgroundColor: '#ffffff0f' },
  badge: { position: 'absolute', right: -2, top: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  panel: { position: 'absolute', overflow: 'hidden', borderRadius: 26, borderWidth: 1, borderColor: '#ffffff0d', backgroundColor: '#111113' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16 },
  close: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#ffffff26', backgroundColor: '#ffffff0d', alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 14, fontWeight: '600' }, time: { color: colors.muted, fontSize: 11 },
  unreadHeader: { paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  unreadCount: { color: colors.muted, fontSize: 11 }, markAll: { color: colors.accent, fontSize: 11, fontWeight: '600' },
  item: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 16 }, body: { fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 2 },
  icon: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#ff00444d', backgroundColor: '#ff00441a', marginTop: 2, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingHorizontal: 12, paddingVertical: 32, textAlign: 'center', color: colors.muted, fontSize: 12 },
});
