import './paymentRecoveryStorage';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import type { NavigationContainerRefWithCurrent, NavigationState } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { usePreferences } from '../PreferencesProvider';
import type { RootParamList } from '../navigation/types';
import { Feedback } from '../ui/common';
import { getNativePayment, restoreNativePayments, type PendingNativePayment } from './nativePayment';

/** Recovery waits for authentication and navigation. It never presents Stripe
 * or interrupts an active checkout, scanner or an incoming event link.
 */
export function PaymentRecovery({ navigation, state }: {
  navigation: NavigationContainerRefWithCurrent<RootParamList>; state?: NavigationState;
}) {
  const { ready, user, controller } = useAuth(), { copy } = usePreferences(), safe = useSafeAreaInsets();
  const token = controller.getToken(), accountId = user?.id ?? null;
  const [entries, setEntries] = useState<PendingNativePayment[]>([]);
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const announced = useRef(new Set<string>());
  useEffect(() => {
    if (Platform.OS === 'web' || !ready) return;
    let active = true;
    setEntries([]); setFailed(false);
    void restoreNativePayments(accountId, token).then(records => {
      if (active && controller.getToken() === token) setEntries(records);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [ready, accountId, token, controller, attempt]);
  useEffect(() => {
    if (Platform.OS === 'web' || !ready || !state || !navigation.isReady()) return;
    const route = navigation.getCurrentRoute();
    const id = (route?.params as RootParamList['CheckoutReturn'] | undefined)?.nativeOrderId;
    if (route?.name === 'CheckoutReturn' && id) announced.current.add(`${accountId}:${id}`);
    if (state.routes[state.index]?.name !== 'Tabs') return;
    const entry = entries.find(candidate => candidate.restored &&
      getNativePayment(candidate.session.orderId, candidate.eventId, token) === candidate &&
      !announced.current.has(`${accountId}:${candidate.session.orderId}`));
    if (!entry) return;
    announced.current.add(`${accountId}:${entry.session.orderId}`);
    navigation.navigate('CheckoutReturn', { eventId: entry.eventId, nativeOrderId: entry.session.orderId });
  }, [ready, state, entries, token, accountId, navigation]);
  if (!failed || Platform.OS === 'web') return null;
  return <View testID="payment-recovery-error" style={{ position: 'absolute', top: safe.top + 8, left: 16, right: 16, backgroundColor: '#151112', borderRadius: 20 }}>
    <Feedback compact title={copy('checkout.paymentRecoveryUnavailable')} retry={() => setAttempt(value => value + 1)} />
  </View>;
}
