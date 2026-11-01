import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassSurface } from './GlassSurface';
import { CapsuleSwitchTrack, type CapsuleSwitchOption } from './CapsuleSwitchTrack';
import { Text } from './Text';
import { colors } from './theme';

/** One shared capsule, gesture handling and UI-thread spring for segmented switches. */
export function GlassSegmentedControl<T extends string>({ value, onChange, options, disabled = false, role = 'button', testID, indicatorTestID, style }: {
  value: T; onChange: (value: T) => void;
  options: Array<Omit<CapsuleSwitchOption<T>, 'content'> & { content?: React.ReactNode }>;
  disabled?: boolean; role?: 'button' | 'tab'; testID?: string; indicatorTestID?: string; style?: StyleProp<ViewStyle>;
}) {
  return <GlassSurface testID={testID} style={[s.surface, style]}>
    <View pointerEvents="box-none" style={s.mask}>
      <View style={s.track} pointerEvents={disabled ? 'none' : 'auto'} aria-hidden={disabled} accessibilityElementsHidden={disabled} importantForAccessibility={disabled ? 'no-hide-descendants' : 'auto'}>
        <CapsuleSwitchTrack value={value} onChange={onChange} height={36} disabled={disabled} role={role} indicatorTestID={indicatorTestID}
          options={options.map(option => ({ ...option, content: option.content ?? <Text numberOfLines={1} style={[s.label, value === option.value && { color: colors.text }]}>{option.label}</Text> }))}/>
      </View>
    </View>
    <View pointerEvents="none" style={s.border}/>
  </GlassSurface>;
}
const s = StyleSheet.create({
  surface: { height: 44, borderRadius: 22, backgroundColor: '#121418ed', flexShrink: 0 },
  mask: { ...StyleSheet.absoluteFill, borderRadius: 22, overflow: 'hidden' },
  border: { ...StyleSheet.absoluteFill, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: '#ffffff1a' },
  track: { position: 'absolute', left: 4, right: 4, top: 4, height: 36, flexDirection: 'row' },
  label: { color: colors.muted, fontSize: 12, fontWeight: '600' },
});
