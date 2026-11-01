import { CommonActions, StackActions, type NavigationAction, type NavigationState, type PartialState } from '@react-navigation/native';
import { Platform } from 'react-native';

export type AccountPage = 'Tickets' | 'Orders' | 'SavedEvents';
export const accountPagePaths = { Tickets: 'users/me/tickets', Orders: 'users/me/invoices', SavedEvents: 'users/me/saved-events' } as const;

type Navigator = { dispatch: (action: NavigationAction) => void; getParent?: () => Navigator | undefined };

/** iOS account pages share Search's native stack; other platforms retain theirs. */
export function openAccountPage(navigation: Navigator, page: AccountPage, leaveCheckout = false) {
  if (Platform.OS !== 'ios') {
    navigation.dispatch(leaveCheckout
      ? StackActions.popTo('Tabs', { screen: 'Profile', params: { screen: page } })
      : CommonActions.navigate('Tabs', { screen: 'Profile', params: { screen: page } }));
    return;
  }
  let root = navigation;
  for (let parent = root.getParent?.(); parent; parent = root.getParent?.()) root = parent;
  // Finish the purchase flow first; dispatch both actions from the surviving
  // root, rather than from an event screen that the first action removes.
  if (leaveCheckout) root.dispatch(StackActions.popTo('Tabs', { screen: 'Profile' }));
  root.dispatch(CommonActions.navigate(page));
}

/** A cold account link needs Profile underneath, including for native Back. */
export function accountLinkOrigin(state: PartialState<NavigationState> | undefined) {
  if (Platform.OS !== 'ios' || !state) return state;
  const top = state.routes[state.index ?? state.routes.length - 1];
  if (!top || !(top.name in accountPagePaths)) return state;
  return { ...state, routes: state.routes.map(route => route.name === 'Tabs'
    ? { ...route, params: { ...route.params, screen: 'Profile' } }
    : route) };
}
