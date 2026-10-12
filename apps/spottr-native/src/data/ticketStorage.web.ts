import type { TicketCache } from './ticketCache';

// Installed apps persist QR credentials in Keychain/Keystore. Browser preview
// deliberately keeps its existing in-memory behavior, without localStorage QRs.
export const ticketCache: TicketCache = {
  enabled: false, load: async () => null, save: async () => {}, remove: async () => {},
};
