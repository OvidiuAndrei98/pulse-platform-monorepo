import { ApiError } from '../data/http';
import { isEventId } from '../data/events';
import type { PaymentRecoveryStorage } from './paymentRecoveryStore';

export const STRIPE_RETURN_URL = 'spottr-native://stripe-redirect';
export function isStripeReturnURL(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'spottr-native:' && url.hostname === 'stripe-redirect' &&
      !url.username && !url.password && !url.port && (url.pathname === '' || url.pathname === '/');
  } catch { return false; }
}

export type NativePaymentSession = {
  mode: 'payment_sheet'; orderId: string; paymentIntentId: string;
  paymentIntentClientSecret: string; stripeAccountId: string; publishableKey: string; expiresAt: string;
};
export type NativePaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export function parseNativePayment(value: unknown): NativePaymentSession {
  const row = value as Partial<NativePaymentSession> | null;
  if (!row || row.mode !== 'payment_sheet' || !isEventId(row.orderId) ||
    typeof row.paymentIntentId !== 'string' || !/^pi_[a-zA-Z0-9]+$/.test(row.paymentIntentId) ||
    typeof row.paymentIntentClientSecret !== 'string' || !row.paymentIntentClientSecret.startsWith(row.paymentIntentId + '_secret_') ||
    !/^pi_[a-zA-Z0-9]+_secret_[a-zA-Z0-9]+$/.test(row.paymentIntentClientSecret) ||
    typeof row.stripeAccountId !== 'string' || !/^acct_[a-zA-Z0-9]+$/.test(row.stripeAccountId) ||
    typeof row.publishableKey !== 'string' || !/^pk_(test|live)_[a-zA-Z0-9]+$/.test(row.publishableKey) ||
    typeof row.expiresAt !== 'string' || !Number.isFinite(Date.parse(row.expiresAt))) {
    throw new ApiError(0, 'INVALID_PAYMENT_RESPONSE');
  }
  return row as NativePaymentSession;
}

export type PendingNativePayment = {
  session: NativePaymentSession; eventId: string; owner: string | null;
  cancelRequested: boolean; status: NativePaymentStatus;
  accountId?: string | null;
  restored?: boolean;
};
// Capabilities never enter navigation URLs, logs or ordinary storage. Native
// recovery uses Keychain/Keystore; bearer tokens themselves are not duplicated.
const pending = new Map<string, PendingNativePayment>();
let recoveryStorage: PaymentRecoveryStorage | undefined;
let recoveryIdentity: { accountId: string | null; owner: string | null } | undefined;
let recoveryGeneration = 0;
let hydration: Promise<PendingNativePayment[]> | undefined;
export function configureNativePaymentRecovery(storage: PaymentRecoveryStorage) { recoveryStorage = storage; }
export function clearNativePayments() {
  pending.clear(); recoveryIdentity = undefined; hydration = undefined; recoveryGeneration++;
}
export function restoreNativePayments(accountId: string | null, owner: string | null): Promise<PendingNativePayment[]> {
  if (!recoveryStorage) return Promise.resolve([]);
  if ((accountId === null) !== (owner === null) || (accountId !== null && !isEventId(accountId))) return Promise.reject(new ApiError(0, 'PAYMENT_SESSION_CHANGED'));
  if (recoveryIdentity?.accountId !== accountId || recoveryIdentity.owner !== owner) {
    clearNativePayments();
    recoveryIdentity = { accountId, owner };
  }
  if (hydration) return hydration;
  const generation = recoveryGeneration;
  const task = recoveryStorage.load(accountId).then(rows => {
    if (generation !== recoveryGeneration) return [];
    for (const row of rows) {
      if (pending.has(row.session.orderId)) continue;
      // Persisted status/expiry is never proof of payment or failure. Always
      // reconcile with the existing server endpoint, even after expiration.
      const entry = rememberNativePayment(row.session, row.eventId, owner);
      entry.accountId = accountId; entry.cancelRequested = row.cancelRequested; entry.restored = true;
    }
    return Array.from(pending.values()).filter(entry => entry.owner === owner && entry.restored);
  });
  hydration = task;
  void task.catch(() => { if (hydration === task) hydration = undefined; });
  return task;
}
export async function persistNativePayment(entry: PendingNativePayment, accountId: string | null) {
  if (!recoveryStorage) throw new ApiError(0, 'PAYMENT_RECOVERY_STORAGE');
  if (pending.get(entry.session.orderId) !== entry || recoveryIdentity?.accountId !== accountId || recoveryIdentity.owner !== entry.owner) throw new ApiError(0, 'PAYMENT_SESSION_CHANGED');
  entry.accountId = accountId;
  await recoveryStorage.save({ session: entry.session, eventId: entry.eventId, accountId, cancelRequested: entry.cancelRequested });
  if (pending.get(entry.session.orderId) !== entry) throw new ApiError(0, 'PAYMENT_SESSION_CHANGED');
}
export async function acknowledgeNativePayment(entry: PendingNativePayment) {
  if (entry.status === 'pending') return;
  entry.restored = false;
  if (recoveryStorage && entry.accountId !== undefined) await recoveryStorage.remove(entry.accountId, entry.session.orderId);
}
export function rememberNativePayment(session: NativePaymentSession, eventId: string, owner: string | null) {
  for (const [id, entry] of pending) {
    // A timestamp cannot prove a Stripe payment failed. Keep unresolved orders
    // across screen remounts until the server confirms a terminal outcome.
    if (entry.owner !== owner || (entry.status !== 'pending' && Date.parse(entry.session.expiresAt) < Date.now() - 60 * 60 * 1000)) pending.delete(id);
  }
  const entry: PendingNativePayment = { session, eventId, owner, cancelRequested: false, status: 'pending' };
  pending.set(session.orderId, entry);
  return entry;
}
export function getNativePayment(orderId: string, eventId: string, owner: string | null) {
  const entry = pending.get(orderId);
  return entry?.eventId === eventId && entry.owner === owner ? entry : undefined;
}
export function getPendingNativePayment(eventId: string, owner: string | null) {
  return Array.from(pending.values()).find(entry => entry.eventId === eventId && entry.owner === owner && entry.status === 'pending');
}

