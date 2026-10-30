import React from 'react';
import { VectorEventMap } from '../../../pulse-app/src/features/events/map/VectorEventMap';
import { usePreferences } from '../PreferencesProvider';
import type { EventMapProps } from './types';
export function EventMap(props: EventMapProps) {
  const { copy } = usePreferences();
  return <VectorEventMap {...props} clusterLabel={count=>copy('eventMap.cluster',{count})} label={copy('eventMap.map')} errorLabel={copy('feedback.loadFailed')} retryLabel={copy('common.retry')} />;
}
