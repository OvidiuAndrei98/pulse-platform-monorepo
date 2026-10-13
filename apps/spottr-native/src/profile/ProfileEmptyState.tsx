import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ArrowUpRight, type LucideIcon } from 'lucide-react-native';
import { MotionPressable } from '../ui/MotionPressable';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { usePreferences } from '../PreferencesProvider';

export function ProfileEmptyState({ icon: Icon, title, onExplore, testID }: {
  icon: LucideIcon; title: string; onExplore: () => void; testID: string;
}) {
  const { copy } = usePreferences();
  return <View testID={testID} style={s.panel}>
    <View style={{ width: 32, alignItems: 'center', paddingTop: 3 }}><Icon size={23} color={colors.muted} /></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>{title}</Text>
      <MotionPressable testID={`${testID}-explore`} accessibilityRole="button" onPress={onExplore} style={s.action}>
        <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>{copy('userProfile.discoverEvents')}</Text>
        <ArrowUpRight size={15} color={colors.accent} />
      </MotionPressable>
    </View>
  </View>;
}
const s = StyleSheet.create({
  panel: { padding: 16, paddingBottom: 8, borderRadius: 22, backgroundColor: '#09090b', flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6 },
});
