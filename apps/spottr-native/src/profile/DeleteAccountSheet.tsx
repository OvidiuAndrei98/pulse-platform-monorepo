import React, { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { accountApi, useAuth } from '../auth/AuthProvider';
import { ApiError } from '../data/http';
import { usePreferences } from '../usePreferences';
import { AppSheet } from '../ui/AppSheet';
import { AppSheetScrollView } from '../ui/AppSheetScrollView';
import { FormInput, formStyles } from '../ui/FormInput';
import { MotionPressable as Pressable } from '../ui/MotionPressable';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { OrganizerAccountClosureSheet } from './OrganizerAccountClosure';

// Only participant accounts have an automatic deletion endpoint.
export function DeleteAccountSheet({ onClose }: { onClose(): void }) {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === 'user'
    ? <ParticipantDeletionSheet key={user.id} onClose={onClose} />
    : <OrganizerAccountClosureSheet key={user.id} onClose={onClose} />;
}

function ParticipantDeletionSheet({ onClose }: { onClose(): void }) {
  const { user, controller } = useAuth(), { copy } = usePreferences();
  const [confirmation, setConfirmation] = useState(''), [password, setPassword] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const pending = useRef(false);
  if (!user || user.role !== 'user') return null;
  const requiresPassword = user.hasPassword !== false;
  const valid = !!confirmation.trim() && confirmation.trim().toLowerCase() === user.email.trim().toLowerCase()
    && (!requiresPassword || password.length > 0);
  const remove = async () => {
    if (!valid || pending.current || controller.getSnapshot().user?.role !== 'user') return;
    pending.current = true;
    setBusy(true);
    setError('');
    const token = controller.getToken();
    try {
      await accountApi('/users/me', { method: 'DELETE', token, body: {
        confirmation: confirmation.trim(), ...(requiresPassword ? { currentPassword: password } : {}),
      } });
      if (controller.getToken() === token) await controller.logout();
    } catch (cause) {
      if (controller.getToken() === token) setError(copy(cause instanceof ApiError && cause.status === 401
        ? requiresPassword ? 'userProfile.deletePasswordInvalid' : 'userProfile.deleteGoogleReauthRequired'
        : 'userProfile.deleteFailed'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return <AppSheet open onClose={onClose} label={copy('common.close')} height={0.9} testID="delete-account-sheet">
    <AppSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <View style={s.icon}><Trash2 size={23} color="#f87171" /></View>
      <View style={s.section}>
        <Text accessibilityRole="header" style={s.title}>{copy('userProfile.deleteDialogTitle')}</Text>
        <Text style={s.body}>{copy('userProfile.deleteDialogDescription')}</Text>
      </View>
      <View style={s.card}>
        <Text style={s.heading}>{copy('userProfile.deleteDialogWarning')}</Text>
        <Text style={s.body}>{copy('userProfile.deleteProfileData')}</Text>
        <Text style={s.body}>{copy('userProfile.deleteSocialData')}</Text>
      </View>
      <View style={[s.card, s.warning]}>
        <Text style={[s.heading, { color: '#fca5a5' }]}>{copy('userProfile.deleteTicketsTitle')}</Text>
        <Text style={s.body}>{copy('userProfile.deleteTicketsData')}</Text>
        <Text style={s.note}>{copy('userProfile.deleteOfflineNote')}</Text>
      </View>
      <View style={s.card}>
        <Text style={s.heading}>{copy('userProfile.retainFiscalTitle')}</Text>
        <Text style={s.body}>{copy('userProfile.retainFiscalData')}</Text>
        <Text style={s.note}>{copy('userProfile.deleteCleanupHint')}</Text>
      </View>
      <View style={s.section}>
        <Text style={s.heading}>{copy('userProfile.deleteStepsTitle')}</Text>
        <Text style={s.body}>{copy(requiresPassword ? 'userProfile.deleteStepsPassword' : 'userProfile.deleteStepsGoogle')}</Text>
      </View>
      <View style={s.section}>
        <Text style={formStyles.profileLabel}>{copy('userProfile.deleteConfirmationLabel')}</Text>
        <Text selectable style={s.body}>{copy('userProfile.deleteConfirmationHint', { email: user.email })}</Text>
        <FormInput inSheet variant="profile" testID="delete-account-email" accessibilityLabel={copy('userProfile.deleteConfirmationLabel')}
          value={confirmation} onChangeText={value => { setConfirmation(value); setError(''); }}
          autoCapitalize="none" autoCorrect={false} autoComplete="off" keyboardType="email-address" editable={!busy} maxLength={254} />
      </View>
      {requiresPassword ? <View style={s.section}>
        <Text style={formStyles.profileLabel}>{copy('userProfile.deletePasswordLabel')}</Text>
        <FormInput inSheet variant="profile" testID="delete-account-password" accessibilityLabel={copy('userProfile.deletePasswordLabel')}
          value={password} onChangeText={value => { setPassword(value); setError(''); }} secureTextEntry
          autoCapitalize="none" autoCorrect={false} autoComplete="current-password" editable={!busy} maxLength={256} />
        <Text style={s.note}>{copy('userProfile.deletePasswordHint')}</Text>
      </View> : <Text style={s.body}>{copy('userProfile.deleteGoogleReauthHint')}</Text>}
      {!!error && <Text testID="delete-account-error" accessibilityRole="alert" style={s.error}>{error}</Text>}
      <Pressable testID="delete-account-confirm" accessibilityRole="button" accessibilityState={{ disabled: !valid || busy, busy }}
        disabled={!valid || busy} onPress={() => void remove()} style={[s.remove, (!valid || busy) && { opacity: 0.4 }]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Trash2 size={17} color="#fff" />}
        <Text style={s.buttonText}>{copy(busy ? 'userProfile.deletingAccount' : 'userProfile.confirmDelete')}</Text>
      </Pressable>
      <Pressable testID="delete-account-cancel" accessibilityRole="button" disabled={busy} onPress={onClose} style={s.cancel}>
        <Text style={s.body}>{copy('common.cancel')}</Text>
      </Pressable>
    </AppSheetScrollView>
  </AppSheet>;
}

const s = StyleSheet.create({
  content: { padding: 20, paddingBottom: 28, gap: 20 },
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#ef44441a', alignItems: 'center', justifyContent: 'center' },
  section: { gap: 8 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.6 },
  heading: { color: colors.text, fontSize: 14, fontWeight: '600' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  card: { padding: 16, gap: 10, borderRadius: 20, backgroundColor: '#101011' },
  warning: { backgroundColor: '#ef444410', borderWidth: 1, borderColor: '#ef444430' },
  error: { color: '#f87171', fontSize: 13, lineHeight: 20 },
  remove: { minHeight: 48, padding: 12, borderRadius: 24, backgroundColor: '#dc2626', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
