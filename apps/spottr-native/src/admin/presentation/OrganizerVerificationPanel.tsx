"use client";
import { AccentPressable } from '../../ui/AccentPressable';

import { Pressable, ScrollView, View } from 'react-native';

import { Building2, Check, CreditCard } from 'lucide-react-native';

import { Feedback, Loading } from '../../ui/common';
import { Text } from '../../ui/Text';

import { colors } from '../../ui/theme';
import { stripeStatus } from '../data';

import type { AdminOperationsScreenModel } from "../useAdminController";
import { Section, styles, Empty, Badge, Action, Stats, Detail } from "./primitives";

export function OrganizerVerificationPanel({model, grid}: {model: Pick<AdminOperationsScreenModel, "busy" | "choose" | "copy" | "counts" | "date" | "filter" | "organizers" | "setFilter" | "stripe" | "visible">; grid: boolean}) {
 const { busy, choose, copy, counts, date, filter, organizers, setFilter, stripe, visible }=model;

 return (<Section title={copy('admin.organizersTitle')} hint={copy('admin.subtitle')}>
      <Stats items={(['active', 'onboarding', 'attention', 'notConnected'] as const).map(status => [copy('admin.stripe.status.' + status), String(stripe[status])])} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{(['pending', 'approved', 'rejected', 'all'] as const).map(status => <AccentPressable fallback={Pressable} glassColor={status===filter?colors.accent:undefined} key={status} accessibilityRole="tab" accessibilityState={{ selected: status === filter }} onPress={() => setFilter(status)} style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 99, borderWidth: 1, borderColor: status === filter ? colors.accent : '#ffffff18', backgroundColor: status === filter ? colors.action : '#ffffff08' }}><Text style={styles.actionText}>{copy('admin.filters.' + status)}  {counts[status]}</Text></AccentPressable>)}</ScrollView>
      {organizers.isPending ? <Loading /> : organizers.isError ? <Feedback compact title={copy('admin.loadFailed')} retry={() => { void organizers.refetch(); }} /> : !visible.length ? <Empty title={copy('admin.empty')} /> : <View style={[styles.grid, !grid && { flexDirection: 'column' }]}>{visible.map(request => <View key={request.userId} style={[styles.card, { width: grid ? '49%' : '100%' }]}>
        <View style={styles.row}><View style={styles.brandIcon}><Building2 size={20} color={colors.accent} /></View><View style={{ flex: 1, gap: 4 }}><Text style={styles.heading}>{request.companyName}</Text><Text style={styles.body}>{request.email}</Text></View><Badge text={copy('admin.filters.' + request.verificationStatus)} warning={request.verificationStatus === 'pending'} accent={request.verificationStatus === 'approved'} danger={request.verificationStatus === 'rejected'} /></View>
        <Stats items={[[copy('admin.cui'), request.cui], [copy('admin.account'), '@' + request.username], [copy('admin.submittedAt'), date(request.submittedAt)]]} />
        <View style={styles.stripe}><View style={styles.row}><CreditCard color={colors.accent} size={18} /><Text style={[styles.heading, { flex: 1, fontSize: 13 }]}>{copy('admin.stripe.title')}</Text><Badge text={copy('admin.stripe.status.' + stripeStatus(request))} warning={stripeStatus(request) === 'onboarding'} danger={stripeStatus(request) === 'attention'} /></View>{request.stripeAccountId ? <><Detail label={copy('admin.stripe.detailsSubmitted')} value={copy(request.stripeDetailsSubmitted ? 'admin.stripe.ready' : 'admin.stripe.pending')} /><Detail label={copy('admin.stripe.payments')} value={copy(request.stripeChargesEnabled ? 'admin.stripe.ready' : 'admin.stripe.pending')} /><Detail label={copy('admin.stripe.payouts')} value={copy(request.stripePayoutsEnabled ? 'admin.stripe.ready' : 'admin.stripe.pending')} /><Text selectable style={[styles.body, { fontSize: 10 }]}>{request.stripeAccountId}{request.stripeChargeType ? ' · ' + (request.stripeChargeType === 'direct' ? copy('admin.stripe.chargeType.direct') : request.stripeChargeType) : ''}</Text></> : <Text style={styles.body}>{copy('admin.stripe.notConnectedHint')}</Text>}</View>
        <View style={styles.row}>{request.verificationStatus !== 'rejected' ? <View style={{ flex: 1 }}><Action title={copy('admin.reject')} danger disabled={busy} onPress={() => choose({ kind: 'organizer', request, status: 'rejected' })} /></View> : null}{request.verificationStatus !== 'approved' ? <View style={{ flex: 1 }}><Action title={copy('admin.approve')} primary disabled={busy} onPress={() => choose({ kind: 'organizer', request, status: 'approved' })}><Check color="white" size={16} /></Action></View> : null}</View>
      </View>)}</View>}
    </Section>);
}
