import test from 'node:test';
import assert from 'node:assert/strict';
import { bindHandledReporting, captureHandledFailure, handledFailure, observeOperation, requestOperation } from '../src/diagnostics/handled';
import { createHttp, ApiError } from '../src/data/http';
import { createScannerApi } from '../src/scanner/data';
import { createOfflineScanner } from '../src/scanner/offline';
import { PaymentSheetFailure } from '../src/checkout/paymentSheetFailure';
import { confirmPayment } from '../src/checkout/confirmation';
import { verifyTicketDelivery } from '../src/checkout/ticketDelivery';
import type { HandledFailure } from '../../pulse-app/src/features/diagnostics/report';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function reports(t: { after(fn: () => void): void }) {
  const rows: HandledFailure[] = [];
  bindHandledReporting((_error, detail) => rows.push(detail));
  t.after(() => bindHandledReporting(undefined));
  return rows;
}
test('only actionable failures are collected; normal validation, permissions and offline outcomes are ignored', () => {
  for (const error of [new ApiError(400, 'INVALID_EMAIL'), new ApiError(401, 'SESSION_EXPIRED'), new ApiError(403, 'FORBIDDEN'),
    new ApiError(404, 'NOT_FOUND'), new ApiError(409, 'SOLD_OUT'), new ApiError(425, 'PROCESSING'), new ApiError(429, 'RATE_LIMIT'),
    new ApiError(0, 'TIMEOUT'), new TypeError('Failed to fetch'), new Error('INVALID_TICKET_CODE'), new Error('OFFLINE_SCANS_PENDING'),
    new DOMException('Cancelled', 'AbortError'), new Error('PAYMENT_SESSION_CHANGED')])
    assert.equal(handledFailure(error, 'payment_prepare'), undefined);
  assert.deepEqual(handledFailure(new ApiError(503, 'private body'), 'payment_prepare'), { operation: 'payment_prepare', failure: 'server_error', httpStatus: 503 });
  assert.deepEqual(handledFailure(new ApiError(0, 'INVALID_PAYMENT_RESPONSE'), 'payment_prepare'), { operation: 'payment_prepare', failure: 'invalid_response' });
});
test('HTTP failures keep their exact outcome and are reported once across nested catch layers', async t => {
  const rows = reports(t);
  const api = createHttp('https://mock/api/v1', async () => new Response(JSON.stringify({ error: 'private billing data' }), { status: 503 }));
  let original: unknown;
  await assert.rejects(observeOperation('payment_prepare', () => api('/events/' + id(1) + '/tickets/purchase?email=private@example.test', { method: 'POST', body: { secret: 'never report' } })), error => {
    original = error; return error instanceof ApiError && error.status === 503;
  });
  captureHandledFailure(original, 'payment_prepare');
  assert.deepEqual(rows, [{ operation: 'payment_prepare', failure: 'server_error', httpStatus: 503 }]);
  for (const path of ['/diagnostics/errors', '/admin/client-errors?platform=ios']) await assert.rejects(api(path));
  assert.equal(rows.length, 1, 'reporting cannot recursively report itself');
  assert.equal(requestOperation('/checkout/payment-sheet/reconcile?secret=private'), 'payment_confirm');
  assert.equal(requestOperation('/users/me/tickets'), 'tickets_load');
  assert.equal(JSON.stringify(rows).includes('private'), false);
});
test('malformed successful JSON is reported, but aborted requests and 4xx are not', async t => {
  const rows = reports(t);
  const malformed = createHttp('https://mock', async () => new Response('<html>'));
  await assert.rejects(malformed('/users/me/tickets'));
  assert.deepEqual(rows, [{ operation: 'tickets_load', failure: 'invalid_response' }]);
  const forbidden = createHttp('https://mock', async () => new Response('{}', { status: 403 }));
  await assert.rejects(forbidden('/users/me/tickets'));
  const controller = new AbortController(); controller.abort();
  const late = createHttp('https://mock', async () => new Response('{}', { status: 500 }));
  await assert.rejects(late('/users/me/tickets', { signal: controller.signal }));
  assert.equal(rows.length, 1);
});
test('Stripe cancellations, card refusals and connection failures are excluded; configuration failures survive safely', () => {
  for (const error of [{ code: 'Canceled' }, { stripeErrorCode: 'card_declined' }, { type: 'card_error' }, { message: 'Your card was declined' }, { declineCode: 'insufficient_funds' }, { message: 'Network connection lost' }])
    assert.equal(handledFailure(new PaymentSheetFailure('present', error), 'payment_present'), undefined);
  const failure = new PaymentSheetFailure('initialize', { message: 'No such payment_intent pi_private_secret_private' });
  assert.deepEqual(handledFailure(failure, 'payment_present'), { operation: 'payment_present', failure: 'configuration' });
  assert.equal(JSON.stringify(failure).includes('pi_private'), false);
});
test('scanner parsing failures are captured without reporting rejected or already-used QR codes', async t => {
  const rows = reports(t);
  const api = createScannerApi(createHttp('https://mock', async () => new Response('{}')));
  await assert.rejects(api.validate(id(1), 'a'.repeat(64), 'token'));
  assert.deepEqual(rows, [{ operation: 'scanner_validate', failure: 'invalid_response' }]);
  await assert.rejects(api.validate(id(1), 'invalid QR', 'token'));
  assert.equal(rows.length, 1);
});
test('offline disk failure stays a failed admission and reports no QR or account data', async t => {
  const rows = reports(t), diskError = new Error('private disk path and QR');
  const scanner = createOfflineScanner({ getItem: async () => { throw diskError; }, setItem: async () => {}, getAllKeys: async () => [] }, () => id(2));
  await assert.rejects(scanner.scan(id(1), id(2), 'a'.repeat(64)), error => error === diskError);
  assert.deepEqual(rows, [{ operation: 'scanner_storage', failure: 'storage_error' }]);
});
test('confirmation reports malformed results but keeps pending, failed and missing orders quiet', async t => {
  const rows = reports(t);
  for (const status of ['pending', 'failed', 'refunded']) await confirmPayment(async () => ({ status }), () => true, async () => {}, 1);
  await confirmPayment(async () => { throw new ApiError(404, 'NOT_FOUND'); }, () => true, async () => {}, 1);
  assert.equal(rows.length, 0);
  await confirmPayment(async () => ({}), () => true, async () => {}, 1);
  assert.deepEqual(rows, [{ operation: 'payment_confirm', failure: 'invalid_response' }]);
});
test('missing ticket alert requires a fresh completed nonrefunded order, a signed-in owner and current session', async t => {
  const rows = reports(t), receipt = { eventId: id(1), orderId: id(2), owner: 'private-token' };
  const order = { id: id(2), eventId: id(1), status: 'completed', refundedAmountBani: 0, stripeRefundStatus: 'none' };
  for (const patch of [{ status: 'pending' }, { status: 'failed' }, { status: 'refunded' }, { refundedAmountBani: 100 }, { stripeRefundStatus: 'pending' }, { id: id(3) }])
    await verifyTicketDelivery(receipt, [], async () => [{ ...order, ...patch }], () => true);
  await verifyTicketDelivery({ ...receipt, owner: null }, [], async () => [order], () => true);
  let active = true;
  await verifyTicketDelivery(receipt, [], async () => { active = false; return [order]; }, () => active);
  assert.equal(rows.length, 0);
  await verifyTicketDelivery(receipt, [], async () => [order], () => true);
  assert.deepEqual(rows, [{ operation: 'payment_ticket_delivery', failure: 'fulfillment_missing' }]);
});
test('reporter failures cannot mask application errors', async t => {
  bindHandledReporting(() => { throw Error('reporter broke'); }); t.after(() => bindHandledReporting(undefined));
  const error = new ApiError(500, 'original');
  await assert.rejects(observeOperation('tickets_load', async () => { throw error; }), cause => cause === error);
  const malformed = { get name() { throw Error('unsafe getter'); } };
  await assert.rejects(observeOperation('tickets_load', async () => { throw malformed; }), cause => cause === malformed);
});
