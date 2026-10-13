import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CircleCheck, CircleAlert, Info, X } from 'lucide-react-native';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { usePreferences } from '../PreferencesProvider';
import { useToast } from './ToastProvider';
import { Text } from './Text';
import { colors } from './theme';

// The navbar owns its overlay; full-screen presentations own a separate host.
// Unfocused screens never duplicate or intercept feedback over a native modal.
export function ToastHost({ bottom = 88, placement = 'screen' }: { bottom?: number; placement?: 'screen' | 'navbar' }) {
  const { toast, dismiss } = useToast(), focused = useIsFocused(), safe = useSafeAreaInsets();
  const { copy } = usePreferences(), reduced = useReducedMotion();
  if (!focused || !toast) return null;
  const Icon = toast.kind === 'error' ? CircleAlert : toast.kind === 'info' ? Info : CircleCheck;
  const color = toast.kind === 'error' ? '#ff5575' : toast.kind === 'info' ? colors.accent : '#41d996';
  return <View pointerEvents="box-none" style={[s.position, placement === 'navbar' ? s.navbarPosition : { bottom: bottom + safe.bottom }]}>
    <Animated.View testID="app-toast" key={toast.id} entering={reduced ? undefined : FadeInDown.duration(170)} exiting={reduced ? undefined : FadeOut.duration(120)} style={s.card}>
      <LinearGradient pointerEvents="none" colors={['#ffffff08', '#ffffff00']} style={StyleSheet.absoluteFill} />
      <View style={s.icon}><Icon color={color} size={16} /></View>
      <Text accessibilityLiveRegion="polite" accessibilityRole={toast.kind === 'error' ? 'alert' : undefined} style={s.text}>{copy(toast.key)}</Text>
      {toast.action && <Pressable testID="toast-action" accessibilityRole="button" onPress={() => { dismiss(toast.id); toast.action?.run(); }} style={s.action}>
        <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>{copy(toast.action.key)}</Text>
      </Pressable>}
      <Pressable testID="toast-dismiss" accessibilityRole="button" accessibilityLabel={copy('common.close')} onPress={() => dismiss(toast.id)} style={s.close}>
        <X size={14} color={colors.muted} />
      </Pressable>
    </Animated.View>
  </View>;
}
const s = StyleSheet.create({
  position: { position: 'absolute', left: 32, right: 32, zIndex: 100, alignItems: 'center' },
  navbarPosition: { left: 16, right: 16, top: 0, bottom: 0, justifyContent: 'center' },
  card: { width: '100%', maxWidth: 320, borderRadius: 18, overflow: 'hidden', backgroundColor: '#121214', borderWidth: 1, borderColor: '#ffffff21', paddingLeft: 9, paddingRight: 2, minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 7, boxShadow: '0 8px 24px #00000066' },
  icon: { width: 30, height: 30, flexShrink: 0, borderRadius: 10, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#ffffff0f', alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '600', lineHeight: 16, paddingVertical: 10 },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  close: { width: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
