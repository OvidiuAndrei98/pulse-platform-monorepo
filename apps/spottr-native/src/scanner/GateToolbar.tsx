import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Volume2, VolumeX, Vibrate, Wifi, WifiOff } from 'lucide-react-native';
import { usePreferences } from '../usePreferences';
import { Text } from '../ui/Text';
import { dColors as colors } from '../dashboard/common';
import type { OfflineState } from './offline';
import { OfflinePackageStatus } from './OfflinePackageStatus';
export type GateStatus = { connection: 'online' | 'offline' | 'checking'; pending?: number; state?: OfflineState; quick?: boolean };
export function GateToolbar({ status, settings, toggle, soundAvailable, awake }: { status?: GateStatus; settings: { sound: boolean; vibration: boolean }; toggle(name: 'sound' | 'vibration'): void; soundAvailable: boolean; awake: boolean }) {
  const { language } = usePreferences(), ro = language === 'ro';
  const offline = status?.connection === 'offline', Icon = offline ? WifiOff : Wifi;
  const tone = offline ? '#fde68a' : colors.accent;
  return <View style={{ gap: 10 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <View style={{ gap: 4, flexShrink: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon color={tone} size={14} /><Text testID="scanner-gate-network" style={{ color: tone, fontSize: 12, fontWeight: '600' }}>{offline ? 'Offline' : status?.connection === 'online' ? 'Online' : (ro ? 'Se verifică conexiunea' : 'Checking connection')}</Text></View>
        <Text testID="scanner-gate-pending" style={{ fontSize: 11, color: status?.pending ? '#fde68a' : colors.muted }}>{status?.quick ? (ro ? 'Link temporar · necesită internet' : 'Temporary link · internet required') : (ro ? `${status?.pending ?? 0} scanări nesincronizate` : `${status?.pending ?? 0} unsynced scans`)}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['sound', 'vibration'] as const).filter(name => name !== 'vibration' || Platform.OS !== 'web').map(name => {
          const enabled = settings[name], Icon = name === 'vibration' ? Vibrate : enabled ? Volume2 : VolumeX;
          const label = name === 'sound' ? (ro ? 'Sunet' : 'Sound') : (ro ? 'Vibrație' : 'Vibration');
          return <Pressable key={name} testID={`scanner-${name}`} accessibilityRole="switch" accessibilityLabel={label} aria-checked={enabled} accessibilityState={{ checked: enabled, disabled: name === 'sound' && !soundAvailable }} disabled={name === 'sound' && !soundAvailable} onPress={() => toggle(name)} style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: enabled ? '#ff00441a' : '#ffffff0a' }}><Icon size={18} color={enabled ? colors.accent : colors.muted} /></Pressable>;
        })}
      </View>
    </View>
    {status && !status.quick && <OfflinePackageStatus state={status.state} compact />}
    <Text testID="scanner-awake" style={{ color: colors.muted, fontSize: 10 }}>{!soundAvailable ? (ro ? 'Sunetul necesită actualizarea aplicației.' : 'Update the app to enable sound.') : awake ? (ro ? 'Ecranul rămâne aprins în modul poartă' : 'Screen stays awake in gate mode') : (ro ? 'Mod poartă' : 'Gate mode')}</Text>
  </View>;
}
