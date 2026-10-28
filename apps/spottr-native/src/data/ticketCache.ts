import { isEventId } from './events';
import { parseTickets, type UserTicket } from './tickets';

export type SavedTickets = { accountId: string; savedAt: number; tickets: UserTicket[] };
export type TicketCache = {
  enabled: boolean;
  load(accountId: string): Promise<SavedTickets | null>;
  save(snapshot: SavedTickets, current: () => boolean): Promise<void>;
  remove(accountId: string): Promise<void>;
};
type SecureStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
const fields = ['id', 'eventId', 'orderId', 'validationHash', 'isValidated', 'validatedAt', 'ticketTypeName', 'eventTitle', 'locationName', 'startTime', 'endTime', 'priceRon', 'ticketPriceBani', 'ticketingFeeBani', 'paidTotalBani', 'vatPercentage', 'vatAmountBani', 'organizerCompanyName', 'organizerCui', 'organizerFiscalAddress'] as const;
const fail = () => new Error('TICKET_CACHE_UNAVAILABLE');
const hex = (value: string) => Array.from(value).map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
const maxChunks = 4096;
type Manifest = { version: 1; generation: string; count: number };

/** Small Keychain/Keystore items, committed through one manifest. QR credentials
 * never enter AsyncStorage. A refresh invalidates the old manifest first: failed
 * storage cannot intentionally retain tickets the server has just removed. */
export function createTicketCache(storage: SecureStorage, apiOrigin: string, randomUUID: () => string): TicketCache {
  const prefix = `spottr-native.tickets.v1.${hex(apiOrigin)}.`;
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const task = queue.catch(() => {}).then(work);
    queue = task;
    return task;
  }
  function key(account: string) {
    if (!isEventId(account)) throw fail();
    return prefix + account;
  }
  function manifest(raw: string | null): Manifest | null {
    if (raw === null) return null;
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || !isEventId(value.generation) || !Number.isInteger(value.count) || value.count < 1 || value.count > maxChunks) throw fail();
    return value;
  }
  async function discard(base: string, value: Manifest | null) {
    if (!value) return;
    for (let i = 0; i < value.count; i++) await storage.removeItem(`${base}.${value.generation}.${i}`);
  }
  return {
    enabled: true,
    load: accountId => serial(async () => {
      const base = key(accountId), index = manifest(await storage.getItem(base));
      if (!index) return null;
      let raw = '';
      for (let i = 0; i < index.count; i++) {
        const part = await storage.getItem(`${base}.${index.generation}.${i}`);
        if (part === null) throw fail();
        raw += part;
      }
      const row = JSON.parse(raw);
      if (!row || row.accountId !== accountId || !Number.isFinite(row.savedAt) || row.savedAt <= 0 || !Array.isArray(row.tickets)) throw fail();
      return { accountId, savedAt: row.savedAt, tickets: parseTickets(row.tickets) };
    }),
    save: (snapshot, current) => serial(async () => {
      if (!current()) return;
      const base = key(snapshot.accountId);
      let previous: Manifest | null = null;
      try { previous = manifest(await storage.getItem(base)); } catch { /* Online data may repair a corrupt cache. */ }
      if (!current()) return;
      await storage.removeItem(base);
      await discard(base, previous);
      if (!current()) return;
      const tickets = parseTickets(snapshot.tickets).map(ticket => Object.fromEntries(fields.filter(field => ticket[field] !== undefined).map(field => [field, ticket[field]])));
      if (!Number.isFinite(snapshot.savedAt) || snapshot.savedAt <= 0) throw fail();
      const raw = JSON.stringify({ accountId: snapshot.accountId, savedAt: snapshot.savedAt, tickets });
      // Bound UTF-8 bytes, not JS string length (Romanian/emoji can use 4 bytes).
      const chunks: string[] = [], encoder = new TextEncoder(); let part = '', bytes = 0;
      for (const char of raw) {
        const size = encoder.encode(char).length;
        if (bytes + size > 1800) { chunks.push(part); part = ''; bytes = 0; }
        if (chunks.length >= maxChunks) throw fail();
        part += char; bytes += size;
      }
      if (part) chunks.push(part);
      if (chunks.length > maxChunks) throw fail();
      const next: Manifest = { version: 1, generation: randomUUID(), count: chunks.length };
      if (!isEventId(next.generation)) throw fail();
      try {
        for (let i = 0; i < chunks.length; i++) {
          if (!current()) throw fail();
          await storage.setItem(`${base}.${next.generation}.${i}`, chunks[i]!);
        }
        if (!current()) throw fail();
        await storage.setItem(base, JSON.stringify(next));
        // Logout can occur while the final native write is in flight.
        if (!current()) { await storage.removeItem(base); throw fail(); }
      } catch (error) {
        await discard(base, next).catch(() => {});
        throw error;
      }
    }),
    remove: accountId => serial(async () => {
      const base = key(accountId);
      let previous: Manifest | null = null;
      try { previous = manifest(await storage.getItem(base)); } catch { /* Invalidate even corrupt data. */ }
      await storage.removeItem(base);
      await discard(base, previous);
    }),
  };
}
