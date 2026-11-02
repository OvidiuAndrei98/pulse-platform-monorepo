import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootParamList } from '../navigation/types';
import { usePreferences } from '../usePreferences';
import { GlassPressable } from '../ui/GlassPressable';
import { ActionIcon } from '../ui/ActionIcon';
import { colors } from '../ui/theme';
import { useNotifications } from './useNotifications';

export function NotificationsBell() {
  const { copy } = usePreferences('copy');
  const query = useNotifications();
  const navigation = useNavigation<NativeStackNavigationProp<RootParamList>>();
  const unread = query.data?.unreadCount ?? 0;
  return <GlassPressable testID="home-notifications" accessibilityRole="button"
    accessibilityLabel={copy('notifications.title')}
    accessibilityHint={unread ? copy('notifications.unread', { count: unread }) : undefined}
    onPress={() => navigation.navigate('Notifications')} style={s.bell}>
    <View><ActionIcon name="bell" color={colors.text} size={16} strokeWidth={2.2} />
      {unread > 0 && <View testID="notification-unread" style={s.badge} />}
    </View>
  </GlassPressable>;
}

const s = StyleSheet.create({
  bell: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: '#ffffff26', backgroundColor: '#ffffff0f' },
  badge: { position: 'absolute', right: -2, top: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
});
