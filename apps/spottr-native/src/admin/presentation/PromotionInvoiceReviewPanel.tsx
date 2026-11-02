"use client";

import { View } from 'react-native';

import { Feedback, Loading } from '../../ui/common';
import { Text } from '../../ui/Text';

import type { AdminOperationsScreenModel } from "../useAdminController";
import { Section, styles, Empty, Badge, Stats } from "./primitives";

export function PromotionInvoiceReviewPanel({model}: {model: Pick<AdminOperationsScreenModel, "copy" | "money" | "promotions">}) {
 const { copy, money, promotions }=model;

 return (<Section title={copy('adminPromotionInvoices.title')} hint={copy('adminPromotionInvoices.subtitle')}>
      {promotions.isPending ? <Loading /> : promotions.isError ? <Feedback compact title={copy('adminPromotionInvoices.loadFailed')} retry={() => { void promotions.refetch(); }} /> : !promotions.data.length ? <Empty title={copy('adminPromotionInvoices.empty')} /> : promotions.data.map(item => <View key={item.id} style={[styles.card, { backgroundColor: '#fbbf240f', borderColor: '#fbbf2440' }]}><View style={styles.row}><Text style={[styles.heading, { flex: 1 }]}>{item.eventTitle}</Text><Badge warning text={copy('adminPromotionInvoices.needsReview')} /></View><Text selectable style={styles.body}>{item.customerEmail} · {item.paymentIntentId || item.campaignId}</Text><Stats items={[[copy('adminPromotionInvoices.paid'), money(item.amountRon * 100)], [copy('adminPromotionInvoices.refunded'), money(item.refundedAmountRon * 100)], [copy('adminPromotionInvoices.invoiceStatus'), item.invoiceStatus || '—'], [copy('adminPromotionInvoices.refundStatus'), item.refundStatus || '—']]} /><Text style={[styles.body, styles.reason]}>{item.reason}</Text></View>)}
    </Section>);
}
