import React from 'react';
import { StackActions, useNavigation } from '@react-navigation/native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBar } from './TabBar';
import { useAuth } from '../auth/AuthProvider';

// On a cold profile link the lazy Tabs route has not mounted yet. The bar still
// needs its four destinations; selecting one initializes the existing Tabs route.
const initialTabs: BottomTabBarProps['state'] = {
  stale: false, type: 'tab', key: 'public-profile-tabs', index: 3,
  routeNames: ['Home', 'Explore', 'Feed', 'Profile'], history: [], preloadedRouteKeys: [],
  routes: ['Home', 'Explore', 'Feed', 'Profile'].map(name => ({ key: 'public-' + name, name })),
};

/** Reuse the same bar while keeping the actual tab screens mounted underneath. */
export function PublicProfileTabBar({ activeIndex = 3 }: { activeIndex?: number }) {
  const navigation = useNavigation(), insets = useSafeAreaInsets();
  const { user } = useAuth();
  let root = navigation;
  while (root.getParent()) root = root.getParent()!;
  const tabs = root.getState()?.routes.find(route => route.name === 'Tabs')?.state;
  const select = (screen: string) => {
    if (screen === 'Profile' && user?.role === 'organizer') { root.dispatch(StackActions.popTo('Dashboard')); return; }
    if (screen === 'Profile' && user?.role === 'admin') { root.dispatch(StackActions.popTo('Admin')); return; }
    const params = screen === 'Profile' ? { screen: 'ProfileHome' } : screen === 'Feed' ? { screen: 'FeedHome' } : undefined;
    root.dispatch(StackActions.popTo('Tabs', { screen, params }));
  };
  // onSelectTab handles all presses, including the highlighted Profile tab.
  // The source navbar highlights Profile for every /users/:id route.
  return <TabBar state={tabs?.type === 'tab' ? tabs as BottomTabBarProps['state'] : initialTabs} navigation={navigation as unknown as BottomTabBarProps['navigation']}
    descriptors={{}} insets={insets} activeIndex={activeIndex} onSelectTab={select} />;
}
