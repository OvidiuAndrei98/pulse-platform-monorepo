import React, { useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';

const SceneContent = React.memo(function SceneContent({ children }: { active: boolean; children: ReactNode }) {
  return <>{children}</>;
}, (previous, next) => !next.active || previous.children === next.children);

/** Keep the list and the first opened map alive for the lifetime of Discover.
 * Parking preserves native map size, camera, glass controls and list offset.
 * display:none / zero opacity can invalidate native layouts or glass surfaces.
 */
export function DiscoveryScenes({ view, list, map }: { view: 'list' | 'map'; list: ReactNode; map: ReactNode }) {
  const { width } = useWindowDimensions();
  const [mapVisited, setMapVisited] = useState(view === 'map');
  useEffect(() => { if (view === 'map') setMapVisited(true); }, [view]);
  const scene = (name: 'list' | 'map', content: ReactNode) => {
    const visible = view === name;
    return <View key={name} testID={`discovery-${name}-scene`} collapsable={false}
      pointerEvents={visible ? 'auto' : 'none'} aria-hidden={!visible}
      accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      {...(Platform.OS === 'web' ? { inert: !visible } : {})}
      style={[StyleSheet.absoluteFill, { transform: [{ translateX: visible ? 0 : width * 2 }] }]}>
      {/* Keep inactive content intact; apply new filter data when it returns
          instead of rebuilding an offscreen native marker tree on every edit. */}
      <SceneContent active={visible}>{content}</SceneContent>
    </View>;
  };
  return <View testID="discovery-scenes" style={s.container}>
    {scene('list', list)}
    {(mapVisited || view === 'map') && scene('map', map)}
  </View>;
}

const s = StyleSheet.create({ container: { flex: 1, overflow: 'hidden' } });
