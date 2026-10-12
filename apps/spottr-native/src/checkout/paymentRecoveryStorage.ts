import * as SecureStore from 'expo-secure-store';
import { REMOTE_API_URL } from '../config.shared';
import { configureNativePaymentRecovery } from './nativePayment';
import { createPaymentRecoveryStore } from './paymentRecoveryStore';

configureNativePaymentRecovery(createPaymentRecoveryStore({
  getItem: key => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  removeItem: key => SecureStore.deleteItemAsync(key),
}, REMOTE_API_URL));
