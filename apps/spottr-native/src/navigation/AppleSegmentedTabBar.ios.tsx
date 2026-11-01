import React, { useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import SegmentedControlNative, { type SegmentedControlProps } from '@react-native-segmented-control/segmented-control';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { NativeTabBarProps } from './NativeTabBar';
import { usePreferences } from '../usePreferences';
import { colors } from '../ui/theme';
import { ToastHost } from '../ui/ToastHost';
import { TabBarSurface } from './TabBarSurface';
import { TabBarIcon } from './TabBarIcon';
import { NavbarScrollContext, navbarCompactScale } from './useNavbarScroll';
import { tabCapsulePickupSpring } from './tabCapsuleSpring';
import { createAppleTabSelection } from './appleTabSelection';

const labels = ['nav.home', 'nav.map', 'nav.feed', 'nav.profile'] as const;
const hiddenTitle = { color: 'transparent', fontSize: 1 } as const;
type AppleControlHandle = { setNativeProps: (props: { selectedIndex: number }) => void };
// This package forwards its host ref at runtime; its old class/mixin types use
// NativeMethods, which was removed from React Native's current declarations.
const SegmentedControl = SegmentedControlNative as unknown as React.ForwardRefExoticComponent<SegmentedControlProps & React.RefAttributes<AppleControlHandle>>;

/** UIKit animates and tracks the selector. No JS pan recognizer, travelling
 * overlay, or second spring is layered onto its selection animation. */
export function AppleSegmentedTabBar({ state, navigation, insets, activeIndex = state.index, onSelectTab, interactionEnabled = true }: NativeTabBarProps) {
  const { copy } = usePreferences();
  const control = useRef<AppleControlHandle>(null);
  const initialIndex = useRef(activeIndex).current;
  const selection = useRef(createAppleTabSelection(activeIndex)).current;
  const [iconIndex, setIconIndex] = useState(activeIndex);
  const scroll = useContext(NavbarScrollContext);
  const localCompact = useSharedValue(0);
  const compact = scroll?.compact ?? localCompact;
  const values = useMemo(() => state.routes.map((_, index) => copy(labels[index] ?? 'nav.home')), [copy, state.routes.length]);

  useLayoutEffect(() => {
    if (selection.acknowledge(activeIndex)) {
      control.current?.setNativeProps({ selectedIndex: activeIndex });
      setIconIndex(activeIndex);
    }
  }, [activeIndex, selection]);

  const expand = useCallback(() => {
    if (!interactionEnabled) return;
    compact.value = withSpring(0, tabCapsulePickupSpring);
    scroll?.onTouch();
  }, [compact, scroll, interactionEnabled]);

  const choose = (index: number) => {
    const restore = () => {
      const confirmed = selection.reject();
      control.current?.setNativeProps({ selectedIndex: confirmed });
      setIconIndex(confirmed);
    };
    const route = Number.isInteger(index) ? state.routes[index] : undefined;
    if (!interactionEnabled || !route) { restore(); return; }
    selection.begin(index);
    setIconIndex(index);
    expand();
    let accepted: boolean;
    if (onSelectTab) accepted = onSelectTab(route.name) !== false;
    else {
      accepted = !navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true }).defaultPrevented;
      if (accepted && index !== activeIndex) navigation.navigate(route.name, route.params);
    }
    if (!accepted) restore();
    else if (index === activeIndex) selection.acknowledge(index);
  };

  // Keep the existing scroll-to-compact behavior on the whole bar. The native
  // control alone owns the moving selection, including interrupted gestures.
  const compactMotion = useAnimatedStyle(() => ({ transform: [{ scale: 1 - compact.value * (1 - navbarCompactScale) }] }));

  return <View collapsable={false} pointerEvents={interactionEnabled ? 'box-none' : 'none'} accessibilityElementsHidden={!interactionEnabled}
    style={[styles.position, { bottom: Math.max(12, insets.bottom - 12) }]}>
    <Animated.View testID="tab-compact-motion" style={compactMotion}>
      <TabBarSurface testID="tab-bar" style={styles.bar}>
        <SegmentedControl ref={control} testID="tab-apple-selector" style={styles.selector}
          values={values} selectedIndex={initialIndex} enabled={interactionEnabled}
          appearance="dark" tintColor={`${colors.accent}73`} backgroundColor="transparent"
          fontStyle={hiddenTitle} activeFontStyle={hiddenTitle}
          onTouchStart={expand} onChange={event => choose(event.nativeEvent.selectedSegmentIndex)} />
        {/* Keep the original artwork. These views never intercept UIKit's
            gestures; native segment titles provide the VoiceOver labels. */}
        <View pointerEvents="none" accessibilityElementsHidden style={styles.icons}>
          {state.routes.map((route, index) => <View key={route.key} testID={`tab-${route.name}`} style={styles.icon}>
            <TabBarIcon index={index} active={iconIndex === index} size={26} color="white" strokeWidth={2} />
          </View>)}
        </View>
      </TabBarSurface>
    </Animated.View>
    <ToastHost placement="navbar" />
  </View>;
}

const styles = StyleSheet.create({
  position: { position: 'absolute', left: 20, right: 20 },
  bar: { height: 62, width: '100%', borderRadius: 31 },
  selector: { height: 62, width: '100%' },
  icons: { ...StyleSheet.absoluteFill, left: 4, right: 4, flexDirection: 'row' },
  icon: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
