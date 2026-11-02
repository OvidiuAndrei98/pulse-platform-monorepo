"use client";

import { FormInput as TextInput } from '../../ui/FormInput';

import '../paymentRecoveryStorage';

import { Platform, Switch, View } from 'react-native';
import { MotionPressable as Pressable } from '../../ui/MotionPressable';
import { SelectionPressable } from '../../ui/StateMotion';
import { Check, CreditCard } from 'lucide-react-native';

import { Text } from '../../ui/Text';
import { Loading } from '../../ui/common';
import { colors } from '../../ui/theme';

import { BillingFields, billingStyles } from '../BillingFields';

import type { CheckoutContentModel } from "../useCheckoutController";
import { Step, s } from "./primitives";

export function CheckoutBillingStep({model}: {model: Pick<CheckoutContentModel, "billingEdited" | "billingLoading" | "blocked" | "busy" | "changeStep" | "copy" | "details" | "email" | "emailError" | "fields" | "forget" | "furthest" | "remember" | "saved" | "setAttempted" | "setDetails" | "setEmail" | "setRemember" | "setSource" | "source" | "step" | "signedIn">}) {
 const { billingEdited, billingLoading, blocked, busy, changeStep, copy, details, email, emailError, fields, forget, furthest, remember, saved, setAttempted, setDetails, setEmail, setRemember, setSource, source, step, signedIn }=model;

 return (<Step number={2} active={step === 1} completed={furthest > 1} title={copy('checkout.billingPayment')} hint={copy('checkout.billingStepHint')} summary={details.name + ' · ' + copy('checkout.stripePayment')} disabled={blocked} edit={() => changeStep(1)}>
          <View style={s.stripe}><CreditCard size={20} color={colors.accent} /><View style={{ flex: 1 }}><Text style={s.label}>{copy('checkout.stripePayment')}</Text><Text style={s.hint}>{copy(Platform.OS === 'web' ? 'checkout.stripeRedirectHint' : 'checkout.stripeNativeHint')}</Text></View><Check size={16} color={colors.accent} /></View>
          <Text style={s.label}>{copy('eventSheet.emailForTickets')}</Text><TextInput variant="billing" testID="checkout-email" accessibilityLabel={copy('eventSheet.emailForTickets')} aria-invalid={!!emailError} value={email} onChangeText={setEmail} editable={!busy} keyboardType="email-address" autoComplete="email" autoCapitalize="none" autoCorrect={false} maxLength={254} placeholder={copy('checkout.emailPlaceholder')} placeholderTextColor={colors.muted} style={[billingStyles.input, { marginTop: 8 }, !!emailError && billingStyles.invalid]} />
          {emailError && <Text accessibilityRole="alert" style={billingStyles.error}>{copy(emailError)}</Text>}
          {billingLoading ? <Loading /> : <>
            {saved && <View style={{ gap: 8, marginTop: 16 }}>{(['saved', 'new'] as const).map(value => <SelectionPressable key={value} background={source === value ? '#ff00441a' : '#ffffff05'} border={source === value ? '#ff0044b3' : '#ffffff1a'} accessibilityRole="radio" accessibilityState={{ checked: source === value }} disabled={busy} onPress={() => { billingEdited.current = true; setSource(value); setDetails({ ...saved }); setAttempted(false); setRemember(value === 'new'); }} style={s.billingChoice}><Text style={s.label}>{copy(value === 'saved' ? 'checkout.useSavedBilling' : 'checkout.useOtherBilling')}</Text>{value === 'saved' && <Text style={s.hint}>{saved.name} · {saved.address}, {saved.city}</Text>}</SelectionPressable>)}</View>}
            {source === 'saved' && saved ? <Pressable disabled={busy} accessibilityRole="button" onPress={() => void forget()} style={{ minHeight: 40, justifyContent: 'center' }}><Text style={[s.hint, { textDecorationLine: 'underline' }]}>{copy('checkout.removeSavedBilling')}</Text></Pressable> : <>
              <BillingFields value={details} onChange={value => { billingEdited.current = true; setDetails(value); }} errors={fields} disabled={busy} />
              {signedIn && <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}><Switch testID="checkout-remember" value={remember} onValueChange={setRemember} disabled={busy} trackColor={{ true: colors.accent }} accessibilityLabel={copy('checkout.rememberBilling')} /><View style={{ flex: 1 }}><Text style={s.label}>{copy(saved ? 'checkout.replaceSavedBilling' : 'checkout.rememberBilling')}</Text><Text style={s.hint}>{copy('checkout.rememberBillingHint')}</Text></View></View>}
            </>}
          </>}
        </Step>);
}
