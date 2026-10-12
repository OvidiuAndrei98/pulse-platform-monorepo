import '../checkout/paymentRecoveryStorage';
import { acknowledgeNativePayment, getNativePayment, resolveNativePayment, restoreNativePayments } from '../checkout/nativePayment';
import { canRecheckPayment, canRestartCheckout, confirmPayment, type PaymentResult } from '../checkout/confirmation';
import { CheckoutSuccessTicket, PaymentSuccessCheck } from '../checkout/CheckoutSuccess';
import { canResumePaymentBrowser, forgetPaymentBrowser, resumePaymentBrowser } from '../checkout/paymentBrowser';
import { haptic } from '../ui/haptics';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { AlertCircle, ArrowLeft, ArrowRight, Clock3, Mail, RotateCcw, Ticket, WifiOff } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { validCheckoutSession } from '../../../pulse-app/src/features/checkout/nativeReturn';
import { accountApi, useAuth } from '../auth/AuthProvider';
import { queryClient } from '../data/queries';
import { isEventId } from '../data/events';
import { usePreferences } from '../PreferencesProvider';
import { Text } from '../ui/Text';
import { MotionPressable as Pressable } from '../ui/MotionPressable';
import { colors } from '../ui/theme';
import type { RootParamList } from '../navigation/types';
import { returnToEvent } from '../navigation/returnToEvent';

type ReturnStatus = 'checking' | 'invalid' | 'cancelled' | PaymentResult;

