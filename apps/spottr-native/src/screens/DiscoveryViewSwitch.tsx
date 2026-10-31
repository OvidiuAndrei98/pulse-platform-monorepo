import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { List, Map as MapIcon } from 'lucide-react-native';
import { usePreferences } from '../usePreferences';
import { GlassSurface } from '../ui/GlassSurface';
import { CapsuleSwitchTrack } from '../ui/CapsuleSwitchTrack';
const width = 152, height = 44, inset = 4;

/** A single accent capsule, with the same travel and touch springs as the navbar. */
export function DiscoveryViewSwitch({ view, onChange, disabled = false, style }: {
  view: 'list' | 'map'; onChange: (view: 'list' | 'map') => void;
  disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { copy } = usePreferences();
  return <GlassSurface testID="events-view-switch" style={[s.surface, style]}>
    {/* Clip only the contents; the native glass must remain visible and opaque. */}
    <View pointerEvents="box-none" style={s.mask}>
      <View style={s.track} pointerEvents={disabled ? 'none' : 'auto'}
        aria-hidden={disabled} accessibilityElementsHidden={disabled} importantForAccessibility={disabled ? 'no-hide-descendants' : 'auto'}>
        <CapsuleSwitchTrack value={view} onChange={onChange} height={height - inset * 2}
          disabled={disabled} indicatorTestID="events-view-indicator" options={[
            { value: 'list', label: copy('eventMap.list'), content: <List size={16} color="white"/>, testID: 'events-list-toggle' },
            { value: 'map', label: copy('eventMap.map'), content: <MapIcon size={16} color="white"/>, testID: 'events-map-toggle' },
          ]}/>
      </View>
    </View>
    <View pointerEvents="none" style={s.border}/>
  </GlassSurface>;
}
const s = StyleSheet.create({
  surface: { width, height, borderRadius: height / 2, backgroundColor: '#121418ed', flexShrink: 0 },
  mask: { ...StyleSheet.absoluteFill, borderRadius: height / 2, overflow: 'hidden' },
  border: { ...StyleSheet.absoluteFill, borderRadius: height / 2, borderWidth: StyleSheet.hairlineWidth, borderColor: '#ffffff1a' },
  track: { position: 'absolute', left: inset, right: inset, top: inset, height: height - inset * 2, flexDirection: 'row' },
});
