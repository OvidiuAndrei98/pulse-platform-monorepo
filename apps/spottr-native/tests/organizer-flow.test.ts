import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeOrganizerReturn, parseOrganizerReturn } from '../../pulse-app/src/features/checkout/organizerReturn';
import { createOrganizerFlow, parseConnectStatus, parsePromotionStatus, parsePromotionReconciliation, validateOrganizerCallback, validateOrganizerURL, type OrganizerFlowState } from '../src/dashboard/organizerFlow';
const id = '00000000-0000-4000-8000-000000000001';
const expected = { flow: 'promotion' as const, campaignId: id };
const checkout = { url: 'https://checkout.stripe.com/c/pay/cs_test_owned', expected };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

test('organizer return bridge requires valid flow, status, campaign and fixed scheme/path', () => {
  assert.equal(nativeOrganizerReturn(new URLSearchParams(`flow=promotion&status=complete&campaignId=${id}`)), `spottr-native://organizer/return?flow=promotion&status=complete&campaignId=${id}`);
  assert.deepEqual(parseOrganizerReturn(new URLSearchParams('flow=connect&status=refresh')), { flow: 'connect', status: 'refresh' });
  for (const query of ['flow=promotion&status=complete', `flow=connect&status=cancelled`, `flow=promotion&status=paid&campaignId=${id}`, 'flow=promotion&status=complete&campaignId=javascript:evil']) assert.equal(parseOrganizerReturn(new URLSearchParams(query)), null);
  const value = nativeOrganizerReturn(new URLSearchParams(`flow=promotion&status=complete&campaignId=${id}`))!;
  assert.deepEqual(validateOrganizerCallback(value, expected), { ...expected, status: 'complete' });
  for (const bad of [value.replace('spottr-native:', 'https:'), value.replace('/return', '/other'), value.replace(id, id.slice(0, -1) + '2')]) assert.throws(() => validateOrganizerCallback(bad, expected));
  for (const bad of ['https://evil.test', 'https://checkout.stripe.com.evil.test', 'https://user:pass@checkout.stripe.com', 'http://checkout.stripe.com', 'https://connect.stripe.com']) assert.throws(() => validateOrganizerURL(bad, 'promotion'));
});

test('native organizer flow never marks a campaign paid based on the browser callback', async () => {
  const states: OrganizerFlowState[] = [], browser = deferred<void>();
  let calls = 0;
  const flow = createOrganizerFlow({ session: () => 'token', prepare: () => ({ open: () => browser.promise, dispose() {} }), publish: state => states.push(state) });
  const operation = flow.start(async () => checkout, async () => { calls++; return 'pending_payment'; });
  await Promise.resolve(); assert.equal(calls, 0); assert.equal(states.at(-1)?.busy, true);
  browser.resolve(); await operation;
  assert.equal(calls, 1); assert.equal(states.at(-1)?.status, 'pending_payment');
  await flow.refresh(expected, async () => 'scheduled');
  assert.equal(states.at(-1)?.status, 'scheduled');
});

test('duplicate pay taps reserve one popup and issue one checkout request', async () => {
  let creates = 0, popups = 0;
  const pending = deferred<typeof checkout>();
  const flow = createOrganizerFlow({ session: () => 'token', prepare: () => { popups++; return { open: async () => {}, dispose() {} }; }, publish() {} });
  const first = flow.start(() => { creates++; return pending.promise; }, async () => 'active');
  await flow.start(() => { creates++; return pending.promise; }, async () => 'active');
  assert.equal(creates, 1); assert.equal(popups, 1);
  pending.resolve(checkout); await first;
});

