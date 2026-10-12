import React from 'react';
import { Pressable, View } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { usePreferences } from '../PreferencesProvider';
import { Text } from '../ui/Text';

export function TicketAvailability({ offline, savedAt, storageError = false, refreshing = false, onRefresh }: {
  offline: boolean; savedAt?: number; storageError?: boolean; refreshing?: boolean; onRefresh?: () => void;
}) {
  const { copy, language } = usePreferences();
  if (!offline && !storageError) return null;
  return <View testID="tickets-availability" style={{ gap: 5, paddingVertical: 8 }}>
    <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }}>
      {offline && <WifiOff size={13} color="#b5adb1" />}
      <Text style={{ color: '#b5adb1', fontSize: 11, lineHeight: 15, flex: 1 }}>
        {copy(offline ? 'tickets.offlineCopy' : 'tickets.offlineSaveFailed')}
      </Text>
      {onRefresh && <Pressable accessibilityRole="button" testID="tickets-refresh" disabled={refreshing} onPress={onRefresh} style={{ padding: 8 }}>
        <Text style={{ color: '#ff0044', fontSize: 11 }}>{copy(refreshing ? 'common.loading' : 'tickets.refreshStatus')}</Text>
      </Pressable>}
    </View>
    {offline && savedAt && <Text style={{ color: '#999195', fontSize: 10, lineHeight: 14 }}>
      {copy('tickets.lastUpdated', { date: new Date(savedAt).toLocaleString(language === 'ro' ? 'ro-RO' : 'en-GB') })}
    </Text>}
    {offline && storageError && <Text style={{ color: '#b5adb1', fontSize: 11 }}>{copy('tickets.offlineSaveFailed')}</Text>}
  </View>;
}
