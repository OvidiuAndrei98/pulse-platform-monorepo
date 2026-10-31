import { AccentPressable } from '../ui/AccentPressable';
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertCircle, Ticket } from 'lucide-react-native';
import { useAuth, accountApi } from '../auth/AuthProvider';
import { usePreferences } from '../usePreferences';
import { useTickets } from '../data/useTickets';
import type { UserTicket } from '../data/tickets';
import type { RootParamList } from '../navigation/types';
import { TicketSheet } from '../profile/TicketSheet';
import { AppSheet } from '../ui/AppSheet';
import { AppSheetScrollView } from '../ui/AppSheetScrollView';
import { MotionPressable as Pressable } from '../ui/MotionPressable';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { PaymentSuccessCheck } from './CheckoutSuccess';
import { acknowledgeNativePayment, getNativePayment } from './nativePayment';
import { purchaseCompletion, ticketsForPurchase, type PurchaseCompletion } from './purchaseCompletion';
import { verifyTicketDelivery } from './ticketDelivery';
import {ActionButton as UIActionButton} from '../ui/ActionButton';

/** Render inside the original event, after checkout leaves the native stack. */
export function PurchaseSuccessHost({ eventId }: { eventId: string }) {
  const { controller } = useAuth(), focused = useIsFocused();
  const receipt = useSyncExternalStore(purchaseCompletion.subscribe, purchaseCompletion.getSnapshot, () => null);
  if (!focused || !receipt || receipt.eventId !== eventId || receipt.owner !== controller.getToken()) return null;
  return <PurchaseSuccessSheet key={receipt.orderId ?? eventId} receipt={receipt} />;
}