test('popup blocking aborts before creating a purchase; failures retain explicit status retry', async () => {
  const states: OrganizerFlowState[] = []; let created = false;
  const blocked = createOrganizerFlow({ session: () => 'token', prepare: () => { throw new Error('blocked'); }, publish: value => states.push(value) });
  await blocked.start(async () => { created = true; return checkout; }, async () => 'active');
  assert.equal(created, false); assert.equal(states.at(-1)?.error, true);
  const flow = createOrganizerFlow({ session: () => 'token', prepare: () => ({ open: async () => {}, dispose() {} }), publish: value => states.push(value) });
  await flow.start(async () => checkout, async () => { throw new Error('offline'); });
  assert.equal(states.at(-1)?.error, true); assert.deepEqual(states.at(-1)?.expected, expected);
  await flow.refresh(expected, async () => 'active');
  assert.equal(states.at(-1)?.status, 'active');
});

test('logout or unmount during checkout cannot open Stripe or update another session', async () => {
  let token: string | null = 'first', opens = 0, disposed = 0, reconciled = 0;
  const states: OrganizerFlowState[] = [], pending = deferred<typeof checkout>();
  const flow = createOrganizerFlow({ session: () => token, prepare: () => ({ open: async () => { opens++; }, dispose() { disposed++; } }), publish: value => states.push(value) });
  const operation = flow.start(() => pending.promise, async () => { reconciled++; return 'active'; });
  token = 'second'; flow.cancel(); pending.resolve(checkout); await operation;
  assert.equal(opens, 0); assert.equal(reconciled, 0); assert.equal(disposed, 1); assert.deepEqual(states.at(-1), { busy: false, error: false });
});

test('closing the organizer screen while Stripe is open cancels the browser and ignores its late return', async () => {
  const browser = deferred<void>(), states: OrganizerFlowState[] = [];
  let disposed = 0, reconciled = 0;
  const flow = createOrganizerFlow({ session: () => 'token', prepare: () => ({ open: () => browser.promise, dispose() { disposed++; browser.resolve(); } }), publish: value => states.push(value) });
  const operation = flow.start(async () => checkout, async () => { reconciled++; return 'active'; });
  await Promise.resolve(); assert.deepEqual(states.at(-1)?.expected, expected);
  flow.cancel(); await operation;
  assert.equal(disposed, 1); assert.equal(reconciled, 0); assert.equal(states.at(-1)?.status, undefined);
});

test('reconciliation rejects malformed statuses, wrong campaign and incomplete Connect capability', () => {
  assert.equal(parsePromotionStatus({ campaignId: id, status: 'scheduled' }, id), 'scheduled');
  for (const value of [null, {}, { campaignId: 'wrong', status: 'active' }, { campaignId: id, status: 'paid' }]) assert.throws(() => parsePromotionStatus(value, id));
  assert.equal(parseConnectStatus({ stripeChargesEnabled: true, stripePayoutsEnabled: false }), 'incomplete');
  assert.equal(parseConnectStatus({ stripeChargesEnabled: true, stripePayoutsEnabled: true }), 'connected');
  for (const value of [null, {}, { stripeChargesEnabled: 'true', stripePayoutsEnabled: true }]) assert.throws(() => parseConnectStatus(value));
});

test('an abandoned promotion can resume its existing Stripe session without another purchase', async () => {
  const response = parsePromotionReconciliation({ campaignId: id, status: 'pending_payment', checkoutUrl: checkout.url }, id);
  assert.deepEqual(response, { status: 'pending_payment', checkoutUrl: checkout.url });
  for (const checkoutUrl of ['https://evil.test', 123, null]) assert.throws(() => parsePromotionReconciliation({ campaignId: id, status: 'pending_payment', checkoutUrl }, id));
  assert.throws(() => parsePromotionReconciliation({ campaignId: id, status: 'active', checkoutUrl: checkout.url }, id));
  const states: OrganizerFlowState[] = []; let opened = '';
  const flow = createOrganizerFlow({ session: () => 'token', prepare: () => ({ open: async url => { opened = url; }, dispose() {} }), publish: value => states.push(value) });
  await flow.refresh(expected, async () => response);
  const saved = states.at(-1)!;
  await flow.start(async () => ({ url: saved.checkoutUrl!, expected: saved.expected! }), async () => 'scheduled');
  assert.equal(opened, checkout.url); assert.equal(states.at(-1)?.status, 'scheduled');
});
