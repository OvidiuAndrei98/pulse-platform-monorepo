import * as SecureStore from 'expo-secure-store';
import { REMOTE_API_URL } from '../config.shared';
import { configureNativePaymentRecovery } from './nativePayment';
import { createPaymentRecoveryStore } from './paymentRecoveryStore';
import { observeStorage } from '../diagnostics/handled';

configureNativePaymentRecovery(createPaymentRecoveryStore({
  getItem: key => observeStorage('payment_storage', () => SecureStore.getItemAsync(key)),
  setItem: (key, value) => observeStorage('payment_storage', () => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY })),
  removeItem: key => observeStorage('payment_storage', () => SecureStore.deleteItemAsync(key)),
}, REMOTE_API_URL));
