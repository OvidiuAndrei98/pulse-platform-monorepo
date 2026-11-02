"use client";

import '../paymentRecoveryStorage';

import { View } from 'react-native';

import { Text } from '../../ui/Text';

import { formatRon } from '@packages/app-core/events/serviceFee';

import type { ReactNode } from "react";
import type { CheckoutContentModel } from "../useCheckoutController";
import { Step, s, Price } from "./primitives";

export function CheckoutSummaryStep({model, prices}: {model: Pick<CheckoutContentModel, "copy" | "details" | "email" | "quantities" | "step" | "totals">; prices: ReactNode}) {
 const { copy, details, email, quantities, step, totals }=model;
 if(!totals)return null;
 return (<Step number={3} active={step === 2} completed={false} title={copy('checkout.orderSummary')} hint={copy('checkout.summaryStepHint')}>
          {totals?.tickets.map(ticket => <Price key={ticket.id} label={`${quantities[ticket.id]} × ${ticket.name}`} value={formatRon(quantities[ticket.id]! * ticket.priceRon)} />)}{prices}
          <View style={s.prices}><Text style={s.hint}>{email}</Text><Text style={s.label}>{details.name}</Text>{details.type === 'company' && <Text style={s.hint}>{details.taxId} {details.registrationNumber}</Text>}<Text style={s.hint}>{[details.address, details.city, details.sector || details.county, details.country].filter(Boolean).join(', ')}</Text><Text style={s.hint}>{copy('checkout.stripePayment')}</Text></View>
        </Step>);
}