function PurchaseSuccessSheet({ receipt }: { receipt: PurchaseCompletion }) {
  const { user, controller } = useAuth(), { copy } = usePreferences();
  const navigation = useNavigation<NativeStackNavigationProp<RootParamList>>();
  const safe = useSafeAreaInsets(), { height, fontScale } = useWindowDimensions();
  const [group, setGroup] = useState<UserTicket[] | null>(null);
  const query = useTickets(!!user, !!group);
  const [closing, setClosing] = useState(false), [loading, setLoading] = useState(false), [failed, setFailed] = useState(false);
  const action = useRef<'dismiss' | 'ticket' | 'all' | 'register'>('dismiss'), nextTickets = useRef<UserTicket[]>([]), busy = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const current = () => alive.current && controller.getToken() === receipt.owner && purchaseCompletion.getSnapshot() === receipt;
  const finish = () => {
    const entry = receipt.orderId ? getNativePayment(receipt.orderId, receipt.eventId, receipt.owner) : undefined;
    if (entry) void acknowledgeNativePayment(entry).catch(() => undefined);
    purchaseCompletion.dismiss(receipt);
  };
  const close = () => {
    if (!current()) return;
    if (action.current === 'ticket') { action.current = 'dismiss'; setClosing(false); setGroup(nextTickets.current); return; }
    finish();
    if (action.current === 'all') navigation.popTo('Tabs', { screen: 'Profile', params: { screen: 'Tickets' } });
    if (action.current === 'register') navigation.navigate('Auth', { mode: 'register', returnTab: 'Profile' });
  };
  const leave = (destination: typeof action.current) => {
    if (closing) return;
    action.current = destination; setClosing(true);
  };
  const openTicket = async () => {
    if (busy.current || closing) return;
    if (!user) { leave('register'); return; }
    busy.current = true; setLoading(true); setFailed(false);
    try {
      let tickets = ticketsForPurchase(query.data ?? [], receipt);
      if (!tickets.length || query.isError) {
        const result = await query.refetch();
        if (result.isError) throw result.error;
        tickets = ticketsForPurchase(result.data?.tickets ?? [], receipt);
        if (!tickets.length && result.data?.source === 'server' && current()) {
          void verifyTicketDelivery(receipt, result.data.tickets,
            () => accountApi('/users/me/orders', { token: receipt.owner }), current);
        }
      }
      if (!current()) return;
      if (!tickets.length) { setFailed(true); return; }
      nextTickets.current = tickets; leave('ticket');
    } catch { if (current()) setFailed(true); }
    finally { busy.current = false; if (current()) setLoading(false); }
  };
  const currentTickets = ticketsForPurchase(query.data ?? [], receipt);
  if (group?.length && currentTickets.length) return <TicketSheet tickets={currentTickets} initialId={group[0]!.id} onClose={finish} offline={query.offline} savedAt={query.savedAt} />;
  const unavailable = !!group;
  // Compact on ordinary phones; allow text to scroll at large accessibility
  // sizes or in landscape rather than clipping either action.
  const sheetHeight = Math.min(0.9, Math.max(440, Math.min(520, height * 0.59)) * Math.max(1, Math.min(fontScale, 1.5)) / height);
  return <View style={StyleSheet.absoluteFill} testID="purchase-success-overlay">
    <AppSheet open embedded edgeToEdge closing={closing} onClose={close} height={sheetHeight} label={copy('common.close')} testID="purchase-success-sheet">
      <AppSheetScrollView style={s.surface} contentContainerStyle={[s.content, { paddingBottom: Math.max(22, safe.bottom + 16) }]} showsVerticalScrollIndicator={false}>
        <Text accessibilityRole="header" style={s.title}>{copy(unavailable ? 'checkoutResult.ticketUnavailableTitle' : 'checkoutResult.completedTitle')}</Text>
        <Text accessibilityLiveRegion="polite" style={s.hint}>{copy(unavailable ? 'checkoutResult.ticketUnavailableHint' : user ? 'checkoutResult.sheetSuccessHint' : 'checkoutResult.guestDelivery')}</Text>
        <View style={s.check}>{unavailable ? <AlertCircle size={64} color={colors.accent} /> : <PaymentSuccessCheck green size={96} />}</View>
        {failed && <Text accessibilityRole="alert" style={s.error}>{copy('checkoutResult.ticketLoadFailed')}</Text>}
        <UIActionButton testID="checkout-view-tickets" accessibilityRole="button" accessibilityState={{ busy: loading, disabled: loading || closing }} disabled={loading || closing} onPress={() => unavailable ? leave('all') : void openTicket()} style={s.primary}>
          {loading ? <ActivityIndicator size="small" color="white" /> : <Ticket size={18} color="white" />}
          <Text style={s.primaryText}>{copy(unavailable ? 'checkoutResult.checkTickets' : loading ? 'common.loading' : !user ? 'auth.createAccount' : failed ? 'feedback.retry' : 'checkoutResult.viewPurchasedTicket')}</Text>
        </UIActionButton>
        {failed && <Pressable testID="checkout-all-tickets" accessibilityRole="button" onPress={() => leave('all')} style={s.secondary}><Text style={s.secondaryText}>{copy('checkoutResult.checkTickets')}</Text></Pressable>}
        <Pressable testID="checkout-success-dismiss" accessibilityRole="button" onPress={() => leave('dismiss')} style={s.secondary}><Text style={s.secondaryText}>{copy('checkoutResult.backToEvent')}</Text></Pressable>
      </AppSheetScrollView>
    </AppSheet>
  </View>;
}

const s = StyleSheet.create({
  surface: { flex: 1, backgroundColor: '#131011' },
  content: { flexGrow: 1, paddingTop: 44, paddingHorizontal: 24, alignItems: 'center' },
  title: { color: 'white', fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8, textAlign: 'center' },
  hint: { marginTop: 14, color: '#ffffffb3', fontSize: 14, lineHeight: 22, textAlign: 'center', maxWidth: 420 },
  check: { flex: 1, minHeight: 142, paddingVertical: 22, justifyContent: 'center' },
  primary: { width: '100%', minHeight: 48, borderRadius: 99, backgroundColor: colors.accent, paddingVertical: 12, paddingHorizontal: 20, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: 'white', fontSize: 14, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  secondary: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', marginTop: 8 },
  secondaryText: { color: '#ffffffb3', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  error: { color: '#fda4af', fontSize: 12, lineHeight: 18, textAlign: 'center', marginBottom: 16 },
});
