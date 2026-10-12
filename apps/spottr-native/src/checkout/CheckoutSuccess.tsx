import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { CalendarDays, MapPin, Ticket } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { eventsApi } from '../data/api';
import { formatDate, isEventId } from '../data/events';
import { usePreferences } from '../PreferencesProvider';
import { Wordmark } from '../ui/Logo';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function PaymentSuccessCheck() {
  const reduceMotion = useReducedMotion(), progress = useSharedValue(reduceMotion ? 1 : 0);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: 50 * (1 - progress.value) }));
  useEffect(() => {
    progress.value = withTiming(1, { duration: reduceMotion ? 0 : 460, easing: Easing.out(Easing.cubic) });
    return () => cancelAnimation(progress);
  }, [progress, reduceMotion]);
  return <View testID="checkout-success-check" style={s.check}>
    <Svg width={40} height={40} viewBox="0 0 40 40" pointerEvents="none">
      <AnimatedPath d="M9 20.5 16.5 28 31 12" stroke={colors.accent} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="50 50" animatedProps={animatedProps} />
    </Svg>
  </View>;
}

/** A confirmed purchase summary, never a fabricated QR/admission credential. */
export function CheckoutSuccessTicket({ eventId, orderId }: { eventId: string; orderId?: string }) {
  const { copy, language } = usePreferences();
  const event = useQuery({ queryKey: ['event', eventId], queryFn: ({ signal }) => eventsApi.event(eventId, signal), enabled: isEventId(eventId) });
  const reduceMotion = useReducedMotion(), appear = useSharedValue(reduceMotion ? 1 : 0);
  const motion = useAnimatedStyle(() => ({ opacity: appear.value, transform: [{ translateY: (1 - appear.value) * 12 }] }));
  useEffect(() => {
    appear.value = reduceMotion ? 1 : withDelay(240, withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }));
    return () => cancelAnimation(appear);
  }, [appear, reduceMotion]);
  const data = event.data;
  return <Animated.View testID="checkout-success-ticket" style={[s.ticket, motion]}>
    <View style={s.top}><Wordmark /><View style={s.confirmed}><Ticket size={12} color={colors.accent} /><Text style={s.confirmedText}>{copy('checkoutResult.issued')}</Text></View></View>
    <Text style={s.title} numberOfLines={3}>{data?.title || copy('checkoutResult.ticketReady')}</Text>
    {data && <View style={s.details}>
      <View style={s.row}><CalendarDays size={14} color="#ffffff73" /><Text style={s.detail}>{formatDate(data.startTime, language, true)}</Text></View>
      {!!data.locationName && <View style={s.row}><MapPin size={14} color="#ffffff73" /><Text style={s.detail} numberOfLines={2}>{[data.locationName, data.city].filter(Boolean).join(' · ')}</Text></View>}
    </View>}
    <View style={s.perforation}><View style={[s.notch, { left: -35 }]} /><View style={[s.notch, { right: -35 }]} /></View>
    <View style={s.bottom}><Text style={s.ready}>{copy('checkoutResult.readyForTheNight')}</Text>{orderId && <Text style={s.reference}>{copy('checkoutResult.orderReference', { reference: orderId.slice(-8).toUpperCase() })}</Text>}</View>
  </Animated.View>;
}

const s = StyleSheet.create({
  check: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#ff004414', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  ticket: { marginTop: 28, borderRadius: 24, backgroundColor: '#1c1116', padding: 24, overflow: 'hidden' },
  top: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' },
  confirmed: { flexDirection: 'row', gap: 5, alignItems: 'center' }, confirmedText: { color: colors.accent, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: .8 },
  title: { color: 'white', fontSize: 23, lineHeight: 28, fontWeight: '800', marginTop: 22, letterSpacing: -.6 },
  details: { gap: 8, marginTop: 14 }, row: { flexDirection: 'row', gap: 8, alignItems: 'center' }, detail: { color: '#ffffffa6', fontSize: 12, lineHeight: 18, flex: 1 },
  perforation: { marginTop: 22, marginBottom: 20, borderTopWidth: 1, borderColor: '#ffffff24', borderStyle: 'dashed' }, notch: { position: 'absolute', top: -11, height: 22, width: 22, borderRadius: 11, backgroundColor: '#101011' },
  bottom: { gap: 6 }, ready: { color: 'white', fontWeight: '600', fontSize: 12 }, reference: { color: '#ffffff66', fontSize: 11, letterSpacing: .4 },
});
