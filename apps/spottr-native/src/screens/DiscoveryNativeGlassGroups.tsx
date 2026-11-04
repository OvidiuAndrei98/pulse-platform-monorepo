import type React from 'react';
import type { LayoutChangeEvent, ViewInstance } from 'react-native';
import type { DerivedValue, SharedValue } from 'react-native-reanimated';
import type { SearchMorphBounds, searchMorphGeometry } from './searchMorph';
import type { DiscoveryControlPose } from './discoveryControlsMotion';

export type DiscoveryNativeGlassGroupsProps = {
  bounds: SharedValue<SearchMorphBounds>; progress: SharedValue<number>;
  geometry: DerivedValue<ReturnType<typeof searchMorphGeometry>>;
  intent: { readonly value: { open: boolean; interactive: boolean } };
  reduceMotion: SharedValue<boolean>;
  backScale: SharedValue<number>;
  sourceSwitch: React.ReactNode; filter: React.ReactNode; field: React.ReactNode; calendar?: React.ReactNode;
  compact: boolean; active: boolean; focused: SharedValue<boolean>;
  searchLabel: string; backLabel: string; triggerRef: React.Ref<ViewInstance>;
  onOpen: () => void; onClose: () => void; onSearchPressIn: () => void; onSearchPressOut: () => void;
  onSourceLayout: (event: LayoutChangeEvent) => void;
  onCalendarLayout?: (event: LayoutChangeEvent) => void;
  calendarMotion?: SharedValue<DiscoveryControlPose>;
  onDestinationLayout: (event: LayoutChangeEvent) => void;
};

export function DiscoveryNativeGlassGroups(_props: DiscoveryNativeGlassGroupsProps) { return null; }
