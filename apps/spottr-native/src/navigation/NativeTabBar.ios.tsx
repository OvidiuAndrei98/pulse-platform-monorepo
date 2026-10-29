import React, { useState } from 'react';
import { StyleSheet, type NativeSyntheticEvent, type ViewProps } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { usePreferences } from '../PreferencesProvider';
import { colors } from '../ui/theme';
import type { NativeTabBarProps } from './NativeTabBar';

type NativeProps = ViewProps & {
  selection: { index: number; revision: number };
  labels: string[];
  accentColor: string;
  onTabSelect: (event: NativeSyntheticEvent<{ index: number }>) => void;
};

// A JS refresh cannot install UIKit code. Older installed builds/Expo Go keep
// working; the actual system tab bar becomes available after the Pods rebuild.
const glass: typeof import('expo-glass-effect') | null =
  requireOptionalNativeModule('ExpoGlassEffect') ? require('expo-glass-effect') : null;
const nativeTabs = requireOptionalNativeModule('SpottrNativeTabs');
const supportsGlass = Boolean(glass?.isLiquidGlassAvailable() && glass.isGlassEffectAPIAvailable());
const NativeView = nativeTabs && supportsGlass
  ? requireNativeView<NativeProps>('SpottrNativeTabs') : null;

if (__DEV__ && supportsGlass) {
  if (NativeView) console.info('[navbar] UIKit tab bar enabled; selection and dragging are owned by iOS.');
  else console.warn('[navbar] SpottrNativeTabs is missing from this binary. The legacy navbar has no native drag. Sync modules/spottr-native-tabs/ios, install Pods and rebuild in Xcode.');
}

const labels = ['nav.home', 'nav.map', 'nav.feed', 'nav.profile'] as const;

function SystemTabBar({ state, navigation, insets, activeIndex = state.index, onSelectTab }: NativeTabBarProps) {
  const { copy } = usePreferences();
  const [revision, acknowledge] = useState(0);
  if (!NativeView) return null;
  return <NativeView testID="tab-bar" style={[styles.bar, { height: 96 + insets.bottom }]}
    selection={{ index: activeIndex, revision }} labels={labels.map(key => copy(key))} accentColor={colors.accent}
    onTabSelect={({ nativeEvent: { index } }) => {
      const route = Number.isInteger(index) ? state.routes[index] : undefined;
      if (route) {
        if (onSelectTab) onSelectTab(route.name);
        else {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (index !== activeIndex && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        }
      }
      // A prevented navigation may leave the index unchanged. Acknowledge it
      // explicitly so UIKit still restores the controlled route's selection.
      acknowledge(value => value + 1);
    }} />;
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'transparent' },
});

export const NativeTabBar = NativeView ? SystemTabBar : null;
