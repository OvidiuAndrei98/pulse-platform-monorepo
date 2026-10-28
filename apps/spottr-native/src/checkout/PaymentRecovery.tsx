import './paymentRecoveryStorage';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { NavigationContainerRefWithCurrent, NavigationState } from '@react-navigation/native';
import { accountApi, useAuth } from '../auth/AuthProvider';
import { queryClient } from '../data/queries';
import type { RootParamList } from '../navigation/types';
import { haptic } from '../ui/haptics';
import { acknowledgeNativePayment, getNativePayment, resolveNativePayment, restoreNativePayments, type PendingNativePayment } from './nativePayment';
import { purchaseCompletion } from './purchaseCompletion';

/** An interrupted PaymentSheet is not evidence of a charge. Reconcile quietly,
 * without opening a failure/pending screen or cancelling a payment on startup.
 * The server's worker/webhooks continue fulfillment even when the app is closed.
 */
export function PaymentRecovery({ navigation, state }: {
  navigation: NavigationContainerRefWithCurrent<RootParamList>; state?: NavigationState;
}) {
  const { ready, user, controller } = useAuth();
  const token = controller.getToken(), accountId = user?.id ?? null;
  const [completed, setCompleted] = useState<PendingNativePayment[]>([]);
  const latest = useRef(state), check = useRef(() => {}), announced = useRef(new Set<PendingNativePayment>());
  latest.current = state;
  const available = () => navigation.isReady() && latest.current?.routes[latest.current.index]?.name === 'Tabs' && AppState.currentState === 'active';
  useEffect(() => {
    if (Platform.OS === 'web' || !ready) return;
    let active = true, running = false, storageRetryAt = 0;
    const checked = new Map<PendingNativePayment, number>();
    const current = (entry?: PendingNativePayment) => active && controller.getToken() === token &&
      (!entry || getNativePayment(entry.session.orderId, entry.eventId, token) === entry);
    // An explicit checkout can take ownership while a background request is
    // outstanding. Remember that handoff even after its sheet is dismissed and
    // before the asynchronous Keychain cleanup finishes.
    const claimPresented = () => {
      const receipt = purchaseCompletion.getSnapshot();
      if (!current() || receipt?.owner !== token || !receipt?.orderId) return;
      const entry = getNativePayment(receipt.orderId, receipt.eventId, token);
      if (entry) announced.current.add(entry);
    };
    const unsubscribe = purchaseCompletion.subscribe(claimPresented);
    claimPresented();
    setCompleted([]);
    const run = async () => {
      if (running || !current() || !available() || Date.now() < storageRetryAt) return;
      running = true;
      try {
        let entries: PendingNativePayment[];
        try { entries = await restoreNativePayments(accountId, token); }
        catch { storageRetryAt = Date.now() + 60_000; return; }
        if (!current() || !available()) return;
        // One bounded pass per foreground/navigation trigger, not continuous
        // polling. Least recently checked entries first, so a pending order
        // cannot starve others. The API's limit is shared across venue Wi-Fi.
        const candidates = entries.filter(entry => entry.restored && !announced.current.has(entry) &&
          Date.now() - (checked.get(entry) ?? -Infinity) >= 60_000)
          .sort((a, b) => (checked.get(a) ?? -Infinity) - (checked.get(b) ?? -Infinity)).slice(0, 4);
        for (const entry of candidates) {
          if (!current(entry) || !available()) return;
          const receipt = purchaseCompletion.getSnapshot();
          if (receipt?.orderId === entry.session.orderId && receipt.owner === token) { announced.current.add(entry); continue; }
          checked.set(entry, Date.now());
          try {
            // A concurrent foreground confirmation may already have verified it.
            const result = entry.status === 'pending' ? await resolveNativePayment(entry, accountApi) : { status: entry.status };
            if (!current(entry)) return;
            if (announced.current.has(entry)) continue;
            if (result.status === 'pending') continue;
            for (const key of ['tickets', 'orders', 'event', 'event-social', 'event-friends', 'social-feed', 'notifications']) {
              void queryClient.invalidateQueries({ queryKey: [key] });
            }
            if (result.status === 'completed') {
              // Keep the verified result if the user navigated away meanwhile.
              // Its presentation waits for Tabs/foreground without another call.
              setCompleted(previous => previous.includes(entry) ? previous : [...previous, entry]);
            } else {
              await acknowledgeNativePayment(entry);
              if (!current()) return;
            }
          } catch {
            // Offline, 404, malformed responses and storage failures say nothing
            // about whether money moved. Keep recovery and the existing order's
            // duplicate-payment guard; an explicit checkout can still retry.
          }
        }
      } finally { running = false; }
    };
    check.current = () => { void run(); };
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') {
        // A verified result may have arrived while the app was backgrounded.
        setCompleted(previous => [...previous]);
        void run();
      }
    });
    void run();
    return () => { active = false; check.current = () => {}; subscription.remove(); unsubscribe(); };
  }, [ready, accountId, token, controller, navigation]);

  useEffect(() => { check.current(); }, [state, ready]);
  useEffect(() => {
    if (Platform.OS === 'web' || !ready || !available() || purchaseCompletion.getSnapshot()) return;
    const entry = completed.find(candidate => candidate.restored && candidate.status === 'completed' &&
      getNativePayment(candidate.session.orderId, candidate.eventId, token) === candidate && !announced.current.has(candidate));
    if (!entry) return;
    announced.current.add(entry);
    // Do not send a confirmed success to another network-dependent check page.
    purchaseCompletion.confirm({ status: entry.status, orderId: entry.session.orderId }, entry.eventId, token);
    haptic('success');
    navigation.navigate('Event', { id: entry.eventId, presentation: 'page' });
  }, [ready, state, completed, token, navigation]);

  return null;
}
