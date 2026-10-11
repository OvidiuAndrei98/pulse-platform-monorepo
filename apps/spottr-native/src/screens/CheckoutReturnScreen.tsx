import { getNativePayment, resolveNativePayment } from "../checkout/nativePayment";
import { haptic } from "../ui/haptics";
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AlertCircle, CheckCircle2, Mail, Ticket, UserRoundPlus } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { checkPaymentConfirmation, type ConfirmationResult } from '../../../pulse-app/src/features/checkout/confirmation';
import { validCheckoutSession } from '../../../pulse-app/src/features/checkout/nativeReturn';
import { accountApi, useAuth } from '../auth/AuthProvider';
import { queryClient } from '../data/queries';
import { isEventId } from '../data/events';
import { usePreferences } from '../PreferencesProvider';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import type { RootParamList } from '../navigation/types';
import { returnToEvent } from '../navigation/returnToEvent';

export function CheckoutReturnScreen({ route, navigation }: NativeStackScreenProps<RootParamList, 'CheckoutReturn'>) {
  const { eventId = '', sessionId, nativeOrderId, cancelled } = route.params ?? {}, { user, controller } = useAuth(), { copy } = usePreferences(), safe = useSafeAreaInsets();
  const token = controller.getToken();
  const [status, setStatus] = useState<'checking' | 'invalid' | 'cancelled' | ConfirmationResult>('checking'), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!isEventId(eventId)) { setStatus('invalid'); return; }
    const native = nativeOrderId ? getNativePayment(nativeOrderId, eventId, token) : undefined;
    if (nativeOrderId && !native) { setStatus('invalid'); return; }
    if (!native && sessionId === undefined && cancelled === '1') { setStatus('cancelled'); return; }
    if (!native && !validCheckoutSession(sessionId)) { setStatus('invalid'); return; }
    let active = true;
    const isActive = () => active && controller.getToken() === token;
    setStatus('checking');
    void checkPaymentConfirmation(() => native ? resolveNativePayment(native, accountApi) : accountApi('/checkout/reconcile', { method: 'POST', body: { eventId, sessionId }, token }), isActive).then(value => {
      if (!isActive() || !value) return;
      setStatus(native?.cancelRequested && native.status === 'failed' ? 'cancelled' : value);
      if (value === 'completed') haptic('success');
      if (value === 'completed') for (const key of ['tickets', 'orders', 'event', 'event-social', 'event-friends', 'social-feed', 'notifications']) void queryClient.invalidateQueries({ queryKey: [key] });
    });
    return () => { active = false; };
  }, [eventId, sessionId, nativeOrderId, cancelled, attempt, controller, token]);
  const completed = status === 'completed', failed = status === 'failed' || status === 'invalid';
  const title = status === 'pending' ? 'feedback.confirmationPending' : status === 'unavailable' ? 'feedback.confirmationUnavailable' : completed ? 'checkoutSuccess.confirmed' : failed ? 'checkoutSuccess.problem' : status === 'cancelled' ? 'checkout.paymentClosed' : 'checkoutSuccess.confirming';
  const hint = status === 'pending' ? 'feedback.confirmationPendingHint' : status === 'unavailable' ? 'feedback.confirmationUnavailableHint' : status === 'invalid' ? 'feedback.confirmationInvalid' : completed ? 'checkoutSuccess.confirmedHint' : failed ? 'checkoutSuccess.problemHint' : status === 'cancelled' ? 'checkout.paymentClosedHint' : 'checkoutSuccess.confirmationHint';
  const back = () => {
    const state = navigation.getState();
    if (state.routes[state.index - 1]?.name === 'Checkout') navigation.goBack();
    else returnToEvent(navigation, eventId);
  };
  return <ScrollView testID="checkout-return" style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: Math.max(40, safe.top), paddingBottom: Math.max(28, safe.bottom), justifyContent: 'center' }}>
    <View style={s.card}><View style={[s.icon, failed && { borderColor: '#f8717159', backgroundColor: '#f8717126' }]}>{completed ? <CheckCircle2 size={28} color={colors.accent} /> : status === 'checking' ? <ActivityIndicator size="large" color={colors.accent} /> : <AlertCircle size={28} color={failed ? '#f87171' : colors.accent} />}</View>
      <Text style={s.eyebrow}>{copy('checkoutSuccess.thanks')}</Text><Text accessibilityRole="header" style={s.title}>{copy(title)}</Text><Text accessibilityLiveRegion="polite" style={s.hint}>{copy(hint)}</Text>
      {(status === 'pending' || status === 'unavailable') && <Pressable testID="checkout-recheck" accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={s.button}><Text style={s.buttonText}>{copy('feedback.checkAgain')}</Text></Pressable>}
      {completed && <View style={s.result}><View style={{ flexDirection: 'row', gap: 12 }}>{user ? <Ticket size={20} color={colors.accent} /> : <Mail size={20} color={colors.accent} />}<View style={{ flex: 1 }}><Text style={s.resultTitle}>{copy(user ? 'checkoutSuccess.ticketsInAccount' : 'checkoutSuccess.ticketsByEmail')}</Text><Text style={s.resultHint}>{copy(user ? 'checkoutSuccess.ticketsInAccountHint' : 'checkoutSuccess.ticketsByEmailHint')}</Text></View></View>
        <Pressable testID="checkout-view-tickets" accessibilityRole="button" onPress={() => user ? navigation.popTo('Tabs', { screen: 'Profile', params: { screen: 'Tickets' } }) : navigation.replace('Auth', { mode: 'register', returnTab: 'Profile' })} style={[s.button, { flexDirection: 'row', gap: 8 }]}>{user ? <Ticket size={16} color="white" /> : <UserRoundPlus size={16} color="white" />}<Text style={s.buttonText}>{copy(user ? 'checkoutSuccess.viewTickets' : 'auth.createAccount')}</Text></Pressable>
      </View>}
      {!completed && status !== 'checking' && isEventId(eventId) && <Pressable testID="checkout-return-to-event" accessibilityRole="button" onPress={back} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 12 }}><Text style={s.link}>{copy('checkout.backToTickets')}</Text></Pressable>}
      <Pressable accessibilityRole="button" onPress={() => navigation.popTo('Tabs', { screen: 'Explore' })} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 12 }}><Text style={s.link}>{copy('checkoutSuccess.backToEvents')}</Text></Pressable>
    </View>
  </ScrollView>;
}
const s = StyleSheet.create({ card: { padding: 24, borderWidth: 1, borderColor: '#ff004440', backgroundColor: '#000000cc' }, icon: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: '#ff004459', backgroundColor: '#ff004426', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }, eyebrow: { marginTop: 20, color: colors.accent, textAlign: 'center', textTransform: 'uppercase', fontSize: 12, fontWeight: '700', letterSpacing: 1.9 }, title: { color: 'white', textAlign: 'center', fontSize: 24, fontWeight: '700', marginTop: 8 }, hint: { color: colors.muted, textAlign: 'center', fontSize: 14, lineHeight: 24, marginTop: 12 }, button: { backgroundColor: colors.accent, minHeight: 44, borderRadius: 22, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', marginTop: 20 }, buttonText: { color: 'white', fontSize: 14, fontWeight: '600' }, result: { marginTop: 28, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#ffffff08', padding: 20 }, resultTitle: { color: 'white', fontSize: 16, fontWeight: '600' }, resultHint: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4 }, link: { color: colors.accent, fontSize: 14, fontWeight: '600' } });
