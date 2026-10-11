import { ApiError } from '../data/http';
import { isEventId } from '../data/events';

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
};
// Secrets never enter navigation state (which can become a URL), logs or storage.
// Reopening after a process restart relies on server/webhook fulfillment and My tickets.
const pending = new Map<string, PendingNativePayment>();
export function clearNativePayments() { pending.clear(); }
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
  const result = await request('/checkout/payment-sheet/' + (entry.cancelRequested ? 'cancel' : 'reconcile'), {
    method: 'POST', token: entry.owner,
    body: { orderId: session.orderId, eventId: entry.eventId, paymentIntentId: session.paymentIntentId, paymentIntentClientSecret: session.paymentIntentClientSecret },
  }) as { status?: unknown; orderId?: unknown } | null;
  if (!result || result.orderId !== session.orderId || typeof result.status !== 'string' ||
    !['pending', 'completed', 'failed', 'refunded'].includes(result.status)) throw new ApiError(0, 'INVALID_PAYMENT_CONFIRMATION');
  entry.status = result.status as NativePaymentStatus;
  return { status: entry.status, orderId: session.orderId };
}

export async function presentAndResolveNativePayment(entry: PendingNativePayment,
  present: () => Promise<'completed' | 'cancelled'>, request: PaymentRequest): Promise<'verify' | 'cancelled' | 'failed'> {
  let sdkFailed = false;
  try { entry.cancelRequested = await present() === 'cancelled'; }
  catch { entry.cancelRequested = true; sdkFailed = true; }
  if (entry.cancelRequested) {
    try {
      const result = await resolveNativePayment(entry, request);
      if (result.status === 'failed') return sdkFailed ? 'failed' : 'cancelled';
    } catch { /* A lost response cannot prove cancellation: keep verifying. */ }
  }
  return 'verify';
}
