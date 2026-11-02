"use client";

import { View } from 'react-native';

import { Ban } from 'lucide-react-native';

import { Feedback, Loading } from '../../ui/common';
import { Text } from '../../ui/Text';

import { canReviewCancellation } from '../data';

import type { AdminOperationsScreenModel } from "../useAdminController";
import { Section, styles, Empty, Badge, Action, Stats } from "./primitives";

export function CancellationReviewPanel({model}: {model: Pick<AdminOperationsScreenModel, "busy" | "cancellations" | "choose" | "copy" | "link" | "money">}) {
 const { busy, cancellations, choose, copy, link, money }=model;

 return (<Section title={copy('adminCancellations.title')} hint={copy('adminCancellations.subtitle')}>
      {cancellations.isPending ? <Loading /> : cancellations.isError ? <Feedback compact title={copy('adminCancellations.loadFailed')} retry={() => { void cancellations.refetch(); }} /> : !cancellations.data.length ? <Empty title={copy('adminCancellations.empty')} /> : cancellations.data.map(request => <View key={request.id} style={styles.card}>
        <View style={styles.row}><Ban size={18} color="#ff9090" /><Text style={[styles.heading, { flex: 1 }]}>{request.eventTitle}</Text><Badge text={copy('adminCancellations.status.' + request.status)} /></View><Text style={styles.body}>{[request.companyName, request.organizerEmail].filter(Boolean).join(' · ')}</Text><Text style={[styles.body, styles.reason]}>{request.reason}</Text>
        {request.evidenceUrl ? <Action title={copy('eventCancellation.evidence')} onPress={() => { void link.open(request.evidenceUrl!); }} /> : null}
        <Stats items={[[copy('adminCancellations.tickets'), String(request.ticketCount ?? 0)], [copy('adminCancellations.customerTotal'), money(request.customerTotalBani)], [copy('adminCancellations.spottrFee'), money(request.platformFeeBani)], [copy('adminCancellations.refundProgress'), `${request.succeededRefunds ?? 0}/${request.orderCount ?? 0}`]]} />
        {request.failedRefunds ? <><Text style={styles.error}>{copy('adminCancellations.failedCount', { count: request.failedRefunds })}</Text><Action title={copy('adminCancellations.retry')} disabled={busy || !canReviewCancellation(request, 'retry')} onPress={() => choose({ kind: 'cancellation', request, action: 'retry' })} /></> : null}
        {request.status === 'pending' ? <View style={{ gap: 8 }}>{(['reject', 'refund', 'retain'] as const).map(action => <Action key={action} title={copy(action === 'reject' ? 'adminCancellations.reject' : action === 'refund' ? 'adminCancellations.approveRefundFee' : 'adminCancellations.approveRetainFee')} primary={action === 'retain'} warning={action === 'refund'} disabled={busy} onPress={() => choose({ kind: 'cancellation', request, action })} />)}</View> : null}
      </View>)}
    </Section>);
}
