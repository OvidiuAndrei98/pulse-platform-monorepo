"use client";

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ActionButton } from '../../ui/ActionButton';

import { Text } from '../../ui/Text';

import { colors } from '../../ui/theme';

export function Action({title,onPress,primary,danger,warning,disabled,children}:React.PropsWithChildren<{title:string;onPress:()=>void;primary?:boolean;danger?:boolean;warning?:boolean;disabled?:boolean}>){return <ActionButton title={title} tone={danger?'danger':warning?'warning':primary?'primary':'secondary'} disabled={disabled} onPress={onPress} icon={React.isValidElement(children)?children as React.ReactElement<{color?:string}>:undefined}/>;}

export function Section({ title, hint, children }: React.PropsWithChildren<{ title: string; hint: string }>) { return <View style={{ gap: 14 }}><View style={{ gap: 5 }}><Text style={[styles.heading, { fontSize: 18 }]}>{title}</Text><Text style={styles.body}>{hint}</Text></View>{children}</View>; }

export function Empty({ title }: { title: string }) { return <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: '#ffffff26', borderRadius: 16, padding: 24 }}><Text style={[styles.body, { textAlign: 'center' }]}>{title}</Text></View>; }

export function Stats({ items }: { items: string[][] }) { return <View style={styles.grid}>{items.map(([label, value], index) => <View key={index} style={{ width: '48%', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#ffffff18', backgroundColor: '#00000033', gap: 5 }}><Text style={{ color: colors.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: .4 }}>{label}</Text><Text style={[styles.heading, { fontSize: 13 }]}>{value}</Text></View>)}</View>; }

export function Detail({ label, value }: { label: string; value: string }) { return <View style={styles.row}><Text style={[styles.body, { flex: 1, fontSize: 12 }]}>{label}</Text><Text selectable style={{ color: colors.text, fontSize: 12, maxWidth: '58%' }}>{value}</Text></View>; }

export function Badge({ text, warning, accent, danger }: { text: string; warning?: boolean; accent?: boolean; danger?: boolean }) { const color = accent ? colors.accent : danger ? '#fca5a5' : warning ? '#fde68a' : colors.muted; return <View style={{ borderRadius: 99, borderWidth: 1, borderColor: accent ? '#ff004440' : danger ? '#f8717140' : warning ? '#fcd34d40' : '#ffffff18', backgroundColor: accent ? '#ff00441a' : danger ? '#ef44441a' : warning ? '#fcd34d1a' : 'transparent', paddingHorizontal: 9, paddingVertical: 5 }}><Text style={{ color, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: .3 }}>{text}</Text></View>; }

export const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 }, grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }, card: { padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#ffffff18', backgroundColor: '#ffffff08', gap: 14 },
  brandIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ff004426', borderRadius: 12 }, eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1.8, textTransform: 'uppercase' }, title: { color: colors.text, fontSize: 26, fontWeight: '700' }, heading: { color: colors.text, fontSize: 16, fontWeight: '600' }, body: { color: colors.muted, fontSize: 13, lineHeight: 21 }, error: { color: '#fca5a5', fontSize: 13, lineHeight: 21 }, reason: { padding: 12, backgroundColor: '#00000033', borderRadius: 12 }, stripe: { padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#ffffff18', backgroundColor: '#00000033', gap: 12 }, actionText: { color: colors.text, fontSize: 12, fontWeight: '600', textAlign: 'center' }, modalBackdrop: { flex: 1, backgroundColor: '#000000cc', padding: 20, justifyContent: 'center', alignItems: 'center' }, modal: { width: '100%', maxWidth: 448, padding: 20, borderRadius: 16, borderColor: '#ffffff18', borderWidth: 1, backgroundColor: '#0a0a0a' }, input: { padding: 14, minHeight: 110, borderWidth: 1, borderColor: '#ffffff18', backgroundColor: '#ffffff09', borderRadius: 12, color: colors.text, fontSize: 16, textAlignVertical: 'top' },
});
