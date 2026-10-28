import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import { REMOTE_API_URL } from '../config.shared';
import { createTicketCache } from './ticketCache';
import { observeStorage } from '../diagnostics/handled';

export const ticketCache = createTicketCache({
  getItem: key => observeStorage('tickets_storage', () => SecureStore.getItemAsync(key)),
  setItem: (key, value) => observeStorage('tickets_storage', () => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY })),
  removeItem: key => observeStorage('tickets_storage', () => SecureStore.deleteItemAsync(key)),
}, REMOTE_API_URL, randomUUID);
