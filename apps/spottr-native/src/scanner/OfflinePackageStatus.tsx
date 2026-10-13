import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { usePreferences } from '../PreferencesProvider';
import { Text } from '../ui/Text';
import { dColors as colors } from '../dashboard/common';
import type { OfflineState } from './offline';
import { offlinePackageStatus, packageAge } from './preparation';
export function OfflinePackageStatus({ state, compact = false }: { state?: OfflineState; compact?: boolean }) {
  const { language } = usePreferences(), ro = language === 'ro';
  const [tick, setTick] = useState(Date.now), now = Math.max(tick, Date.now());
  useEffect(() => { const timer = setInterval(() => setTick(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const status = offlinePackageStatus(state, now), snapshot = state?.snapshot;
  const label = status === 'ready' ? `${snapshot!.ticketCount} ${ro ? 'bilete' : 'tickets'} · ${packageAge(snapshot!.generatedAt, now, ro)}`
    : status === 'expired' ? (ro ? 'Pachet offline expirat' : 'Offline package expired')
    : status === 'revoked' ? (ro ? 'Acces la scanare retras' : 'Scanning access revoked')
    : status === 'clock' ? (ro ? 'Verifică data și ora telefonului' : 'Check the device date and time')
    : (ro ? 'Fără pachet offline. Pregătește scannerul cât ai internet.' : 'No offline package. Prepare the scanner while online.');
  return <View testID={compact ? 'scanner-gate-package' : 'scanner-package-status'} style={{ gap: 6, flexShrink: 1 }}>
    <Text style={{ color: status === 'ready' ? colors.muted : '#fde68a', fontSize: compact ? 11 : 12, lineHeight: compact ? 16 : 18 }}>{label}</Text>
    {!compact && snapshot && <>
      <Text style={{ color: colors.muted, fontSize: 11 }}>{new Date(snapshot.generatedAt).toLocaleString(ro ? 'ro-RO' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
      <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17 }}>{ro ? 'Biletele cumpărate după actualizare pot lipsi. Pregătește din nou scannerul înainte de acces.' : 'Tickets bought after this update may be missing. Prepare the scanner again before entry.'}</Text>
    </>}
  </View>;
}
