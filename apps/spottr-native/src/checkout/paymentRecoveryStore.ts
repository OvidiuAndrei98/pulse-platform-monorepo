import { isEventId } from '../data/events';
import { ApiError } from '../data/http';
import { parseNativePayment, type NativePaymentSession } from './nativePayment';

export type StoredNativePayment = {
  session: NativePaymentSession;
  eventId: string;
  accountId: string | null;
  cancelRequested: boolean;
};
export type PaymentRecoveryStorage = {
  load(accountId: string | null): Promise<StoredNativePayment[]>;
  save(payment: StoredNativePayment): Promise<void>;
  remove(accountId: string | null, orderId: string): Promise<void>;
};
type SecureKeyValue = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
const fail = () => new ApiError(0, 'PAYMENT_RECOVERY_STORAGE');
const hex = (value: string) => Array.from(value).map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('');

/** Native Keychain/Keystore only. Never bind this to AsyncStorage/localStorage.
 * Each capability has its own small item. An index is committed before Stripe
 * can be presented; serialized writes prevent simultaneous orders losing IDs.
 */
export function createPaymentRecoveryStore(storage: SecureKeyValue, apiOrigin: string): PaymentRecoveryStorage {
  const prefix = `spottr-native.payment.v1.${hex(apiOrigin)}`;
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const task = queue.catch(() => undefined).then(work).catch(() => { throw fail(); });
    queue = task;
    return task;
  }
  function key(accountId: string | null) {
    if (accountId !== null && !isEventId(accountId)) throw fail();
    return `${prefix}.${accountId ?? 'guest'}`;
  }
  async function ids(accountId: string | null): Promise<string[]> {
    const raw = await storage.getItem(key(accountId));
    if (raw === null) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 32 || value.some(id => !isEventId(id)) || new Set(value).size !== value.length) throw fail();
    return value;
  }
  function parse(value: unknown, accountId: string | null, orderId: string): StoredNativePayment {
    const row = value as Partial<StoredNativePayment> | null;
    if (!row || row.accountId !== accountId || !isEventId(row.eventId) || typeof row.cancelRequested !== 'boolean') throw fail();
    const parsed = parseNativePayment(row.session);
    if (parsed.orderId !== orderId) throw fail();
    // Explicit allowlist excludes bearer tokens, billing details and unknown API fields.
    const { mode, paymentIntentId, paymentIntentClientSecret, stripeAccountId, publishableKey, expiresAt } = parsed;
    return { accountId, eventId: row.eventId!, cancelRequested: row.cancelRequested,
      session: { mode, orderId, paymentIntentId, paymentIntentClientSecret, stripeAccountId, publishableKey, expiresAt } };
  }
  return {
    load: accountId => serial(async () => {
      const result: StoredNativePayment[] = [];
      for (const id of await ids(accountId)) {
        const raw = await storage.getItem(`${key(accountId)}.${id}`);
        // Corrupt/missing state is not evidence that a payment failed. Keep the
        // index and stop new purchases until recovery can be read again.
        if (raw === null) throw fail();
        result.push(parse(JSON.parse(raw), accountId, id));
      }
      return result;
    }),
    save: payment => serial(async () => {
      const row = parse(payment, payment.accountId, payment.session.orderId);
      const index = await ids(row.accountId);
      if (!index.includes(row.session.orderId)) index.push(row.session.orderId);
      if (index.length > 32) throw fail();
      const encoded = JSON.stringify(row);
      if (encoded.length > 1800) throw fail();
      await storage.setItem(`${key(row.accountId)}.${row.session.orderId}`, encoded);
      await storage.setItem(key(row.accountId), JSON.stringify(index));
    }),
    remove: (accountId, orderId) => serial(async () => {
      if (!isEventId(orderId)) throw fail();
      const index = await ids(accountId);
      // Removing the index first makes an interrupted cleanup harmless.
      await storage.setItem(key(accountId), JSON.stringify(index.filter(id => id !== orderId)));
      await storage.removeItem(`${key(accountId)}.${orderId}`);
    }),
  };
}
