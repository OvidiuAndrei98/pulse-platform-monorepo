"use client";

import { View } from 'react-native';

import { Feedback, Loading } from '../../ui/common';
import { Text } from '../../ui/Text';

import type { AdminOperationsScreenModel } from "../useAdminController";
import { Section, styles, Empty, Badge, Action, Stats, Detail } from "./primitives";

export function RefundReviewPanel({model, grid}: {model: Pick<AdminOperationsScreenModel, "busy" | "copy" | "date" | "money" | "reconcileRefund" | "reconciling" | "refunds">; grid: boolean}) {
 const { busy, copy, date, money, reconcileRefund, reconciling, refunds }=model;

 return (<Section title={copy('refundAttention.title')} hint={copy('refundAttention.adminSubtitle')}>
      {refunds.isPending ? <Loading /> : refunds.isError ? <Feedback compact title={copy('refundAttention.loadFailed')} retry={() => { void refunds.refetch(); }} /> : !refunds.data.length ? <Empty title={copy('refundAttention.empty')} /> : <View style={[styles.grid, !grid && { flexDirection: 'column' }]}>{refunds.data.map(item => <View key={item.orderId} style={[styles.card, { borderColor: '#fcd34d26', width: grid ? '49%' : '100%' }]}>
        <View style={styles.row}><Text style={[styles.heading, { flex: 1 }]}>{item.eventTitle}</Text><Badge text={copy(item.stripeLivemode ? 'refundAttention.live' : 'refundAttention.test')} /><Badge text={copy('refundAttention.status.' + item.stripeRefundStatus)} warning /></View><Text style={styles.body}>{copy('refundAttention.order', { id: item.orderId.slice(0, 8).toUpperCase() })}</Text>
        <Detail label={copy('refundAttention.buyer')} value={item.buyerEmail} /><Detail label={copy('refundAttention.organizer')} value={[item.companyName, item.organizerEmail].filter(Boolean).join(' · ')} /><Text style={styles.body}>{copy('refundAttention.purchasedAt', { date: date(item.purchasedAt) })}</Text><Text style={styles.body}>{copy('refundAttention.updatedAt', { date: date(item.updatedAt) })}</Text>
        <Stats items={[[copy('refundAttention.customerTotal'), money(item.customerTotalBani)], [copy('refundAttention.refunded'), money(item.refundedAmountBani)], [copy('refundAttention.remaining'), money(item.remainingAmountBani)], [copy('refundAttention.spottrFee'), money(item.platformFeeBani)]]} /><Text style={styles.body}>{copy('refundAttention.tickets')}: {item.ticketCount}</Text>
        <Action title={copy(reconciling === item.orderId ? 'refundAttention.checking' : 'refundAttention.checkStripe')} disabled={busy} onPress={() => reconcileRefund(item.orderId)} />{item.errorMessage ? <Text style={styles.error}>{copy('refundAttention.operationError', { message: item.errorMessage })}</Text> : null}
      </View>)}</View>}
    </Section>);
}
