import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';
import { accountApi } from '../auth/AuthProvider';
import { createScannerApi } from './data';
import { createOfflineScanner, serialLock, type Exclusive } from './offline';

const localLock = serialLock();
const exclusive: Exclusive = (key, task) => {
  if (Platform.OS !== 'web') return localLock(key, task);
  // AsyncStorage on web uses localStorage; Web Locks serialize different tabs.
  const locks = globalThis.navigator?.locks;
  if (!locks) return Promise.reject(new Error('OFFLINE_LOCK_UNAVAILABLE'));
  return locks.request(key, task);
};
export const offlineScanner = createOfflineScanner(AsyncStorage, randomUUID, Date.now, exclusive);
export const scannerApi = createScannerApi(accountApi);
