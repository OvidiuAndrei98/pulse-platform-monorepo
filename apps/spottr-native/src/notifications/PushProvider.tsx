import { AccentPressable } from '../ui/AccentPressable';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import type { NavigationContainerRefWithCurrent, NavigationState } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { accountApi, useAuth } from '../auth/AuthProvider';
import { usePreferences } from '../usePreferences';
import { queryClient } from '../data/queries';
import type { RootParamList } from '../navigation/types';
import { notificationDestination, parseNotifications } from './data';
import { pushNotificationID } from './pushRegistry';
import { clearPresentedPush, getPushDevice, listenPush, onPushForeground, openPushSettings, pushProjectID, pushRegistry, pushSupported, type PushStatus } from './pushPlatform';
import { Feedback } from '../ui/common';
import { Text } from '../ui/Text';
import { MotionPressable } from '../ui/MotionPressable';
import { Bell, BellRing, ChevronRight } from 'lucide-react-native';
import { colors } from '../ui/theme';

const Context = createContext({ status: 'unavailable' as PushStatus, enable: async () => {}, pending: null as unknown, consume: () => {} });
export function PushProvider({ children }: React.PropsWithChildren) {
  const { user, ready, controller } = useAuth(), { language } = usePreferences();
  const [status, setStatus] = useState<PushStatus>('off'), [pending, setPending] = useState<unknown>(null);
  const sequence = useRef(0), mounted = useRef(true), token = controller.getToken();
  const lastSync = useRef(0);
  const sync = useCallback(async (prompt = false) => {
    if (Platform.OS === 'web' || !ready) return;
    const step = ++sequence.current, snapshot = controller.getSnapshot(), ownerToken = controller.getToken();
    const identity = snapshot.user && ownerToken ? { userId: snapshot.user.id, token: ownerToken, language } : null;
    const current = () => mounted.current && sequence.current === step && controller.getToken() === ownerToken;
    if (prompt) setStatus('busy');
    let reported: PushStatus = 'off';
    try {
      const active = await pushRegistry.sync(identity, () => getPushDevice(prompt, ownerToken!, value => { reported = value; }));
      if (current()) { setStatus(active ? 'on' : reported); lastSync.current = Date.now(); }
    } catch { if (current()) setStatus('error'); }
  }, [controller, language, ready]);
  useEffect(() => {
    mounted.current = true;
    let previous = controller.getToken();
    const unsubscribe = controller.subscribe(() => {
      const next = controller.getToken();
      if (next !== previous) { previous = next; pushRegistry.invalidate(); sequence.current++; }
    });
    return () => { mounted.current = false; pushRegistry.invalidate(); unsubscribe(); };
  }, [controller]);
  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    void sync();
    if (!user) { setPending(null); void clearPresentedPush(); }
  }, [ready, user?.id, token, sync]);
  useEffect(() => onPushForeground(() => {
    // Avoid registering on every permission-dialog/AppState bounce.
    if (Date.now() - lastSync.current > 15 * 60_000 || status !== 'on') void sync();
    if (controller.getSnapshot().user) void queryClient.invalidateQueries({ queryKey: ['notifications', controller.getSnapshot().user!.id] });
  }), [sync, status, controller]);
  useEffect(() => {
    if (!pushSupported) return;
    const currentID = (data: unknown) => pushNotificationID(data, controller.getSnapshot().user?.id, pushProjectID);
    return listenPush(data => !!currentID(data), data => {
      if (currentID(data)) void queryClient.invalidateQueries({ queryKey: ['notifications', controller.getSnapshot().user!.id] });
    }, setPending);
  }, [controller]);
  const enable = async () => {
    if (status === 'busy') return;
    if (status === 'denied' || status === 'on') {
      lastSync.current = 0;
      try { await openPushSettings(); } catch { setStatus('error'); }
    } else await sync(true);
  };
  return <Context.Provider value={{ status, enable, pending, consume: () => setPending(null) }}>{children}</Context.Provider>;
}

