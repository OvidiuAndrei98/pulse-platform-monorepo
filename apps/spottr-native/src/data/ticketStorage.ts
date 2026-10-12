import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import { REMOTE_API_URL } from '../config.shared';
import { createTicketCache } from './ticketCache';

export const ticketCache = createTicketCache({
  getItem: key => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  removeItem: key => SecureStore.deleteItemAsync(key),
}, REMOTE_API_URL, randomUUID);
