"use client";

import { FormInput as TextInput } from '../../ui/FormInput';

import '../paymentRecoveryStorage';

import { ActivityIndicator, View } from 'react-native';
import { MotionPressable as Pressable } from '../../ui/MotionPressable';
import { ValueText } from '../../ui/StateMotion';
import { Minus, Plus, X } from 'lucide-react-native';

import { Text } from '../../ui/Text';

import { colors } from '../../ui/theme';

import { billingStyles } from '../BillingFields';
import { getRemainingTicketCapacity } from '@packages/app-core/checkout/ticketAvailability';
import { formatRon } from '@packages/app-core/events/serviceFee';
import { ActionButton as UIActionButton } from '../../ui/ActionButton';
import type { ReactNode } from "react";
import type { CheckoutContentModel } from "../useCheckoutController";
import { Step, s } from "./primitives";

export function CheckoutTicketsStep({model, prices}: {model: Pick<CheckoutContentModel, "busy" | "changeStep" | "copy" | "furthest" | "pending" | "promo" | "quantities" | "setQuantities" | "step" | "totals">; prices: ReactNode}) {
 const { busy, changeStep, copy, furthest, pending, promo, quantities, setQuantities, step, totals }=model;
 if(!totals)return null;
 return (<Step number={1} active={step === 0} completed={furthest > 0} title={copy('checkout.tickets')} hint={copy('checkout.ticketStepHint')} summary={totals?.tickets.map(t => `${quantities[t.id]} × ${t.name}`).join(', ')} disabled={busy} edit={() => changeStep(0)}>
          {totals?.tickets.map(ticket => <View key={ticket.id} style={{ gap: 8 }}><Text style={s.ticketName}>{ticket.name}</Text><Text style={s.ticketPrice}>{formatRon(ticket.priceRon)}</Text>{!!ticket.description && <Text style={s.description}>{ticket.description}</Text>}
            <View style={s.quantity}><Text style={s.description}>{copy('checkout.quantity')}</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable testID="checkout-minus" accessibilityRole="button" accessibilityLabel={copy('checkout.decreaseQuantity', { name: ticket.name })} disabled={busy || quantities[ticket.id]! <= 1} onPress={() => { if (!pending.current) setQuantities(value => ({ ...value, [ticket.id]: Math.max(1, (value[ticket.id] ?? 1) - 1) })); }} style={[s.quantityButton, (busy || quantities[ticket.id]! <= 1) && { opacity: 0.25 }]}><Minus color="white" size={20} /></Pressable>
              <ValueText testID="checkout-quantity" style={{ color: 'white', fontSize: 16, minWidth: 24, textAlign: 'center' }}>{quantities[ticket.id]}</ValueText>
              <Pressable testID="checkout-plus" accessibilityRole="button" accessibilityLabel={copy('checkout.increaseQuantity', { name: ticket.name })} disabled={busy || quantities[ticket.id]! >= Math.min(8, getRemainingTicketCapacity(ticket))} onPress={() => { if (!pending.current) setQuantities(value => ({ ...value, [ticket.id]: Math.min(8, getRemainingTicketCapacity(ticket), (value[ticket.id] ?? 1) + 1) })); }} style={[s.quantityButton, (busy || quantities[ticket.id]! >= Math.min(8, getRemainingTicketCapacity(ticket))) && { opacity: 0.25 }]}><Plus color="white" size={20} /></Pressable>
            </View></View></View>)}
          <View style={s.prices}><Text style={s.label}>{copy('auth.promoCode')}</Text><View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TextInput variant="billing" testID="checkout-promo" accessibilityLabel={copy('auth.promoCode')} value={promo.code} onChangeText={promo.setCode} editable={!busy && !promo.applied} maxLength={40} autoCapitalize="characters" autoCorrect={false} placeholder={copy('auth.promoPlaceholder')} placeholderTextColor={colors.muted} onSubmitEditing={() => void promo.apply()} style={[billingStyles.input, { flex: 1, height: 40 }]} />
            <UIActionButton testID="checkout-promo-apply" accessibilityRole="button" accessibilityLabel={copy(promo.applied ? 'checkout.removePromo' : 'checkout.applyPromo')} disabled={busy || promo.validating || (!promo.applied && promo.code.length < 3)} onPress={() => promo.applied ? promo.clear() : void promo.apply()} style={s.apply}>{promo.validating ? <ActivityIndicator color="white" size="small" /> : promo.applied ? <X color="white" size={16} /> : <Text style={s.label}>{copy('checkout.applyPromo')}</Text>}</UIActionButton>
          </View>{promo.applied && <Text style={s.category}>{copy('checkout.promoApplied', { percent: promo.applied.discountPercent })}</Text>}{promo.error && <Text style={billingStyles.error}>{copy(promo.error)}</Text>}</View>
          {prices}
        </Step>);
}
