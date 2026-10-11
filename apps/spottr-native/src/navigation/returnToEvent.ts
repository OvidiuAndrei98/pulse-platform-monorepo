import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootParamList } from './types';

export function returnToEvent(navigation: NativeStackNavigationProp<RootParamList>, id: string) {
  // Preserve sheet/page presentation and the mounted event underneath checkout.
  if (navigation.getState().routeNames.includes('EventDetails')) navigation.popTo('EventDetails', { id }, { merge: true });
  else navigation.popTo('Event', { id }, { merge: true });
}
