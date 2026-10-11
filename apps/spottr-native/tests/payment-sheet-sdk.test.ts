import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { PaymentSheetFailure } from '../src/checkout/paymentSheetFailure';
import { presentAndResolveNativePayment, rememberNativePayment, clearNativePayments, type NativePaymentSession } from '../src/checkout/nativePayment';

const session: NativePaymentSession = { mode: 'payment_sheet', orderId: '12345678-abcd-abcd-abcd-123456789012', paymentIntentId: 'pi_test', paymentIntentClientSecret: 'pi_test_secret_private', publishableKey: 'pk_test_private', stripeAccountId: 'acct_private', expiresAt: '2099-01-01T00:00:00Z' };
function fixture(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [], logs: unknown[] = [];
  let removed = 0;
  const sdk = {
    initStripe: async (params: any) => { calls.push('configure'); assert.equal(params.stripeAccountId, session.stripeAccountId); assert.equal(params.publishableKey, session.publishableKey); },
    initPaymentSheet: async () => { calls.push('initialize'); return {}; },
    presentPaymentSheet: async () => { calls.push('present'); return {}; },
    ...overrides,
  };
  const deps: any = {
    'react-native': { Linking: { addEventListener: () => ({ remove: () => { removed++; } }) } },
    'expo-constants': { expoConfig: { extra: {} } },
    '@stripe/stripe-react-native': sdk,
    './nativePayment': { isStripeReturnURL: () => false },
    './paymentSheetOptions': { paymentSheetOptions: () => ({}) },
    './paymentSheetFailure': { PaymentSheetFailure },
  };
  const exports: any = {};
  const js = ts.transpileModule(readFileSync(resolve(__dirname, '../src/checkout/paymentSheet.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  runInNewContext(js, { exports, require: (id: string) => deps[id], console: { warn: (...args: unknown[]) => logs.push(args) } });
  return { open: () => exports.openNativePaymentSheet(session, '', {}), calls, logs, removed: () => removed };
}
test('native Stripe configures Connect before initializing and presenting once', async () => {
  const f = fixture(); assert.equal(await f.open(), 'completed');
  assert.deepEqual(f.calls, ['configure', 'initialize', 'present']);
  assert.equal(f.removed(), 1);
});
test('an inaccessible native intent reports a configuration error, releases presenter and redacts secrets', async () => {
  const f = fixture({ presentPaymentSheet: async () => ({ error: { code: 'Failed', stripeErrorCode: 'resource_missing', message: 'No such payment_intent pi_test_secret_private pk_test_private buyer@example.test' } }) });
  for (let attempt = 0; attempt < 2; attempt++) await assert.rejects(f.open(), (error: any) => {
    assert.equal(error.reference, 'stripe-present-configuration');
    assert.equal(error.messageKey, 'checkout.paymentNativeConfiguration');
    assert.doesNotMatch(JSON.stringify(error), /private|buyer@/); return true;
  });
  assert.deepEqual(f.calls, ['configure', 'initialize', 'configure', 'initialize']);
  assert.equal(f.removed(), 2);
  assert.doesNotMatch(JSON.stringify(f.logs), /private|buyer@/);
});
test('SDK failure details survive reservation cleanup; uncertainty still goes to server verification', async () => {
  clearNativePayments();
  const entry = rememberNativePayment(session, 'event', 'owner');
  const failure = new PaymentSheetFailure('present', { message: 'Network connection lost' });
  let observed: unknown;
  const outcome = await presentAndResolveNativePayment(entry, async () => { throw failure; }, async () => ({ orderId: session.orderId, status: 'failed' }), error => { observed = error; });
  assert.equal(outcome, 'failed'); assert.equal(observed, failure);
  assert.equal(failure.messageKey, 'checkout.paymentNetworkError');
});
test('native Stripe cancellation remains cancellation', async () => {
  assert.equal(await fixture({ presentPaymentSheet: async () => ({ error: { code: 'Canceled' } }) }).open(), 'cancelled');
});
