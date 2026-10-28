import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StackActions } from '@react-navigation/native';
import type { RootParamList } from './types';

type EventState = { key?: string; routes: readonly { name: string; params?: unknown; state?: EventState }[] };
export function eventStackKey(state: EventState | undefined, id: string): string | undefined {
  if (!state) return;
  if (state.routes.some(route => route.name === 'EventDetails' && (route.params as { id?: string })?.id === id)) return state.key;
  for (const route of [...state.routes].reverse()) {
    const key = eventStackKey(route.state, id);
    if (key) return key;
  }
}

export function returnToEvent(navigation: NativeStackNavigationProp<RootParamList>, id: string) {
  // Preserve sheet/page presentation and the mounted event underneath checkout.
  const state = navigation.getState();
  if (state.routeNames.includes('EventDetails')) navigation.popTo('EventDetails', { id }, { merge: true });
  else {
    // A cold return has no event. A deep link arriving while its existing event
    // flow is mounted must also remove that flow's checkout, without rebuilding
    // the event or changing its sheet/page presentation and scroll position.
    const existing = [...state.routes].reverse().find(route => route.name === 'Event' && eventStackKey(route.state, id));
    if (existing) navigation.dispatch({ ...StackActions.popTo('EventDetails', { id }, { merge: true }), target: eventStackKey(existing.state, id) });
    navigation.popTo('Event', existing?.params as RootParamList['Event'] ?? { id }, { merge: true });
  }
}
