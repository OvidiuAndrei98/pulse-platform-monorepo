import { AccentPressable } from '../ui/AccentPressable';
import React, { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { ChevronRight, Mail, Trash2 } from 'lucide-react-native';
import { useAuth } from '../auth/AuthProvider';
import { usePreferences } from '../usePreferences';
import { AppSheet } from '../ui/AppSheet';
import { AppSheetScrollView } from '../ui/AppSheetScrollView';
import { MotionPressable as Pressable } from '../ui/MotionPressable';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';

const supportEmail = 'contact@code-lab.ro';

export function OrganizerAccountClosure() {
  const { user } = useAuth(), { copy } = usePreferences();
  const [open, setOpen] = useState(false);
  if (!user || user.role === 'user') return null;
  return <>
    <Pressable testID="organizer-account-closure" accessibilityRole="button" onPress={() => setOpen(true)} style={s.trigger}>
      <Trash2 size={18} color="#f87171" />
      <View style={{ flex: 1, gap: 5 }}><Text style={s.triggerTitle}>{copy('userProfile.closeManagedAccount')}</Text><Text style={s.body}>{copy('userProfile.closeManagedHint')}</Text></View>
      <ChevronRight size={17} color={colors.muted} />
    </Pressable>
    {open && <OrganizerAccountClosureSheet key={user.id} onClose={() => setOpen(false)} />}
  </>;
}

export function OrganizerAccountClosureSheet({ onClose }: { onClose(): void }) {
  const { user } = useAuth(), { copy } = usePreferences();
  const [error, setError] = useState(false);
  if (!user || user.role === 'user') return null;
  const write = async () => {
    setError(false);
    const url = `mailto:${supportEmail}?subject=${encodeURIComponent(copy('userProfile.closeManagedEmailSubject'))}&body=${encodeURIComponent(copy('userProfile.closeManagedEmailBody', { email: user.email }))}`;
    try { await Linking.openURL(url); } catch { setError(true); }
  };
  return <AppSheet open onClose={onClose} label={copy('common.close')} height={0.85} testID="organizer-account-closure-sheet">
    <AppSheetScrollView contentContainerStyle={s.content}>
      <View style={s.icon}><Mail size={23} color={colors.accent} /></View>
      <Text accessibilityRole="header" style={s.title}>{copy('userProfile.closeManagedAccount')}</Text>
      <Text style={s.body}>{copy('userProfile.closeManagedWhy')}</Text>
      <Text style={s.heading}>{copy('userProfile.closeManagedStepsTitle')}</Text>
      {['userProfile.closeManagedStep1', 'userProfile.closeManagedStep2', 'userProfile.closeManagedStep3'].map((key, index) => <View key={key} style={s.step}>
        <Text style={s.number}>{index + 1}</Text>
        <Text selectable style={[s.body, { flex: 1 }]}>{copy(key, { email: user.email, supportEmail })}</Text>
      </View>)}
      <Text style={s.body}>{copy('userProfile.closeManagedNoAutomatic')}</Text>
      {error && <Text accessibilityRole="alert" style={[s.body, { color: '#f87171' }]}>{copy('userProfile.closeManagedEmailFailed', { supportEmail })}</Text>}
      <AccentPressable fallback={Pressable} testID="organizer-account-closure-email" accessibilityRole="button" onPress={() => void write()} style={s.button}>
        <Mail size={17} color="#fff" /><Text style={s.buttonText}>{copy('userProfile.closeManagedEmail')}</Text>
      </AccentPressable>
      <Text selectable style={[s.body, { textAlign: 'center' }]}>{supportEmail}</Text>
    </AppSheetScrollView>
  </AppSheet>;
}

const s = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 24, padding: 20, backgroundColor: '#ef44440a', borderWidth: 1, borderColor: '#ef444426' },
  triggerTitle: { fontSize: 14, fontWeight: '600', color: '#f87171' },
  content: { padding: 20, paddingBottom: 28, gap: 20 },
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#ff00441a', alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.6 },
  heading: { color: colors.text, fontSize: 14, fontWeight: '600' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  step: { flexDirection: 'row', gap: 12, padding: 16, backgroundColor: '#101011', borderRadius: 20 },
  number: { color: colors.accent, fontWeight: '700', fontSize: 14, lineHeight: 20 },
  button: { minHeight: 48, padding: 12, borderRadius: 24, backgroundColor: colors.accent, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
