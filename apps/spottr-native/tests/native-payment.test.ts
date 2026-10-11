import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyInvoiceDetails } from '../../pulse-app/src/features/checkout/invoiceDetails';
import { clearNativePayments, getNativePayment, getPendingNativePayment, isStripeReturnURL, parseNativePayment, presentAndResolveNativePayment, rememberNativePayment, resolveNativePayment, type NativePaymentSession } from '../src/checkout/nativePayment';
import { paymentSheetOptions } from '../src/checkout/paymentSheetOptions';
import { checkPaymentConfirmation } from '../../pulse-app/src/features/checkout/confirmation';

const orderId = '12345678-abcd-abcd-abcd-123456789012';
const eventId = '12345678-abcd-abcd-abcd-123456789013';
const session: NativePaymentSession = { mode: 'payment_sheet', orderId, paymentIntentId: 'pi_test123', paymentIntentClientSecret: 'pi_test123_secret_test456', stripeAccountId: 'acct_test123', publishableKey: 'pk_test_test123', expiresAt: '2099-01-01T00:00:00Z' };
const entry = () => rememberNativePayment(session, eventId, 'test-owner');

test('native payment parser rejects invalid, hosted and mismatched client-secret responses', () => {
  assert.deepEqual(parseNativePayment(session), session);
  for (const invalid of [null, undefined, {}, { ...session, mode: 'hosted' },
    { ...session, orderId: '' }, { ...session, paymentIntentClientSecret: 'pi_other_secret_test456' },
    { ...session, paymentIntentClientSecret: 'pi_test123_secret_' }, { ...session, stripeAccountId: null },
    { ...session, publishableKey: 'sk_test_test123' }, { ...session, expiresAt: 'invalid' }]) {
    assert.throws(() => parseNativePayment(invalid));
  }
});

test('native confirmation capability is scoped to the order, event and current session', () => {
  const pending = entry();
  assert.equal(getNativePayment(orderId, eventId, 'test-owner'), pending);
  assert.equal(getNativePayment(orderId, eventId, null), undefined);
  assert.equal(getNativePayment(orderId, eventId, 'new-owner'), undefined);
  assert.equal(getNativePayment(orderId, orderId, 'test-owner'), undefined);
});

test('leaving and reopening checkout resumes an unresolved payment even after its estimated expiry', async () => {
  clearNativePayments();
  const old = rememberNativePayment({ ...session, expiresAt: '2020-01-01T00:00:00Z' }, eventId, 'test-owner');
  // Buying a different event must not evict the first unresolved payment.
  rememberNativePayment({ ...session, orderId: eventId }, orderId, 'test-owner');
  assert.equal(getPendingNativePayment(eventId, 'test-owner'), old);
  assert.equal(getPendingNativePayment(eventId, 'other-owner'), undefined);
  await resolveNativePayment(old, async () => ({ orderId, status: 'completed' }));
  assert.equal(getPendingNativePayment(eventId, 'test-owner'), undefined);
});

test('logout discards payment capabilities and late confirmation does not publish success to another session', async () => {
  const pending = entry();
  let token: string | null = 'test-owner';
  let complete!: (value: unknown) => void;
  const response = new Promise<unknown>(resolve => { complete = resolve; });
  const confirmation = checkPaymentConfirmation(() => resolveNativePayment(pending, () => response), () => token === pending.owner);
  token = null;
  clearNativePayments();
  complete({ orderId, status: 'completed' });
  assert.equal(await confirmation, null);
  assert.equal(getNativePayment(orderId, eventId, 'test-owner'), undefined);
});

test('only exact Stripe callback destination is excluded from app routing', () => {
  assert.equal(isStripeReturnURL('spottr-native://stripe-redirect?result=complete'), true);
  for (const value of ['', 'https://stripe-redirect', 'spottr-native://stripe-redirect.evil',
    'spottr-native://evil@stripe-redirect', 'spottr-native://stripe-redirect/path', 'spottr-native://stripe-redirect:123']) {
    assert.equal(isStripeReturnURL(value), false);
  }
});

test('PaymentSheet success still requires authoritative server verification', async () => {
  const pending = entry();
  assert.equal(await presentAndResolveNativePayment(pending, async () => 'completed', async () => { throw Error('Not called on SDK success'); }), 'verify');
  assert.equal(pending.status, 'pending');
});

test('cancelled sheet releases retry only after server confirms cancellation', async () => {
  const pending = entry();
  const result = await presentAndResolveNativePayment(pending, async () => 'cancelled', async (path, options) => {
    assert.equal(path, '/checkout/payment-sheet/cancel');
    assert.deepEqual(options.body, { orderId, eventId, paymentIntentId: session.paymentIntentId, paymentIntentClientSecret: session.paymentIntentClientSecret });
    assert.equal(options.token, 'test-owner');
    return { orderId, status: 'failed' };
  });
  assert.equal(result, 'cancelled');
  assert.equal(pending.status, 'failed');
});

test('payment winning a cancellation race is verified, never treated as a new purchase', async () => {
  const pending = entry();
  assert.equal(await presentAndResolveNativePayment(pending, async () => 'cancelled', async () => ({ orderId, status: 'completed' })), 'verify');
  assert.equal(pending.status, 'completed');
});

test('lost cancellation response keeps the same order pending and retries cancellation', async () => {
  const pending = entry();
  assert.equal(await presentAndResolveNativePayment(pending, async () => 'cancelled', async () => { throw Error('offline'); }), 'verify');
  assert.equal(pending.status, 'pending');
  await resolveNativePayment(pending, async path => {
    assert.equal(path, '/checkout/payment-sheet/cancel'); return { orderId, status: 'failed' };
  });
  assert.equal(pending.status, 'failed');
});

test('SDK initialization failure safely cancels, and ambiguous cleanup cannot release retry', async () => {
  assert.equal(await presentAndResolveNativePayment(entry(), async () => { throw Error('SDK unavailable'); }, async () => ({ orderId, status: 'failed' })), 'failed');
  assert.equal(await presentAndResolveNativePayment(entry(), async () => { throw Error('SDK unavailable'); }, async () => { throw Error('Timeout'); }), 'verify');
});

test('malformed confirmations cannot mark this order paid', async () => {
  for (const response of [null, {}, { orderId, status: 'paid' }, { orderId: eventId, status: 'completed' }]) {
    const pending = entry();
    await assert.rejects(resolveNativePayment(pending, async () => response));
    assert.equal(pending.status, 'pending');
  }
});

test('card checkout works without wallet identities; Google test mode follows server mode', () => {
  const details = { ...emptyInvoiceDetails(), name: 'Buyer', country: 'Romania', city: 'Bucuresti' };
  const cards = paymentSheetOptions(session, 'test@example.test', details, { applePay: false, googlePay: false });
  assert.equal(cards.applePay, undefined); assert.equal(cards.googlePay, undefined);
  assert.equal(cards.defaultBillingDetails?.address?.country, 'RO');
  assert.equal(cards.allowsDelayedPaymentMethods, false);
  const wallets = paymentSheetOptions(session, 'test@example.test', details, { applePay: true, googlePay: true });
  assert.equal(wallets.googlePay?.testEnv, true);
  assert.equal(paymentSheetOptions({ ...session, publishableKey: 'pk_live_test123' }, '', details, { applePay: false, googlePay: true }).googlePay?.testEnv, false);
  assert.equal(paymentSheetOptions(session, '', { ...details, country: 'United States' }, { applePay: false, googlePay: false }).defaultBillingDetails?.address?.country, undefined);
});