type PaymentRequest = (path: string, options: { method: 'POST'; body: unknown; token: string | null }) => Promise<unknown>;
export async function resolveNativePayment(entry: PendingNativePayment, request: PaymentRequest) {
  const { session } = entry;
  if (entry.cancelRequested && recoveryStorage && entry.accountId !== undefined) {
    // Remember cancellation across another interruption. A disk error must not
    // prevent trying to cancel on the server; an ambiguous result stays pending.
    await recoveryStorage.save({ session, eventId: entry.eventId, accountId: entry.accountId, cancelRequested: true }).catch(() => undefined);
  }
  const result = await request('/checkout/payment-sheet/' + (entry.cancelRequested ? 'cancel' : 'reconcile'), {
    method: 'POST', token: entry.owner,
    body: { orderId: session.orderId, eventId: entry.eventId, paymentIntentId: session.paymentIntentId, paymentIntentClientSecret: session.paymentIntentClientSecret },
  }) as { status?: unknown; orderId?: unknown } | null;
  if (!result || result.orderId !== session.orderId || typeof result.status !== 'string' ||
    !['pending', 'completed', 'failed', 'refunded'].includes(result.status)) throw new ApiError(0, 'INVALID_PAYMENT_CONFIRMATION');
  // Overlapping foreground checks may return out of order. A stale pending
  // response cannot undo a terminal outcome already verified by the server.
  if (entry.status === 'pending' || result.status === 'refunded') entry.status = result.status as NativePaymentStatus;
  return { status: entry.status, orderId: session.orderId };
}

export async function presentAndResolveNativePayment(entry: PendingNativePayment,
  present: () => Promise<'completed' | 'cancelled'>, request: PaymentRequest, onFailure?: (error: unknown) => void): Promise<'verify' | 'cancelled' | 'failed'> {
  let sdkFailed = false;
  try { entry.cancelRequested = await present() === 'cancelled'; }
  catch (error) { entry.cancelRequested = true; sdkFailed = true; onFailure?.(error); }
  if (entry.cancelRequested) {
    try {
      const result = await resolveNativePayment(entry, request);
      if (result.status === 'failed') return sdkFailed ? 'failed' : 'cancelled';
    } catch { /* A lost response cannot prove cancellation: keep verifying. */ }
  }
  return 'verify';
}
