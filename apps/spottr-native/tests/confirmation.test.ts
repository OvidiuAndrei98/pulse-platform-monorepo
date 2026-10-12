import assert from 'node:assert/strict';
import test from 'node:test';
import { canRecheckPayment, canRestartCheckout, confirmPayment } from '../src/checkout/confirmation';
import { ApiError } from '../src/data/http';

const orderId = '11111111-1111-4111-8111-111111111111';
const active = () => true, pause = async () => {};

test('only an authoritative completed response confirms payment; refunds stay distinct', async () => {
  for (const status of ['completed', 'failed', 'refunded', 'pending'] as const) {
    assert.deepEqual(await confirmPayment(async () => ({ status, orderId }), active, pause), { status, orderId });
  }
});

test('network errors and malformed responses never become failure or success', async () => {
  for (const value of [undefined, null, {}, [], { status: 'paid' }, { status: true }, { status: ['completed'] }, { status: 'unknown' }]) {
    assert.equal((await confirmPayment(async () => value, active, pause))?.status, 'unavailable');
  }
  for (const error of [new Error('offline'), new ApiError(429, 'LIMIT'), new ApiError(503, 'UNAVAILABLE')]) {
    assert.equal((await confirmPayment(async () => { throw error; }, active, pause))?.status, 'unavailable');
  }
});

test('missing payment stops polling, exposes no invented order and does not authorize a new charge', async () => {
  let requests = 0;
  const result = await confirmPayment(async () => { requests++; throw new ApiError(404, 'NOT_FOUND'); }, active, pause);
  assert.deepEqual(result, { status: 'missing', orderId: undefined }); assert.equal(requests, 1);
  assert.equal(canRestartCheckout(result!.status), false);
});

test('initial polling is bounded; manual and foreground checks issue a single request', async () => {
  let requests = 0;
  await confirmPayment(async () => { requests++; return { status: 'pending' }; }, active, pause);
  assert.equal(requests, 4);
  await confirmPayment(async () => { requests++; return { status: 'pending' }; }, active, pause, 1);
  assert.equal(requests, 5);
  assert.equal(canRecheckPayment('pending', false), true);
  assert.equal(canRecheckPayment('pending', true), false);
  assert.equal(canRecheckPayment('unavailable', true), false);
  for (const status of ['checking', 'completed', 'failed', 'refunded', 'missing', 'invalid', 'cancelled']) assert.equal(canRecheckPayment(status, false), false);
});

test('delayed completion succeeds; leaving or switching account ignores old responses', async () => {
  let requests = 0;
  assert.equal((await confirmPayment(async () => ({ status: ++requests === 2 ? 'completed' : 'pending' }), active, pause))?.status, 'completed');
  let current = true;
  assert.equal(await confirmPayment(async () => { current = false; return { status: 'completed' }; }, () => current, pause), null);
  for (const status of ['pending', 'unavailable', 'missing', 'invalid', 'checking']) assert.equal(canRestartCheckout(status), false);
  for (const status of ['failed', 'cancelled', 'refunded']) assert.equal(canRestartCheckout(status), true);
});