export function CheckoutReturnScreen({ route, navigation }: NativeStackScreenProps<RootParamList, 'CheckoutReturn'>) {
  const { eventId = '', sessionId, nativeOrderId, cancelled } = route.params ?? {};
  const { user, controller, ready } = useAuth(), { copy } = usePreferences(), safe = useSafeAreaInsets();
  const token = controller.getToken(), focused = useIsFocused();
  const [status, setStatus] = useState<ReturnStatus>('checking'), [attempt, setAttempt] = useState(0);
  const [manualUsed, setManualUsed] = useState(false), manualRequested = useRef(false);
  const [orderId, setOrderId] = useState<string | undefined>();
  const [supportError, setSupportError] = useState(false);
  const [resumeError, setResumeError] = useState(false);
  const lastResume = useRef(0), successFeedback = useRef(new Set<string>());
  const initialCheck = useRef(true);

  useEffect(() => {
    manualRequested.current = false; initialCheck.current = true; setManualUsed(false); setOrderId(undefined); setSupportError(false); setResumeError(false); lastResume.current = 0;
  }, [eventId, sessionId, nativeOrderId, token]);

  useEffect(() => {
    if (!ready) return;
    if (!isEventId(eventId)) { setStatus('invalid'); return; }
    let active = true;
    const isActive = () => active && controller.getToken() === token;
    setStatus('checking');
    void (async () => {
      if (nativeOrderId && Platform.OS !== 'web') await restoreNativePayments(user?.id ?? null, token);
      if (!isActive()) return;
      const native = nativeOrderId ? getNativePayment(nativeOrderId, eventId, token) : undefined;
      if (nativeOrderId && !native) { setStatus('invalid'); return; }
      if (!native && sessionId === undefined && cancelled === '1') { setStatus('cancelled'); return; }
      if (!native && !validCheckoutSession(sessionId)) { setStatus('invalid'); return; }
      const attempts = initialCheck.current ? 4 : 1;
      initialCheck.current = false;
      const result = await confirmPayment(() => native ? resolveNativePayment(native, accountApi) : accountApi('/checkout/reconcile', { method: 'POST', body: { eventId, sessionId }, token }), isActive, undefined, attempts);
      if (!isActive() || !result) return;
      setOrderId(result.orderId ?? native?.session.orderId);
      if (['completed', 'failed', 'refunded'].includes(result.status)) forgetPaymentBrowser(eventId, sessionId, token);
      setStatus(native?.cancelRequested && native.status === 'failed' ? 'cancelled' : result.status);
      if (result.status === 'completed') {
        const identity = eventId + ':' + (nativeOrderId ?? sessionId);
        if (!successFeedback.current.has(identity)) { successFeedback.current.add(identity); haptic('success'); }
        for (const key of ['tickets', 'orders', 'event', 'event-social', 'event-friends', 'social-feed', 'notifications']) void queryClient.invalidateQueries({ queryKey: [key] });
      }
    })().catch(() => { if (isActive()) setStatus('unavailable'); });
    return () => { active = false; };
  }, [eventId, sessionId, nativeOrderId, cancelled, attempt, controller, token, user?.id, ready]);

  useEffect(() => {
    if (!focused || !['pending', 'unavailable'].includes(status)) return;
    // Returning from the provider can complete an existing payment after the
    // manual check. It never creates a purchase or consumes the manual retry.
    const resume = () => {
      if (Date.now() - lastResume.current < 30_000) return;
      lastResume.current = Date.now(); setAttempt(value => value + 1);
    };
    if (Platform.OS === 'web') {
      let left = document.visibilityState === 'hidden' || !document.hasFocus();
      const blur = () => { left = true; };
      const focus = () => { if (left && document.visibilityState !== 'hidden') { left = false; resume(); } };
      const visibility = () => document.visibilityState === 'hidden' ? blur() : focus();
      window.addEventListener('blur', blur); window.addEventListener('focus', focus); document.addEventListener('visibilitychange', visibility);
      return () => { window.removeEventListener('blur', blur); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visibility); };
    }
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') resume(); });
    return () => subscription.remove();
  }, [focused, status]);

  useEffect(() => () => {
    // Preserve pending recovery on Back; acknowledge only a terminal result.
    const entry = nativeOrderId ? getNativePayment(nativeOrderId, eventId, token) : undefined;
    if (entry) void acknowledgeNativePayment(entry).catch(() => undefined);
  }, [nativeOrderId, eventId, token]);

  const completed = status === 'completed', checking = status === 'checking';
  const canResume = (status === 'pending' || status === 'unavailable') && canResumePaymentBrowser(eventId, sessionId, token);
  const unresolved = ['pending', 'unavailable', 'missing', 'invalid'].includes(status);
  const title = 'checkoutResult.' + status + 'Title';
  const hint = status === 'pending' && manualUsed ? 'checkoutResult.pendingAfterCheckHint'
    : status === 'unavailable' && manualUsed ? 'checkoutResult.unavailableAfterCheckHint' : 'checkoutResult.' + status + 'Hint';
  const acknowledge = () => {
    const entry = nativeOrderId ? getNativePayment(nativeOrderId, eventId, token) : undefined;
    if (entry) void acknowledgeNativePayment(entry).catch(() => undefined);
  };
  const cancelAttempt = () => {
    const entry = nativeOrderId ? getNativePayment(nativeOrderId, eventId, token) : undefined;
    if (!entry || entry.status !== 'pending' || entry.cancelRequested || checking) return;
    entry.cancelRequested = true; setStatus('checking'); setAttempt(value => value + 1);
  };
  const recheck = () => {
    if (!canRecheckPayment(status, manualRequested.current)) return;
    manualRequested.current = true; setManualUsed(true); setStatus('checking'); setAttempt(value => value + 1);
  };
  const openTickets = () => {
    acknowledge();
    if (user) navigation.popTo('Tabs', { screen: 'Profile', params: { screen: 'Tickets' } });
    else navigation.replace('Auth', { mode: 'register', returnTab: 'Profile' });
  };
  const contact = () => {
    setSupportError(false);
    void Linking.openURL('mailto:contact@code-lab.ro?subject=' + encodeURIComponent('SPOTTR' + (orderId ? ' · ' + orderId : ''))).catch(() => setSupportError(true));
  };
  const canCancel = nativeOrderId && (status === 'pending' || status === 'unavailable') && getNativePayment(nativeOrderId, eventId, token)?.status === 'pending' && !getNativePayment(nativeOrderId, eventId, token)?.cancelRequested;

  return <ScrollView testID="checkout-return" style={s.screen} contentContainerStyle={[s.content, { paddingTop: Math.max(28, safe.top + 16), paddingBottom: Math.max(28, safe.bottom + 16) }]}>
    <View style={s.card}>
      {completed ? <PaymentSuccessCheck /> : <View style={s.icon}>{checking ? <ActivityIndicator size="small" color={colors.accent} /> : status === 'pending' ? <Clock3 size={30} color={colors.accent} /> : status === 'unavailable' ? <WifiOff size={28} color={colors.accent} /> : <AlertCircle size={28} color={colors.accent} />}</View>}
      <Text style={s.eyebrow}>{copy(completed ? 'checkoutResult.successEyebrow' : 'checkoutResult.paymentEyebrow')}</Text>
      <Text accessibilityRole="header" style={s.title}>{copy(title)}</Text>
      <Text accessibilityLiveRegion="polite" style={s.hint}>{copy(hint)}</Text>
      {status === 'pending' && Platform.OS === 'web' && !canResume && <Text style={s.providerHint}>{copy('checkoutResult.providerWindowHint')}</Text>}

      {completed && <>
        <CheckoutSuccessTicket eventId={eventId} orderId={orderId} />
        <Pressable testID="checkout-view-tickets" accessibilityRole="button" onPress={openTickets} style={s.primary}><Ticket size={17} color="white" /><Text style={s.buttonText}>{copy(user ? 'checkoutSuccess.viewTickets' : 'auth.createAccount')}</Text><ArrowRight size={17} color="white" /></Pressable>
        <View style={s.delivery}><View style={{ width: 15, flexShrink: 0, paddingTop: 2 }}><Mail size={15} color="#ffffff73" /></View><Text style={s.deliveryText}>{copy(user ? 'checkoutResult.accountDelivery' : 'checkoutResult.guestDelivery')}</Text></View>
      </>}

      {canResume && <Pressable testID="checkout-resume-payment" accessibilityRole="button" onPress={() => {
        setResumeError(false); lastResume.current = 0;
        try { if (!resumePaymentBrowser(eventId, sessionId, token)) setResumeError(true); } catch { setResumeError(true); }
      }} style={s.primary}><Text style={s.buttonText}>{copy('checkoutResult.resumePayment')}</Text><ArrowRight size={16} color="white" /></Pressable>}
      {resumeError && <Text accessibilityRole="alert" style={s.providerHint}>{copy('checkoutResult.resumeFailed')}</Text>}
      {canRecheckPayment(status, manualUsed) && <Pressable testID="checkout-recheck" accessibilityRole="button" onPress={recheck} style={canResume ? s.secondary : s.primary}><RotateCcw size={16} color="white" /><Text style={s.buttonText}>{copy('feedback.checkAgain')}</Text></Pressable>}
      {unresolved && user && <Pressable testID="checkout-view-orders" accessibilityRole="button" onPress={() => navigation.popTo('Tabs', { screen: 'Profile', params: { screen: 'Orders' } })} style={!canResume && (manualUsed || status === 'missing' || status === 'invalid') ? s.primary : s.secondary}><Ticket size={16} color="white" /><Text style={s.buttonText}>{copy('checkoutResult.viewOrders')}</Text></Pressable>}
      {canRestartCheckout(status) && isEventId(eventId) && <Pressable testID="checkout-return-to-event" accessibilityRole="button" onPress={() => { acknowledge(); returnToEvent(navigation, eventId); }} style={s.primary}><Text style={s.buttonText}>{copy('checkoutResult.chooseTickets')}</Text><ArrowRight size={16} color="white" /></Pressable>}
      {canCancel && <Pressable testID="checkout-cancel-attempt" accessibilityRole="button" onPress={cancelAttempt} style={s.secondary}><Text style={s.secondaryText}>{copy('checkout.cancelPaymentAttempt')}</Text></Pressable>}
      {!checking && !completed && <Pressable testID="checkout-contact-support" accessibilityRole="button" onPress={contact} style={s.secondary}><Mail size={16} color="#ffffffb3" /><Text style={s.secondaryText}>{copy('checkoutResult.contactSupport')}</Text></Pressable>}
      {supportError && <Text selectable accessibilityRole="alert" style={s.deliveryText}>{copy('checkoutResult.supportFallback')} contact@code-lab.ro</Text>}
      <Pressable testID="checkout-back-events" accessibilityRole="button" onPress={() => { acknowledge(); navigation.popTo('Tabs', { screen: 'Explore' }); }} style={s.back}><ArrowLeft size={15} color="#ffffff80" /><Text style={s.backText}>{copy('checkoutSuccess.backToEvents')}</Text></Pressable>
    </View>
  </ScrollView>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg }, content: { flexGrow: 1, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center' },
  card: { width: '100%', maxWidth: 520, padding: 24, borderRadius: 32, backgroundColor: '#101011' },
  icon: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#ff004414', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  eyebrow: { marginTop: 24, color: colors.accent, textAlign: 'center', textTransform: 'uppercase', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  title: { color: 'white', textAlign: 'center', fontSize: 28, lineHeight: 33, letterSpacing: -.8, fontWeight: '800', marginTop: 10 },
  hint: { color: '#ffffff8c', textAlign: 'center', fontSize: 14, lineHeight: 22, marginTop: 14 },
  providerHint: { color: '#ffffff66', textAlign: 'center', fontSize: 12, lineHeight: 19, marginTop: 12 },
  primary: { backgroundColor: colors.accent, minHeight: 46, borderRadius: 99, paddingHorizontal: 18, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', marginTop: 24, flexDirection: 'row', gap: 10 },
  secondary: { minHeight: 44, borderRadius: 99, backgroundColor: '#ffffff08', paddingVertical: 12, paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 12 },
  buttonText: { color: 'white', fontSize: 14, fontWeight: '600', textAlign: 'center', flexShrink: 1 }, secondaryText: { color: '#ffffffb3', fontSize: 13, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  back: { minHeight: 44, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 16 }, backText: { color: '#ffffff80', fontSize: 13, fontWeight: '500' },
  delivery: { marginTop: 18, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, deliveryText: { color: '#ffffff73', fontSize: 12, lineHeight: 19, flexShrink: 1 },
});
