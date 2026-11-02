import type { NavigationAction, ParamListBase, Router, StackNavigationState } from '@react-navigation/native';

export const isProfileWorkspace = (name: string) => name === 'Dashboard' || name === 'Admin';

export const profileHomeScreen = (role?: string) => role === 'admin' ? 'Admin' : role === 'organizer' ? 'Dashboard' : 'ProfileHome';
export const nativeProfilePaths = {
  ProfileHome: { path: 'users/me', alias: ['profile'] },
  Dashboard: 'dashboard/:section?', Admin: 'admin',
};

/** iOS role workspaces live in the Profile tab. Route legacy root actions (such
 * as login/Stripe returns) there too, without mounting another native navbar. */
export function profileTabRouter<Params extends ParamListBase, Action extends NavigationAction>(
  original: Router<StackNavigationState<Params>, Action>,
): Partial<Router<StackNavigationState<Params>, Action>> {
  return {
    getStateForAction(state, action, options) {
      const payload = action.payload as { name?: string; params?: object } | undefined;
      if (payload?.name && isProfileWorkspace(payload.name)
        && ['NAVIGATE', 'PUSH', 'REPLACE', 'POP_TO'].includes(action.type)) {
        return original.getStateForAction(state, {
          ...action, type: 'POP_TO', payload: {
            name: 'Tabs', params: { screen: 'Profile', params: { screen: payload.name, params: payload.params } },
          },
        } as Action, options);
      }
      return original.getStateForAction(state, action, options);
    },
  };
}

/** Prepare a fresh workspace after leaving it, preserving its route parameters.
 * A visited native-stack screen cannot become preloaded again: that would lower
 * its activityState from 2 to 0. Let StackRouter allocate a new screen key. */
export function profileStackRouter<Params extends ParamListBase, Action extends NavigationAction>(
  original: Router<StackNavigationState<Params>, Action>,
): Partial<Router<StackNavigationState<Params>, Action>> {
  return {
    getStateForAction(state, action, options) {
      const next = original.getStateForAction(state, action, options);
      if (!next || next.stale !== false || action.type === 'RESET') return next;
      const destination = next.routes[next.index]?.name;
      if (destination !== 'Tabs' && !isProfileWorkspace(destination ?? '')) return next;
      const removed = state.routes.filter(route => isProfileWorkspace(route.name) && !next.routes.some(current => current.key === route.key));
      if (!removed.length) return next;
      let prepared = next;
      for (const route of removed) {
        const result = original.getStateForAction(prepared, {
          type: 'PRELOAD', payload: { name: route.name, params: route.params },
        } as Action, options);
        if (result?.stale === false) prepared = result;
      }
      return prepared;
    },
  };
}
