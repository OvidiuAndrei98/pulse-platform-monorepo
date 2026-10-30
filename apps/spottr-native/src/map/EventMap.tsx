import { isRunningInExpoGo } from 'expo';
import { TurboModuleRegistry } from 'react-native';
import type { ComponentType } from 'react';
import type { EventMapProps } from './types';

// Check the binary before importing MapLibre's enforcing TurboModules. Older
// development binaries can lack MapLibre too, and host detection alone is not
// a capability check. A non-enforcing lookup must never evaluate the package.
const nativeMapAvailable = !isRunningInExpoGo()
  && TurboModuleRegistry.get('MLRNCameraModule') !== null
  && TurboModuleRegistry.get('MLRNMapViewModule') !== null;

export const EventMap: ComponentType<EventMapProps> = nativeMapAvailable
  ? require('./EventMapNative').EventMapNative
  : require('./EventMapExpoGo').EventMapExpoGo;
