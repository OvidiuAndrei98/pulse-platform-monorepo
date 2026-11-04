"use client";

import { FormInput as TextInput } from '../../ui/FormInput';

import '../paymentRecoveryStorage';

import { ActivityIndicator, View } from 'react-native';
import { X } from 'lucide-react-native';

import { Text } from '../../ui/Text';

import { colors } from '../../ui/theme';

import { billingStyles } from '../BillingFields';
import { changeTicketQuantity } from '@packages/app-core/checkout/ticketAvailability';
import { EventTicketPicker } from '../EventTicketPicker';
import { ActionButton as UIActionButton } from '../../ui/ActionButton';
import type { ReactNode } from "react";
import type { CheckoutContentModel } from "../useCheckoutController";
import { Step, s } from "./primitives";

export function CheckoutTicketsStep({model, prices}: {model: Pick<CheckoutContentModel, "busy" | "changeStep" | "copy" | "furthest" | "pending" | "promo" | "quantities" | "setQuantities" | "step" | "totals" | "event" | "now">; prices: ReactNode}) {
 const { busy, changeStep, copy, furthest, pending, promo, quantities, setQuantities, step, totals, event, now }=model;
 if(!totals)return null;
 return (<Step number={1} active={step === 0} completed={furthest > 0} title={copy('checkout.tickets')} hint={copy('checkout.ticketStepHint')} summary={totals?.tickets.map(t => `${quantities[t.id]} × ${t.name}`).join(', ')} disabled={busy} edit={() => changeStep(0)}>
          {event&&<EventTicketPicker event={event} quantities={quantities} now={now} paidOnly disabled={busy} onStep={(id,delta)=>{if(!pending.current)setQuantities(current=>changeTicketQuantity(event.ticketTypes,current,id,(current[id]??0)+delta,now));}}/>}
          <View style={s.prices}><Text style={s.label}>{copy('auth.promoCode')}</Text><View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TextInput variant="billing" testID="checkout-promo" accessibilityLabel={copy('auth.promoCode')} value={promo.code} onChangeText={promo.setCode} editable={!busy && !promo.applied} maxLength={40} autoCapitalize="characters" autoCorrect={false} placeholder={copy('auth.promoPlaceholder')} placeholderTextColor={colors.muted} onSubmitEditing={() => void promo.apply()} style={[billingStyles.input, { flex: 1, height: 40 }]} />
            <UIActionButton testID="checkout-promo-apply" accessibilityRole="button" accessibilityLabel={copy(promo.applied ? 'checkout.removePromo' : 'checkout.applyPromo')} disabled={busy || promo.validating || (!promo.applied && promo.code.length < 3)} onPress={() => promo.applied ? promo.clear() : void promo.apply()} style={s.apply}>{promo.validating ? <ActivityIndicator color="white" size="small" /> : promo.applied ? <X color="white" size={16} /> : <Text style={s.label}>{copy('checkout.applyPromo')}</Text>}</UIActionButton>
          </View>{promo.applied && <Text style={s.category}>{copy('checkout.promoApplied', { percent: promo.applied.discountPercent })}</Text>}{promo.error && <Text style={billingStyles.error}>{copy(promo.error)}</Text>}</View>
          {prices}
        </Step>);
}
