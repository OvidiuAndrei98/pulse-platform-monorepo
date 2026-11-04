"use client";

import type { ScrollViewInstance } from 'react-native';

import { haptic } from "../ui/haptics";
import { openNativePaymentSheet } from "./paymentSheet";
import './paymentRecoveryStorage';
import { parseNativePayment, rememberNativePayment, resolveNativePayment, settleUnsubmittedNativePayment, getNativePayment, getPendingNativePayment, presentAndResolveNativePayment, restoreNativePayments, persistNativePayment, acknowledgeNativePayment, type PendingNativePayment } from "./nativePayment";
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

import * as Crypto from 'expo-crypto';
import { usePreventRemove } from '@react-navigation/native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, accountApi } from '../auth/AuthProvider';
import { queryClient, useEvent } from '../data/queries';
import { useEventClock } from '../data/useEventClock';
import { usePreferences } from '../usePreferences';

import { WEB_URL } from '../config';
import { ApiError } from '../data/http';

import { returnToEvent } from '../navigation/returnToEvent';
import { purchaseCompletion } from './purchaseCompletion';
import { checkoutTotals, parseBilling, parseCheckout, validPaidSelection, type Quantities } from './data';
import { usePromoCode } from './usePromoCode';

import { preparePaymentBrowser, paymentReturnOrigin } from './paymentBrowser';
import { checkoutFailure } from './errors';
import { captureHandledFailure } from '../diagnostics/handled';
import { checkoutRequestKey } from '@packages/app-core/checkout/requestKey';
import { checkoutEmailError } from '@packages/app-core/checkout/validateEmail';
import { emptyInvoiceDetails, getInvoiceFieldErrors, validateInvoiceDetails, type InvoiceDetails } from '@packages/app-core/checkout/invoiceDetails';

import { Props } from "./useCheckoutController.contracts";
import { initialTicketQuantities,retainAvailableTickets } from '@packages/app-core/checkout/ticketAvailability';

export function useCheckoutController({ route, navigation }: Props) {

  const { eventId, ticketTypeId } = route.params;
  const { user, controller, ready } = useAuth('account'), { copy, language } = usePreferences(), safe = useSafeAreaInsets();
  const query = useEvent(eventId), event = query.data, now = useEventClock(event), promo = usePromoCode(eventId);
  const [quantities, setQuantities] = useState<Quantities>(()=>initialTicketQuantities(route.params.quantities,ticketTypeId));
  useEffect(()=>{if(event)setQuantities(current=>retainAvailableTickets(event.ticketTypes,current,now));},[event,now]);
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
  return {
    advance,
    available,
    billingEdited,
    billingLoading,
    blocked,
    busy,
    changeStep,
    copy,
    details,
    email,
    emailError,
    error,
    event,
    eventId,
    now,
    fields,
    footerHeight,
    forget,
    furthest,
    language,
    navigation,
    pay,
    pending,
    promo,
    quantities,
    query,
    remember,
    safe,
    saved,
    scroll,
    setAttempted,
    setDetails,
    setEmail,
    setFooterHeight,
    setQuantities,
    setRemember,
    setSource,
    source,
    step,
    totals,
    signedIn: !!user,
    isOwnEvent: event?.organizerId === user?.id,
  };
}
export type CheckoutContentModel = ReturnType<typeof useCheckoutController>;
