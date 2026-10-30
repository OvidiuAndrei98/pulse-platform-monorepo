import type { NavigationAction, ParamListBase, Router, StackNavigationState } from '@react-navigation/native';

export const isProfileWorkspace = (name: string) => name === 'Dashboard' || name === 'Admin';

/** Keep role workspaces mounted offscreen when the navbar returns to Tabs. */
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
      let preloadedRoutes = next.preloadedRoutes;
      for (const route of removed) preloadedRoutes = preloadedRoutes.filter(current => current.name !== route.name).concat(route);
      return { ...next, preloadedRoutes };
    },
  };
}
