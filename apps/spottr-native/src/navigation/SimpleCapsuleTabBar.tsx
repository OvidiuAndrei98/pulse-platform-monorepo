import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { MAIN_TAB_LABELS } from '@packages/app-core/navigation/mainTabs';
import { usePreferences } from '../usePreferences';
import { ToastHost } from '../ui/ToastHost';
import type { NativeTabBarProps } from './NativeTabBar';
import { TabBarSurface } from './TabBarSurface';
import { TabBarIcon } from './TabBarIcon';
import { TabIndicator } from './TabIndicator';
import { ContinuousNavShape } from './ContinuousNavShape';
import { NavBarMask } from './NavBarMask';
import { useTabIndicator } from './useTabIndicator';
import type { TabIndicatorTimeline } from './tabIndicatorTimeline';
import { getTabCapsuleGeometry, tabBarInset, tabBarWidthFromSpacing } from './tabCapsuleGeometry';

/** Same resting artwork on Android and native web, with no elastic deformation. */
export function SimpleCapsuleTabBar({ state, navigation, activeIndex = state.index, onSelectTab,
  indicatorMotion, interactionEnabled = true }: NativeTabBarProps) {
  const { copy } = usePreferences('copy');
  const clipId = useId();
  const { width: viewportWidth } = useWindowDimensions();
  const desktopPreview = Platform.OS === 'web' && viewportWidth >= 768;
  const [width, setWidth] = useState(0);
  const activatedRoute = useRef<string | null>(null);
  const barWidth = width || tabBarWidthFromSpacing(indicatorMotion?.itemWidth ?? 0, state.routes.length);
  const geometry = getTabCapsuleGeometry(barWidth, state.routes.length);
  const localPosition = useTabIndicator(activeIndex, geometry.spacing, !indicatorMotion);
  const position = indicatorMotion?.position ?? localPosition;
  const localTimeline = useRef<TabIndicatorTimeline | null>(null);
  const webGlass: ViewStyle & { backgroundImage: string; backdropFilter: string; WebkitBackdropFilter: string; clipPath: string } = {
    backgroundImage: 'linear-gradient(180deg, rgba(31,31,31,0.48), rgba(26,26,26,0.58), rgba(18,18,18,0.7))',
    backdropFilter: `blur(${desktopPreview ? 40 : 16}px)`,
    WebkitBackdropFilter: `blur(${desktopPreview ? 40 : 16}px)`,
    boxShadow: '0 12px 32px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.1), inset 0 -8px 16px rgba(0,0,0,0.35)',
    clipPath: `url("#${clipId}")`,
  };

  useLayoutEffect(() => {
    if (width && geometry.spacing > 0 && indicatorMotion?.itemWidth !== geometry.spacing) {
      indicatorMotion?.measure(geometry.spacing);
    }
  }, [width, geometry.spacing, indicatorMotion?.itemWidth, indicatorMotion?.measure]);

  return <View pointerEvents={interactionEnabled ? 'box-none' : 'none'}
    importantForAccessibility={interactionEnabled ? 'auto' : 'no-hide-descendants'}
    style={styles.position}>
    <NavBarMask width={barWidth} height={62}>
    <TabBarSurface testID="tab-bar" style={[styles.bar, desktopPreview && { maxWidth: 360 }, Platform.OS === 'web' && webGlass]} onLayout={event => {
      const measured = event.nativeEvent.layout.width;
      if (measured > 0) setWidth(measured);
    }}>
      <ContinuousNavShape width={barWidth} height={62} clipId={clipId}/>
      <View style={[styles.track, geometry.trackWidth > 0 && { width: geometry.trackWidth }]}>
        {geometry.spacing > 0 && <TabIndicator position={position} target={activeIndex * geometry.spacing}
          timeline={indicatorMotion?.timeline ?? localTimeline}
          style={[styles.indicator, { width: geometry.blobWidth, left: geometry.blobLeft }]}><ContinuousNavShape width={geometry.blobWidth} height={52}/></TabIndicator>}
        {state.routes.map((route, index) => {
          const active = index === activeIndex;
          const activate = () => {
            if (!interactionEnabled) return;
            if (onSelectTab) { onSelectTab(route.name); return; }
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!event.defaultPrevented && !active) navigation.navigate(route.name, route.params);
          };
          return <Pressable key={route.name} testID={`tab-${route.name}`}
            accessibilityRole="tab" accessibilityLabel={copy(MAIN_TAB_LABELS[index] ?? 'nav.home')}
            aria-selected={active}
            accessibilityState={{ selected: active, disabled: !interactionEnabled }} disabled={!interactionEnabled}
            style={[styles.tab, geometry.spacing > 0 && { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: geometry.tabs[index]!.width }]}
            onTouchStart={Platform.OS !== 'web' ? activate : undefined}
            onPressIn={Platform.OS === 'web' ? () => {
              activatedRoute.current = route.key;
              activate();
            } : undefined}
            onPress={event => {
              const source = (event.nativeEvent ?? event) as { type?: string; detail?: number; identifier?: number | string };
              if (Platform.OS !== 'web') {
                if (source.identifier == null) activate();
                return;
              }
              const virtualClick = source.type === 'click' && source.detail === 0;
              if (virtualClick || activatedRoute.current !== route.key) activate();
              activatedRoute.current = null;
            }}
            onAccessibilityTap={() => { activatedRoute.current = null; activate(); }}
            onLongPress={onSelectTab ? undefined : () => navigation.emit({ type: 'tabLongPress', target: route.key })}>
            <View testID={`tab-icon-${route.name}`} pointerEvents="none"
              style={geometry.spacing > 0 ? { transform: [{ translateX: geometry.tabs[index]!.iconOffset }] } : undefined}>
              <TabBarIcon index={index} active={active} size={26} color="white" strokeWidth={2} />
            </View>
          </Pressable>;
        })}
      </View>
    </TabBarSurface>
    </NavBarMask>
    <ToastHost placement="navbar" />
  </View>;
}

const styles = StyleSheet.create({
  position: { position: 'absolute', left: 20, right: 20, bottom: 20, alignItems: 'center' },
  bar: { height: 62, width: '100%', padding: tabBarInset, overflow: 'hidden',
    boxShadow: '0 12px 32px rgba(0,0,0,0.6)' },
  track: { position: 'relative', flex: 1, flexDirection: 'row' },
  indicator: { position: 'absolute', top: 1, bottom: 1 },
  tab: { flexGrow: 1, flexShrink: 1, flexBasis: 0, height: '100%', borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
});
