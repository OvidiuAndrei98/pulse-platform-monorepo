import { CheckoutTicketsStep } from "../checkout/presentation/CheckoutTicketsStep";
import { CheckoutBillingStep } from "../checkout/presentation/CheckoutBillingStep";
import { CheckoutSummaryStep } from "../checkout/presentation/CheckoutSummaryStep";
import { s, Price } from "../checkout/presentation/primitives";

import { useCheckoutController } from "../checkout/useCheckoutController";
import { Props } from "../checkout/useCheckoutController.contracts";

import { GlassPressable } from '../ui/GlassPressable';
import { ActionIcon } from '../ui/ActionIcon';

import { FormScrollView, KeyboardFooter } from "../ui/KeyboardForms";

import '../checkout/paymentRecoveryStorage';

import { ActivityIndicator, View } from 'react-native';
import { MotionPressable as Pressable } from '../ui/MotionPressable';
import { StateSurface, ValueText } from '../ui/StateMotion';
import { ArrowRight, Ticket } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '../auth/AuthProvider';

import { Text } from '../ui/Text';
import { Feedback, Loading } from '../ui/common';
import { colors } from '../ui/theme';

import { returnToEvent } from '../navigation/returnToEvent';

import { billingStyles } from '../checkout/BillingFields';

import { formatRon } from '@packages/app-core/events/serviceFee';
import { ActionButton as UIActionButton } from '../ui/ActionButton';

export function CheckoutScreen(props: Props) {
  const { user } = useAuth('account');
  return <CheckoutContent key={`${props.route.params.eventId}:${user?.id ?? 'guest'}`} {...props} />;
}
function CheckoutContent(props: Parameters<typeof useCheckoutController>[0]) {
  const model = useCheckoutController(props);
  const {
    advance,
    available,
    blocked,
    busy,
    changeStep,
    copy,
    error,
    event,
    eventId,
    footerHeight,
    language,
    navigation,
    pay,
    pending,
    promo,
    query,
    safe,
    scroll,
    setFooterHeight,
    step,
    totals,
    isOwnEvent,
  } = model;

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
        {!available && !query.isFetching && <Feedback compact title={copy(isOwnEvent ? 'eventPage.cannotBuyOwn' : 'checkout.selectionUnavailable')} />}
        {!available && !busy && <Pressable testID="checkout-reselect" accessibilityRole="button" onPress={() => returnToEvent(navigation, eventId)} style={s.billingChoice}><Text style={s.category}>{copy('checkout.backToTickets')}</Text></Pressable>}
        <CheckoutTicketsStep model={model} prices={prices}/>
        <CheckoutBillingStep model={model} />
        <CheckoutSummaryStep model={model} prices={prices}/>
      </View>}
    </FormScrollView>
    <KeyboardFooter><LinearGradient onLayout={event => setFooterHeight(event.nativeEvent.layout.height)} colors={['#0000001a', '#000000b3', '#000000']} style={[s.footer, { paddingBottom: Math.max(28, safe.bottom) }]}>
      {error && <Text testID="checkout-error" accessibilityRole="alert" accessibilityLiveRegion="polite" style={[billingStyles.error, { lineHeight: 18, marginBottom: 12 }]}>{copy(error)}</Text>}
      <UIActionButton testID="checkout-next" accessibilityRole="button" disabled={blocked} onPress={() => void (step === 2 ? pay() : advance())} style={[s.cta, blocked && { opacity: 0.4 }]}>{busy ? <ActivityIndicator size="small" color="white" /> : step === 2 ? <Ticket size={16} color="white" /> : <ArrowRight size={16} color="white" />}<Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>{copy(busy ? 'checkout.preparingPayment' : step === 2 ? 'checkout.confirmAndPay' : step === 1 ? 'checkout.continueToSummary' : 'common.next', { total: formatRon(totals?.total ?? 0) })}</Text></UIActionButton>
    </LinearGradient></KeyboardFooter>
  </View>;
}
