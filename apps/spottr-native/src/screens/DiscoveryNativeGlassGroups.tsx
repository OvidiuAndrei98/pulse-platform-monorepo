import type React from 'react';
import type { LayoutChangeEvent, ViewInstance } from 'react-native';
import type { DerivedValue, SharedValue } from 'react-native-reanimated';
import type { SearchMorphBounds, searchMorphGeometry } from './searchMorph';

export type DiscoveryNativeGlassGroupsProps = {
  bounds: SharedValue<SearchMorphBounds>; progress: SharedValue<number>;
  geometry: DerivedValue<ReturnType<typeof searchMorphGeometry>>;
  backScale: SharedValue<number>;
  sourceSwitch: React.ReactNode; filter: React.ReactNode; field: React.ReactNode;
  compact: boolean; active: boolean; focused: boolean;
  searchLabel: string; backLabel: string; triggerRef: React.Ref<ViewInstance>;
  onOpen: () => void; onClose: () => void; onSearchPressIn: () => void;
  onSourceLayout: (event: LayoutChangeEvent) => void;
  onDestinationLayout: (event: LayoutChangeEvent) => void;
};

export function DiscoveryNativeGlassGroups(_props: DiscoveryNativeGlassGroupsProps) { return null; }
