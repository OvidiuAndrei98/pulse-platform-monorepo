import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { List, Map as MapIcon } from 'lucide-react-native';
import { usePreferences } from '../usePreferences';
import { GlassSegmentedControl } from '../ui/GlassSegmentedControl';

/** A single accent capsule, with the same travel and touch springs as the navbar. */
export function DiscoveryViewSwitch({ view, onChange, disabled = false, style }: {
  view: 'list' | 'map'; onChange: (view: 'list' | 'map') => void;
  disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { copy } = usePreferences();
  return <GlassSegmentedControl testID="events-view-switch" style={[{ width: 152 }, style]}
          value={view} onChange={onChange} disabled={disabled} indicatorTestID="events-view-indicator" options={[
            { value: 'list', label: copy('eventMap.list'), content: <List size={16} color="white"/>, testID: 'events-list-toggle' },
            { value: 'map', label: copy('eventMap.map'), content: <MapIcon size={16} color="white"/>, testID: 'events-map-toggle' },
          ]}/>
}
