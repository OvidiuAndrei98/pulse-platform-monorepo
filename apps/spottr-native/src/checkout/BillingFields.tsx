import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Check, ChevronDown, ReceiptText } from 'lucide-react-native';
import { usePreferences } from '../PreferencesProvider';
import { Text } from '../ui/Text';
import { AppSheet } from '../ui/AppSheet';
import { AppSheetScrollView } from '../ui/AppSheetScrollView';
import { colors } from '../ui/theme';
import { invoiceFieldLimits, isBucharestAddress, type InvoiceDetails, type InvoiceFieldErrors } from '../../../pulse-app/src/features/checkout/invoiceDetails';

export function BillingFields({ value, onChange, errors, disabled }: { value: InvoiceDetails; onChange: (value: InvoiceDetails) => void; errors: InvoiceFieldErrors; disabled: boolean }) {
  const { copy } = usePreferences(), [sectors, setSectors] = useState(false);
  const bucharest = isBucharestAddress(value);
  const field = (key: keyof InvoiceDetails, label: string, optional = false) => <View style={{ gap: 6 }} key={key}>
    <Text style={s.label}>{copy(label)}{optional ? ' ' + copy('checkout.optional') : ''}</Text>
    <TextInput testID={'billing-' + key} accessibilityLabel={copy(label)} aria-invalid={!!errors[key]} value={value[key]} editable={!disabled}
      onChangeText={text => onChange({ ...value, [key]: text })} style={[s.input, !!errors[key] && s.invalid]} autoCorrect={false} maxLength={invoiceFieldLimits[key]} />
    {!!errors[key] && <Text accessibilityRole="alert" style={s.error}>{copy(errors[key]!)}</Text>}
  </View>;
  return <View style={s.container}>
    <View style={{ flexDirection: 'row', gap: 12 }}><ReceiptText size={16} color={colors.accent} /><View style={{ flex: 1 }}>
      <Text style={s.title}>{copy('checkout.billingDetailsTitle')}</Text><Text style={s.hint}>{copy('checkout.invoiceAutomaticHint')}</Text></View></View>
    <View style={s.fields}>
      <View style={s.tabs}>{(['individual', 'company'] as const).map(type => <Pressable key={type} testID={'billing-type-' + type} accessibilityRole="radio" accessibilityState={{ checked: value.type === type }} disabled={disabled} onPress={() => onChange({ ...value, type })} style={[s.tab, value.type === type && { backgroundColor: colors.accent }]}><Text style={[s.label, { color: value.type === type ? 'white' : '#ffffff8c' }]}>{copy('checkout.invoiceType.' + type)}</Text></Pressable>)}</View>
      {field('name', value.type === 'company' ? 'checkout.companyName' : 'checkout.fullName')}
      {value.type === 'company' && <>{field('taxId', 'checkout.taxId')}{field('registrationNumber', 'checkout.registrationNumber', true)}</>}
      {field('address', 'checkout.billingAddress')}
      {field('city', 'checkout.billingCity')}
      {bucharest ? <View style={{ gap: 6 }}><Text style={s.label}>{copy('checkout.billingSector')}</Text>
        <Pressable testID="billing-sector" aria-invalid={!!errors.sector} accessibilityRole="button" accessibilityLabel={copy('checkout.billingSector')} disabled={disabled} onPress={() => setSectors(true)} style={[s.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, !!errors.sector && s.invalid]}><Text style={{ color: value.sector ? 'white' : '#ffffff59' }}>{value.sector || copy('checkout.sectorPlaceholder')}</Text><ChevronDown size={16} color={colors.muted} /></Pressable>
        {!!errors.sector && <Text accessibilityRole="alert" style={s.error}>{copy(errors.sector)}</Text>}<Text style={s.hint}>{copy('checkout.bucharestAddressHint')}</Text>
      </View> : field('county', 'checkout.billingCounty')}
      {field('country', 'checkout.billingCountry')}
    </View>
    <AppSheet open={sectors} onClose={() => setSectors(false)} height={0.55} label={copy('checkout.billingSector')}>
      <AppSheetScrollView contentContainerStyle={{ padding: 20, gap: 8 }}><Text style={[s.title, { fontSize: 20, marginBottom: 12 }]}>{copy('checkout.billingSector')}</Text>
        {Array.from({ length: 6 }, (_, i) => `Sector ${i + 1}`).map(sector => <Pressable key={sector} accessibilityRole="radio" accessibilityState={{ checked: value.sector === sector }} onPress={() => { onChange({ ...value, county: 'Bucuresti', sector }); setSectors(false); }} style={{ height: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: colors.text }}>{sector}</Text>{value.sector === sector && <Check size={18} color={colors.accent} />}</Pressable>)}
      </AppSheetScrollView>
    </AppSheet>
  </View>;
}
export const billingStyles = StyleSheet.create({ input: { height: 44, borderWidth: 1, borderColor: '#ffffff1a', borderRadius: 12, backgroundColor: '#ffffff09', paddingHorizontal: 14, color: 'white', fontSize: 16 }, invalid: { borderColor: '#f87171b3' }, error: { color: '#f87171', fontSize: 12, marginTop: 2 } });
const s = StyleSheet.create({ ...billingStyles, container: { marginTop: 16, padding: 14, borderWidth: 1, borderColor: '#ffffff1a', borderRadius: 12, backgroundColor: '#ffffff05' }, fields: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#ffffff1a', paddingTop: 16, gap: 12 }, title: { color: 'white', fontSize: 14, fontWeight: '600' }, hint: { color: '#ffffff80', fontSize: 12, lineHeight: 20, marginTop: 4 }, label: { color: '#ffffffbf', fontSize: 12, fontWeight: '600' }, tabs: { flexDirection: 'row', gap: 8, backgroundColor: '#00000040', padding: 4, borderRadius: 12 }, tab: { flex: 1, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' } });
