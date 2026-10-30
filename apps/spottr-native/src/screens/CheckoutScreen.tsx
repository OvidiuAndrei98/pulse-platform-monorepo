import type { ScrollView as ScrollViewInstance } from 'react-native';
import { GlassPressable } from '../ui/GlassPressable';
import { ActionIcon } from '../ui/ActionIcon';
import { FormInput as TextInput } from '../ui/FormInput';
import { FormScrollView, KeyboardFooter } from "../ui/KeyboardForms";
import { haptic } from "../ui/haptics";
import { openNativePaymentSheet } from "../checkout/paymentSheet";
import '../checkout/paymentRecoveryStorage';
import { parseNativePayment, rememberNativePayment, resolveNativePayment, settleUnsubmittedNativePayment, getNativePayment, getPendingNativePayment, presentAndResolveNativePayment, restoreNativePayments, persistNativePayment, acknowledgeNativePayment, type PendingNativePayment } from "../checkout/nativePayment";
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { MotionPressable as Pressable } from '../ui/MotionPressable';
import { SelectionPressable, StateSurface, ValueText } from '../ui/StateMotion';
import { ArrowRight, Check, CreditCard, LockKeyhole, Minus, Plus, Ticket, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Crypto from 'expo-crypto';
import { usePreventRemove } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, accountApi } from '../auth/AuthProvider';
import { queryClient, useEvent } from '../data/queries';
import { useEventClock } from '../data/useEventClock';
import { usePreferences } from '../PreferencesProvider';
import { Text } from '../ui/Text';
import { Feedback, Loading } from '../ui/common';
import { colors } from '../ui/theme';
import { WEB_URL } from '../config';
import { ApiError } from '../data/http';
import type { RootParamList } from '../navigation/types';
import { returnToEvent } from '../navigation/returnToEvent';
import { purchaseCompletion } from '../checkout/purchaseCompletion';
import { checkoutTotals, parseBilling, parseCheckout, validPaidSelection, type Quantities } from '../checkout/data';
import { usePromoCode } from '../checkout/usePromoCode';
import { BillingFields, billingStyles } from '../checkout/BillingFields';
import { preparePaymentBrowser, paymentReturnOrigin } from '../checkout/paymentBrowser';
import { checkoutFailure } from '../checkout/errors';
import { captureHandledFailure } from '../diagnostics/handled';
import { checkoutRequestKey } from '../../../pulse-app/src/features/checkout/requestKey';
import { checkoutEmailError } from '../../../pulse-app/src/features/checkout/validateEmail';
import { emptyInvoiceDetails, getInvoiceFieldErrors, validateInvoiceDetails, type InvoiceDetails } from '../../../pulse-app/src/features/checkout/invoiceDetails';
import { getRemainingTicketCapacity } from '../../../pulse-app/src/features/checkout/ticketAvailability';
import { formatRon } from '../../../pulse-app/src/features/events/serviceFee';

