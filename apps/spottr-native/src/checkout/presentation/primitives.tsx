"use client";

import '../paymentRecoveryStorage';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MotionPressable as Pressable } from '../../ui/MotionPressable';
import { StateSurface, ValueText } from '../../ui/StateMotion';
import { Check, LockKeyhole } from 'lucide-react-native';

import { usePreferences } from '../../usePreferences';
import { Text } from '../../ui/Text';

import { colors } from '../../ui/theme';

export function Price({ label, value, accent }: { label: string; value: string; accent?: boolean }) { return <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}><Text style={[s.hint, { flex: 1 }, accent && { color: colors.accent }]}>{label}</Text><ValueText style={[s.hint, accent && { color: colors.accent }]}>{value}</ValueText></View>; }

export function Step({ number, title, hint, summary, active, completed, edit, disabled, children }: React.PropsWithChildren<{ number: number; title: string; hint: string; summary?: string; active: boolean; completed: boolean; edit?: () => void; disabled?: boolean }>) {
  const { copy } = usePreferences();
  return <StateSurface testID={'checkout-step-' + number} background="#151112" border={active ? '#ff004499' : '#ff004400'} style={[s.card, active && { boxShadow: '0 1px 20px -10px #ff0044' }]}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    <StateSurface style={s.number} background={active ? colors.accent : completed ? '#10b981' : '#00000000'}>{active ? <Text style={s.label}>{number}</Text> : completed ? <Check size={16} color="white" /> : <LockKeyhole size={16} color="#ffffff4d" />}</StateSurface>
    <View style={{ flex: 1 }}><Text style={[s.stepTitle, !active && !completed && { color: '#ffffff59' }]}>{title}</Text>{(active || completed) && <Text style={s.hint}>{active ? hint : summary}</Text>}</View>
    {!active && completed && edit && <Pressable accessibilityRole="button" disabled={disabled} onPress={edit} style={{ minHeight: 40, justifyContent: 'center' }}><Text style={s.category}>{copy('checkout.editStep')}</Text></Pressable>}
  </View>{active && <View style={s.stepBody}>{children}</View>}</StateSurface>;
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#080909' }, header: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 16 }, back: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff0f', alignItems: 'center', justifyContent: 'center' }, title: { color: colors.text, fontSize: 18, fontWeight: '700' }, subtitle: { color: '#ffffff73', fontSize: 12, letterSpacing: 1.2, marginTop: 4 }, progress: { marginTop: 20, marginHorizontal: 16, flexDirection: 'row', gap: 8 }, progressPart: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#ffffff1a' }, body: { paddingHorizontal: 16, paddingTop: 24, gap: 12 }, event: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 4, marginBottom: 8 }, date: { paddingRight: 12, borderRightWidth: 1, borderRightColor: '#ffffff33', alignItems: 'center' }, day: { fontSize: 24, fontWeight: '700', color: '#ffffff8c' }, month: { fontSize: 12, textTransform: 'uppercase', color: '#ffffff8c', marginTop: 4 }, category: { fontSize: 12, fontWeight: '600', color: colors.accent, marginTop: 4 }, card: { padding: 16, borderRadius: 24, borderWidth: 1, borderColor: 'transparent', backgroundColor: '#151112' }, number: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' }, stepTitle: { fontSize: 16, fontWeight: '600', color: 'white' }, hint: { fontSize: 12, lineHeight: 20, color: '#ffffff73', marginTop: 4 }, label: { color: 'white', fontSize: 14, fontWeight: '600' }, stepBody: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#ffffff1a' }, ticketName: { fontSize: 18, fontWeight: '700', color: colors.accent }, ticketPrice: { fontSize: 16, fontWeight: '600', color: colors.accent }, description: { fontSize: 14, lineHeight: 22, color: '#ffffff80' }, quantity: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 }, quantityButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#ffffff80', alignItems: 'center', justifyContent: 'center' }, prices: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#ffffff1a', paddingTop: 16, gap: 8 }, total: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: '#ffffff1a', paddingTop: 12 }, totalText: { fontSize: 16, fontWeight: '700', color: 'white' }, apply: { paddingHorizontal: 14, height: 40, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }, stripe: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#ff004499', backgroundColor: '#ff00440d', padding: 16, borderRadius: 16, marginBottom: 20 }, billingChoice: { padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#ffffff05' }, footer: { paddingHorizontal: 16, paddingTop: 12 }, cta: { height: 44, borderRadius: 99, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 20, boxShadow: '0 8px 20px #ff004433' },
});