export function PushPreference() {
  const { status, enable } = useContext(Context), { copy } = usePreferences();
  if (Platform.OS === 'web') return null;
  const Icon = status === 'on' ? BellRing : Bell;
  return <View style={{ margin: 12, padding: 14, gap: 10, borderRadius: 20, backgroundColor: '#ffffff08' }}>
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
      <Icon size={18} color={colors.accent} /><Text style={{ flex: 1, fontSize: 13, fontWeight: '600' }}>{copy('notifications.pushTitle')}</Text>
    </View>
    <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>{copy('notifications.push.' + (!pushSupported ? 'unavailable' : status))}</Text>
    {pushSupported && status !== 'unavailable' && <AccentPressable fallback={MotionPressable} testID="push-enable" accessibilityRole="button" disabled={status === 'busy'} onPress={() => void enable()} style={{ backgroundColor: status === 'on' ? '#ffffff0a' : '#ff0044', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'center', gap: 8, alignItems: 'center', opacity: status === 'busy' ? 0.6 : 1 }}>
      <Text style={{ fontSize: 12, fontWeight: '600' }}>{copy(status === 'on' || status === 'denied' ? 'notifications.pushSettings' : 'notifications.pushEnable')}</Text><ChevronRight size={14} color="white" />
    </AccentPressable>}
  </View>;
}

export function PushNavigation({ navigation, state }: { navigation: NavigationContainerRefWithCurrent<RootParamList>; state?: NavigationState }) {
  const { pending, consume } = useContext(Context), { user, ready, controller } = useAuth(), { copy } = usePreferences(), safe = useSafeAreaInsets();
  const [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  const owner = user?.id, token = controller.getToken();
  // Only the readiness/blocked state matters. Navigating to the result must not
  // cancel its mark-read completion by changing the navigation-state object.
  const currentRoute = state ? navigation.getCurrentRoute()?.name : undefined;
  const canNavigate = !!state && navigation.isReady() && currentRoute !== 'Checkout' && currentRoute !== 'CheckoutReturn';
  const consumeRef = useRef(consume); consumeRef.current = consume;
  useEffect(() => {
    if (!ready || !pending || !canNavigate) return;
    const id = pushNotificationID(pending, owner, pushProjectID);
    if (!id) { consumeRef.current(); return; }
    let active = true;
    setFailed(false);
    void (async () => {
      const raw = await accountApi('/notifications/' + encodeURIComponent(id), { token });
      if (!active || controller.getToken() !== token) return;
      const item = parseNotifications({ items: [raw] }).items[0];
      if (!item || item.id !== id) throw new Error('Invalid notification');
      consumeRef.current();
      if (item.type === 'ticket_purchased') navigation.navigate('Tabs', { screen: 'Profile', params: { screen: 'Tickets' } });
      else {
        const target = notificationDestination(item);
        if (target?.kind === 'event') navigation.navigate('Event', { id: target.id, presentation: 'page' });
        else if (target?.kind === 'profile') navigation.navigate('PublicProfile', { id: target.id });
        else if (target?.kind === 'safety') navigation.navigate('SafetyGroup', { eventId: target.id });
        else navigation.navigate('Tabs', { screen: 'Home' });
      }
      await accountApi('/notifications/' + id + '/read', { method: 'POST', token }).catch(() => {});
      if (controller.getToken() === token) void queryClient.invalidateQueries({ queryKey: ['notifications', owner] });
    })().catch(() => { if (active && controller.getToken() === token) setFailed(true); });
    return () => { active = false; };
  }, [ready, pending, canNavigate, owner, token, controller, navigation, retry]);
  if (!failed || !pending) return null;
  return <View style={{ position: 'absolute', top: safe.top + 8, left: 16, right: 16, borderRadius: 20, backgroundColor: '#151112' }}>
    <Feedback compact title={copy('notifications.openFailed')} retry={() => setRetry(value => value + 1)} />
    <MotionPressable accessibilityRole="button" onPress={() => { consume(); setFailed(false); }} style={{ padding: 12 }}><Text style={{ textAlign: 'center', color: colors.muted }}>{copy('notifications.close')}</Text></MotionPressable>
  </View>;
}