type Props = NativeStackScreenProps<RootParamList, 'Checkout'>;
export function CheckoutScreen(props: Props) {
  const { user } = useAuth();
  return <CheckoutContent key={`${props.route.params.eventId}:${user?.id ?? 'guest'}`} {...props} />;
}
function CheckoutContent({ route, navigation }: Props) {
  const { eventId, ticketTypeId } = route.params;
  const { user, controller, ready } = useAuth(), { copy, language } = usePreferences(), safe = useSafeAreaInsets();
  const query = useEvent(eventId), event = query.data, now = useEventClock(event), promo = usePromoCode(eventId);
  const [quantities, setQuantities] = useState<Quantities>({ [ticketTypeId]: 1 });
  const [step, setStep] = useState(0), [furthest, setFurthest] = useState(0);
  const [email, setEmail] = useState(user?.email ?? ''), [details, setDetails] = useState(() => emptyInvoiceDetails(user?.username ?? ''));
  const [saved, setSaved] = useState<InvoiceDetails | null>(null), [source, setSource] = useState<'new' | 'saved'>('new'), [remember, setRemember] = useState(false);
  const [billingLoading, setBillingLoading] = useState(!!user), [attempted, setAttempted] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [returned, setReturned] = useState<{ sessionId?: string; nativeOrderId?: string } | null>(null);
  const scroll = useRef<ScrollViewInstance>(null), alive = useRef(true), pending = useRef(false), billingEdited = useRef(false);
  const intent = useRef<{ payload: string; key: string } | null>(null);
  const nativePayment = useRef<PendingNativePayment | null>(null);
  const token = controller.getToken();
  const [footerHeight, setFooterHeight] = useState(56 + Math.max(28, safe.bottom));
  useEffect(() => {
    if (Platform.OS === 'web' || !ready) return;
    let active = true;
    void restoreNativePayments(user?.id ?? null, token).then(() => {
      if (!active || controller.getToken() !== token) return;
      const outstanding = getPendingNativePayment(eventId, token);
      if (outstanding) {
        nativePayment.current = outstanding;
      }
    }).catch(() => { if (active) setError('checkout.paymentRecoveryUnavailable'); });
    return () => { active = false; };
  }, [eventId, token, user?.id, ready, controller]);
  const browser = useRef<ReturnType<typeof preparePaymentBrowser> | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; browser.current?.dispose(); }; }, []);
  usePreventRemove(busy, () => {});
  useEffect(() => { navigation.setOptions({ gestureEnabled: !busy }); }, [busy, navigation]);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [step]);
  useEffect(() => {
    if (!returned || busy) return;
    setReturned(null);
    const entry = returned.nativeOrderId ? getNativePayment(returned.nativeOrderId, eventId, token) : undefined;
    // presentAndResolveNativePayment already verified this result with the API.
    // The SDK's successful UI outcome alone never reaches this branch.
    if (entry?.status === 'completed') {
      purchaseCompletion.confirm({ status: entry.status, orderId: entry.session.orderId }, eventId, token);
      for (const key of ['tickets', 'orders', 'event', 'event-social', 'event-friends', 'social-feed', 'notifications']) void queryClient.invalidateQueries({ queryKey: [key] });
      haptic('success');
      returnToEvent(navigation, eventId);
      return;
    }
    navigation.navigate('CheckoutReturn', { eventId, ...returned });
  }, [returned, busy, navigation, eventId, token]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    void accountApi<{ details: unknown }>('/users/me/billing-details').then(response => {
      if (!active) return;
      const value = parseBilling(response.details);
      setSaved(value);
      if (value && !billingEdited.current) { setDetails(value); setSource('saved'); }
    }).catch(() => { if (active) setError('checkout.billingLoadFailed'); }).finally(() => { if (active) setBillingLoading(false); });
    return () => { active = false; };
  }, [user?.id]);
  const totals = event ? checkoutTotals(event, quantities, promo.applied?.discountPercent) : null;
  const available = !!event && validPaidSelection(event, quantities, user?.id, now);
  const blocked = busy || billingLoading || query.isFetching || query.isError || !available || promo.validating || !!(promo.code && !promo.applied);
  const fields = attempted ? getInvoiceFieldErrors(details) : {};
  const emailError = attempted ? checkoutEmailError(email) : null;
  const changeStep = (value: number) => { if (pending.current) return; Keyboard.dismiss(); if (value !== step) haptic("selection"); setStep(value); };
  const validate = () => {
    setAttempted(true);
    if (checkoutEmailError(email) || validateInvoiceDetails(details)) { setStep(1); return false; }
    return true;
  };
  const withBusy = async (run: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try { await run(); } finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  const advance = async () => {
    if (blocked || pending.current) return;
    if (step === 0) { setFurthest(Math.max(1, furthest)); changeStep(1); return; }
    if (!validate()) return;
    await withBusy(async () => {
      if (user && source === 'new' && remember) {
        try {
          const value = parseBilling(await accountApi('/users/me/billing-details', { method: 'PUT', body: details }));
          if (alive.current && value) { setSaved(value); setDetails(value); setSource('saved'); setRemember(false); }
        } catch { if (alive.current) setError('checkout.billingSaveFailed'); }
      }
      if (alive.current) { Keyboard.dismiss(); setFurthest(2); setStep(2); }
    });
  };
  const forget = () => withBusy(async () => {
    try { await accountApi('/users/me/billing-details', { method: 'DELETE' }); if (alive.current) { setSaved(null); setSource('new'); setDetails(emptyInvoiceDetails(user?.username ?? '')); setRemember(false); } }
    catch { if (alive.current) setError('checkout.billingRemoveFailed'); }
  });
  const pay = async () => {
    if (blocked || pending.current || !event || !totals || !validate()) return;
    const token = controller.getToken();
    await withBusy(async () => {
      try {
        // A pending native transaction must be resolved before another purchase.
        if (Platform.OS !== 'web') {
          // A fast Pay press must wait for disk recovery too; the startup effect
          // alone cannot protect against racing another order after a restart.
          await restoreNativePayments(user?.id ?? null, token);
          if (!alive.current || controller.getToken() !== token) return;
          nativePayment.current ??= getPendingNativePayment(eventId, token) ?? null;
        }
        if (Platform.OS !== 'web' && nativePayment.current?.owner === token) {
          if (nativePayment.current.status === 'pending') {
            await settleUnsubmittedNativePayment(nativePayment.current, accountApi);
            if (!alive.current || controller.getToken() !== token) return;
          }
          if (nativePayment.current.status !== 'failed' && nativePayment.current.status !== 'refunded') {
            setReturned({ nativeOrderId: nativePayment.current.session.orderId }); return;
          }
          await acknowledgeNativePayment(nativePayment.current).catch(() => undefined);
          nativePayment.current = null; intent.current = null;
        }
        // Web popup creation stays synchronous with the press to avoid blockers.
        if (Platform.OS === 'web') browser.current = preparePaymentBrowser(token);
        const body = { expectedTotalBani: Math.round(totals.total * 100), email: email.trim(), items: totals.tickets.map(ticket => ({ ticketTypeId: ticket.id, quantity: quantities[ticket.id] })), promoCode: promo.applied?.code, billingDetails: details, ...(Platform.OS !== 'web' ? { client: 'native_sheet' } : { client: 'native_web', returnOrigin: paymentReturnOrigin() }) };
        intent.current = checkoutRequestKey(intent.current, JSON.stringify({ eventId, userId: user?.id, body }), () => Crypto.getRandomBytes(16));
        const raw = await accountApi('/events/' + eventId + '/tickets/purchase', { method: 'POST', body, token, idempotencyKey: intent.current.key });
        if (Platform.OS === 'web') {
          const response = parseCheckout(raw, WEB_URL, paymentReturnOrigin());
          if (!alive.current || controller.getToken() !== token) return;
          await browser.current!.open(response.checkoutUrl, { eventId, sessionId: response.sessionId });
          if (alive.current && controller.getToken() === token) setReturned({ sessionId: response.sessionId });
          return;
        }
        const response = parseNativePayment(raw);
        if (!alive.current || controller.getToken() !== token) {
          const entry: PendingNativePayment = { session: response, eventId, owner: token, cancelRequested: true, status: 'pending' };
          await resolveNativePayment(entry, accountApi).catch(() => undefined);
          return;
        }
        const retained = rememberNativePayment(response, eventId, token);
        nativePayment.current = retained;
        let nativeFailure: unknown;
        const outcome = await presentAndResolveNativePayment(retained,
          async () => {
            // Commit recovery before the user can authorize any charge.
            await persistNativePayment(retained, user?.id ?? null);
            if (!alive.current || controller.getToken() !== token) throw new ApiError(0, 'PAYMENT_SESSION_CHANGED');
            return openNativePaymentSheet(response, email.trim(), details);
          }, accountApi, error => { nativeFailure = error; });
        if (outcome !== 'verify') {
          await acknowledgeNativePayment(retained).catch(() => undefined);
          nativePayment.current = null; intent.current = null;
          if (outcome === 'failed' && alive.current && controller.getToken() === token) setError(checkoutFailure(nativeFailure).messageKey);
          return;
        }
        if (alive.current && controller.getToken() === token) setReturned({ nativeOrderId: response.orderId });
      } catch (error) {
        captureHandledFailure(error, 'payment_prepare');
        if (!alive.current || controller.getToken() !== token) return;
        // No payload, token, billing details or Stripe secrets in diagnostics.
        if (__DEV__) console.warn('[checkout] Payment preparation failed', error instanceof ApiError
          ? { status: error.status, code: error.code }
          : { name: error instanceof Error ? error.name : 'UnknownError', message: error instanceof Error ? error.message : 'Unknown failure' });
        if (error instanceof ApiError && error.status >= 400 && error.status < 500 && ![408, 425, 429].includes(error.status)) intent.current = null;
        const failure = checkoutFailure(error);
        setError(failure.messageKey);
        if (failure.resetSelection) {
          setQuantities({}); setStep(0); setFurthest(0);
          void query.refetch();
        }
      } finally { browser.current?.dispose(); browser.current = null; }
    });
  };
  const prices = totals && <View style={s.prices}>
    <Price label={copy('checkout.tickets')} value={formatRon(totals.subtotal)} />
    {promo.applied && totals.discount > 0 && <Price accent label={copy('checkout.discount', { code: promo.applied.code, percent: promo.applied.discountPercent })} value={'-' + formatRon(totals.discount)} />}
    <Price label={copy(event?.organizerAbsorbsServiceFee ? 'checkout.ticketingProcessingFeeCoveredByOrganizer' : 'checkout.ticketingProcessingFee')} value={formatRon(totals.fee)} />
    <View style={s.total}><Text style={s.totalText}>{copy('checkout.total')}</Text><ValueText testID="checkout-total" style={[s.totalText, { color: colors.accent }]}>{formatRon(totals.total)}</ValueText></View>
  </View>;
  return <View testID="checkout-screen" style={s.screen}>
    <View testID="checkout-header" style={{ paddingTop: Math.max(16, safe.top + 12) }}>
      <View style={s.header}><GlassPressable fallback={Pressable} testID="checkout-back" accessibilityRole="button" accessibilityLabel={copy('common.back')} disabled={busy} onPress={() => { if (!pending.current) { if (step) changeStep(step - 1); else navigation.goBack(); } }} style={s.back}><ActionIcon name="back" size={20} color="white" /></GlassPressable>
        <View style={{ flex: 1, alignItems: 'center' }}><Text style={s.title}>{copy('checkout.checkoutTitle')}</Text><Text style={s.subtitle}>{copy('checkout.stepOf', { step: step + 1, total: 3 })}</Text></View>
        <GlassPressable fallback={Pressable} testID="checkout-close" accessibilityRole="button" accessibilityLabel={copy('checkout.backToTickets')} disabled={busy} onPress={() => { if (!pending.current) navigation.goBack(); }} style={s.back}><ActionIcon name="close" size={16} color="#ffffff80" /></GlassPressable>
      </View>
      <View style={s.progress}>{[0, 1, 2].map(index => <StateSurface key={index} background={index <= step ? colors.accent : '#ffffff1a'} style={s.progressPart} />)}</View>
    </View>
    <FormScrollView ref={scroll} style={{ flex: 1 }} bottomOffset={footerHeight + 16} testID="checkout-scroll" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
      {!event ? query.isPending ? <Loading /> : <Feedback title={copy('feedback.loadFailed')} retry={() => void query.refetch()} /> : <View style={s.body}>
        <View style={s.event}><View style={s.date}><Text style={s.day}>{new Date(event.startTime).toLocaleDateString(language, { day: '2-digit', timeZone: 'Europe/Bucharest' })}</Text><Text style={s.month}>{new Date(event.startTime).toLocaleDateString(language, { month: 'short', timeZone: 'Europe/Bucharest' })}</Text></View><View style={{ flex: 1 }}><Text style={s.title}>{event.title}</Text><Text style={s.category}>{event.category}</Text></View></View>
        {query.isError && <Feedback compact title={copy('checkout.availabilityCheckFailed')} retry={() => void query.refetch()} />}
        {!available && !query.isFetching && <Feedback compact title={copy(event.organizerId === user?.id ? 'eventPage.cannotBuyOwn' : 'checkout.selectionUnavailable')} />}
        {!available && !busy && <Pressable testID="checkout-reselect" accessibilityRole="button" onPress={() => returnToEvent(navigation, eventId)} style={s.billingChoice}><Text style={s.category}>{copy('checkout.backToTickets')}</Text></Pressable>}
        <Step number={1} active={step === 0} completed={furthest > 0} title={copy('checkout.tickets')} hint={copy('checkout.ticketStepHint')} summary={totals?.tickets.map(t => `${quantities[t.id]} × ${t.name}`).join(', ')} disabled={busy} edit={() => changeStep(0)}>
          {totals?.tickets.map(ticket => <View key={ticket.id} style={{ gap: 8 }}><Text style={s.ticketName}>{ticket.name}</Text><Text style={s.ticketPrice}>{formatRon(ticket.priceRon)}</Text>{!!ticket.description && <Text style={s.description}>{ticket.description}</Text>}
            <View style={s.quantity}><Text style={s.description}>{copy('checkout.quantity')}</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable testID="checkout-minus" accessibilityRole="button" accessibilityLabel={copy('checkout.decreaseQuantity', { name: ticket.name })} disabled={busy || quantities[ticket.id]! <= 1} onPress={() => { if (!pending.current) setQuantities(value => ({ ...value, [ticket.id]: Math.max(1, (value[ticket.id] ?? 1) - 1) })); }} style={[s.quantityButton, (busy || quantities[ticket.id]! <= 1) && { opacity: 0.25 }]}><Minus color="white" size={20} /></Pressable>
              <ValueText testID="checkout-quantity" style={{ color: 'white', fontSize: 16, minWidth: 24, textAlign: 'center' }}>{quantities[ticket.id]}</ValueText>
              <Pressable testID="checkout-plus" accessibilityRole="button" accessibilityLabel={copy('checkout.increaseQuantity', { name: ticket.name })} disabled={busy || quantities[ticket.id]! >= Math.min(8, getRemainingTicketCapacity(ticket))} onPress={() => { if (!pending.current) setQuantities(value => ({ ...value, [ticket.id]: Math.min(8, getRemainingTicketCapacity(ticket), (value[ticket.id] ?? 1) + 1) })); }} style={[s.quantityButton, (busy || quantities[ticket.id]! >= Math.min(8, getRemainingTicketCapacity(ticket))) && { opacity: 0.25 }]}><Plus color="white" size={20} /></Pressable>
            </View></View></View>)}
          <View style={s.prices}><Text style={s.label}>{copy('auth.promoCode')}</Text><View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TextInput variant="billing" testID="checkout-promo" accessibilityLabel={copy('auth.promoCode')} value={promo.code} onChangeText={promo.setCode} editable={!busy && !promo.applied} maxLength={40} autoCapitalize="characters" autoCorrect={false} placeholder={copy('auth.promoPlaceholder')} placeholderTextColor={colors.muted} onSubmitEditing={() => void promo.apply()} style={[billingStyles.input, { flex: 1, height: 40 }]} />
            <Pressable testID="checkout-promo-apply" accessibilityRole="button" accessibilityLabel={copy(promo.applied ? 'checkout.removePromo' : 'checkout.applyPromo')} disabled={busy || promo.validating || (!promo.applied && promo.code.length < 3)} onPress={() => promo.applied ? promo.clear() : void promo.apply()} style={s.apply}>{promo.validating ? <ActivityIndicator color="white" size="small" /> : promo.applied ? <X color="white" size={16} /> : <Text style={s.label}>{copy('checkout.applyPromo')}</Text>}</Pressable>
          </View>{promo.applied && <Text style={s.category}>{copy('checkout.promoApplied', { percent: promo.applied.discountPercent })}</Text>}{promo.error && <Text style={billingStyles.error}>{copy(promo.error)}</Text>}</View>
          {prices}
        </Step>
        <Step number={2} active={step === 1} completed={furthest > 1} title={copy('checkout.billingPayment')} hint={copy('checkout.billingStepHint')} summary={details.name + ' · ' + copy('checkout.stripePayment')} disabled={blocked} edit={() => changeStep(1)}>
          <View style={s.stripe}><CreditCard size={20} color={colors.accent} /><View style={{ flex: 1 }}><Text style={s.label}>{copy('checkout.stripePayment')}</Text><Text style={s.hint}>{copy(Platform.OS === 'web' ? 'checkout.stripeRedirectHint' : 'checkout.stripeNativeHint')}</Text></View><Check size={16} color={colors.accent} /></View>
          <Text style={s.label}>{copy('eventSheet.emailForTickets')}</Text><TextInput variant="billing" testID="checkout-email" accessibilityLabel={copy('eventSheet.emailForTickets')} aria-invalid={!!emailError} value={email} onChangeText={setEmail} editable={!busy} keyboardType="email-address" autoComplete="email" autoCapitalize="none" autoCorrect={false} maxLength={254} placeholder={copy('checkout.emailPlaceholder')} placeholderTextColor={colors.muted} style={[billingStyles.input, { marginTop: 8 }, !!emailError && billingStyles.invalid]} />
          {emailError && <Text accessibilityRole="alert" style={billingStyles.error}>{copy(emailError)}</Text>}
          {billingLoading ? <Loading /> : <>
            {saved && <View style={{ gap: 8, marginTop: 16 }}>{(['saved', 'new'] as const).map(value => <SelectionPressable key={value} background={source === value ? '#ff00441a' : '#ffffff05'} border={source === value ? '#ff0044b3' : '#ffffff1a'} accessibilityRole="radio" accessibilityState={{ checked: source === value }} disabled={busy} onPress={() => { billingEdited.current = true; setSource(value); setDetails({ ...saved }); setAttempted(false); setRemember(value === 'new'); }} style={s.billingChoice}><Text style={s.label}>{copy(value === 'saved' ? 'checkout.useSavedBilling' : 'checkout.useOtherBilling')}</Text>{value === 'saved' && <Text style={s.hint}>{saved.name} · {saved.address}, {saved.city}</Text>}</SelectionPressable>)}</View>}
            {source === 'saved' && saved ? <Pressable disabled={busy} accessibilityRole="button" onPress={() => void forget()} style={{ minHeight: 40, justifyContent: 'center' }}><Text style={[s.hint, { textDecorationLine: 'underline' }]}>{copy('checkout.removeSavedBilling')}</Text></Pressable> : <>
              <BillingFields value={details} onChange={value => { billingEdited.current = true; setDetails(value); }} errors={fields} disabled={busy} />
              {user && <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}><Switch testID="checkout-remember" value={remember} onValueChange={setRemember} disabled={busy} trackColor={{ true: colors.accent }} accessibilityLabel={copy('checkout.rememberBilling')} /><View style={{ flex: 1 }}><Text style={s.label}>{copy(saved ? 'checkout.replaceSavedBilling' : 'checkout.rememberBilling')}</Text><Text style={s.hint}>{copy('checkout.rememberBillingHint')}</Text></View></View>}
            </>}
          </>}
        </Step>
        <Step number={3} active={step === 2} completed={false} title={copy('checkout.orderSummary')} hint={copy('checkout.summaryStepHint')}>
          {totals?.tickets.map(ticket => <Price key={ticket.id} label={`${quantities[ticket.id]} × ${ticket.name}`} value={formatRon(quantities[ticket.id]! * ticket.priceRon)} />)}{prices}
          <View style={s.prices}><Text style={s.hint}>{email}</Text><Text style={s.label}>{details.name}</Text>{details.type === 'company' && <Text style={s.hint}>{details.taxId} {details.registrationNumber}</Text>}<Text style={s.hint}>{[details.address, details.city, details.sector || details.county, details.country].filter(Boolean).join(', ')}</Text><Text style={s.hint}>{copy('checkout.stripePayment')}</Text></View>
        </Step>
      </View>}
    </FormScrollView>
    <KeyboardFooter><LinearGradient onLayout={event => setFooterHeight(event.nativeEvent.layout.height)} colors={['#0000001a', '#000000b3', '#000000']} style={[s.footer, { paddingBottom: Math.max(28, safe.bottom) }]}>
      {error && <Text testID="checkout-error" accessibilityRole="alert" accessibilityLiveRegion="polite" style={[billingStyles.error, { lineHeight: 18, marginBottom: 12 }]}>{copy(error)}</Text>}
      <Pressable testID="checkout-next" accessibilityRole="button" disabled={blocked} onPress={() => void (step === 2 ? pay() : advance())} style={[s.cta, blocked && { opacity: 0.4 }]}>{busy ? <ActivityIndicator size="small" color="white" /> : step === 2 ? <Ticket size={16} color="white" /> : <ArrowRight size={16} color="white" />}<Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>{copy(busy ? 'checkout.preparingPayment' : step === 2 ? 'checkout.confirmAndPay' : step === 1 ? 'checkout.continueToSummary' : 'common.next', { total: formatRon(totals?.total ?? 0) })}</Text></Pressable>
    </LinearGradient></KeyboardFooter>
  </View>;
}
function Price({ label, value, accent }: { label: string; value: string; accent?: boolean }) { return <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}><Text style={[s.hint, { flex: 1 }, accent && { color: colors.accent }]}>{label}</Text><ValueText style={[s.hint, accent && { color: colors.accent }]}>{value}</ValueText></View>; }
function Step({ number, title, hint, summary, active, completed, edit, disabled, children }: React.PropsWithChildren<{ number: number; title: string; hint: string; summary?: string; active: boolean; completed: boolean; edit?: () => void; disabled?: boolean }>) {
  const { copy } = usePreferences();
  return <StateSurface testID={'checkout-step-' + number} background="#151112" border={active ? '#ff004499' : '#ff004400'} style={[s.card, active && { boxShadow: '0 1px 20px -10px #ff0044' }]}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    <StateSurface style={s.number} background={active ? colors.accent : completed ? '#10b981' : '#00000000'}>{active ? <Text style={s.label}>{number}</Text> : completed ? <Check size={16} color="white" /> : <LockKeyhole size={16} color="#ffffff4d" />}</StateSurface>
    <View style={{ flex: 1 }}><Text style={[s.stepTitle, !active && !completed && { color: '#ffffff59' }]}>{title}</Text>{(active || completed) && <Text style={s.hint}>{active ? hint : summary}</Text>}</View>
    {!active && completed && edit && <Pressable accessibilityRole="button" disabled={disabled} onPress={edit} style={{ minHeight: 40, justifyContent: 'center' }}><Text style={s.category}>{copy('checkout.editStep')}</Text></Pressable>}
  </View>{active && <View style={s.stepBody}>{children}</View>}</StateSurface>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#080909' }, header: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 16 }, back: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff0f', alignItems: 'center', justifyContent: 'center' }, title: { color: colors.text, fontSize: 18, fontWeight: '700' }, subtitle: { color: '#ffffff73', fontSize: 12, letterSpacing: 1.2, marginTop: 4 }, progress: { marginTop: 20, marginHorizontal: 16, flexDirection: 'row', gap: 8 }, progressPart: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#ffffff1a' }, body: { paddingHorizontal: 16, paddingTop: 24, gap: 12 }, event: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 4, marginBottom: 8 }, date: { paddingRight: 12, borderRightWidth: 1, borderRightColor: '#ffffff33', alignItems: 'center' }, day: { fontSize: 24, fontWeight: '700', color: '#ffffff8c' }, month: { fontSize: 12, textTransform: 'uppercase', color: '#ffffff8c', marginTop: 4 }, category: { fontSize: 12, fontWeight: '600', color: colors.accent, marginTop: 4 }, card: { padding: 16, borderRadius: 24, borderWidth: 1, borderColor: 'transparent', backgroundColor: '#151112' }, number: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' }, stepTitle: { fontSize: 16, fontWeight: '600', color: 'white' }, hint: { fontSize: 12, lineHeight: 20, color: '#ffffff73', marginTop: 4 }, label: { color: 'white', fontSize: 14, fontWeight: '600' }, stepBody: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#ffffff1a' }, ticketName: { fontSize: 18, fontWeight: '700', color: colors.accent }, ticketPrice: { fontSize: 16, fontWeight: '600', color: colors.accent }, description: { fontSize: 14, lineHeight: 22, color: '#ffffff80' }, quantity: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 }, quantityButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#ffffff80', alignItems: 'center', justifyContent: 'center' }, prices: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#ffffff1a', paddingTop: 16, gap: 8 }, total: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: '#ffffff1a', paddingTop: 12 }, totalText: { fontSize: 16, fontWeight: '700', color: 'white' }, apply: { paddingHorizontal: 14, height: 40, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }, stripe: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#ff004499', backgroundColor: '#ff00440d', padding: 16, borderRadius: 16, marginBottom: 20 }, billingChoice: { padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#ffffff05' }, footer: { paddingHorizontal: 16, paddingTop: 12 }, cta: { height: 44, borderRadius: 99, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 20, boxShadow: '0 8px 20px #ff004433' },
});
