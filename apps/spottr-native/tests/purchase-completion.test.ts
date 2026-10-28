import assert from 'node:assert/strict';
import test from 'node:test';
import { createPurchaseCompletionStore, ticketsForPurchase } from '../src/checkout/purchaseCompletion';
import type { UserTicket } from '../src/data/tickets';

const eventId = '11111111-1111-4111-8111-111111111111', orderId = '22222222-2222-4222-8222-222222222222';

test('only an authoritative completed purchase can hand off a confirmation, never a URL outcome or pending payment', () => {
  const store = createPurchaseCompletionStore();
  for (const status of ['pending', 'failed', 'refunded', 'unavailable', 'succeeded', 'cancelled', '']) {
    assert.equal(store.confirm({ status, orderId }, eventId, 'token-A'), null);
    assert.equal(store.getSnapshot(), null);
  }
  assert.equal(store.confirm({ status: 'completed', orderId }, 'invalid', 'token-A'), null);
  let changes = 0; const unsubscribe = store.subscribe(() => changes++);
  const receipt = store.confirm({ status: 'completed', orderId }, eventId, 'token-A');
  assert.deepEqual(receipt, { eventId, orderId, owner: 'token-A' });
  assert.equal(store.confirm({ status: 'completed', orderId }, eventId, 'token-A'), receipt, 'Duplicate server callback keeps one sheet');
  assert.equal(changes, 1);
  const next = store.confirm({ status: 'completed', orderId }, eventId, 'token-B');
  store.dismiss(receipt!); assert.equal(store.getSnapshot(), next, 'An old dismissal cannot clear another account confirmation');
  store.clear(); assert.equal(store.getSnapshot(), null, 'Logout removes even a guest confirmation');
  unsubscribe();
});

test('View ticket uses the exact order and event, including a group, never an older or legacy unassociated QR', () => {
  const receipt = { eventId, orderId, owner: 'token-A' };
  const tickets = [
    { id: 'old', eventId, orderId: eventId },
    { id: 'new-1', eventId, orderId },
    { id: 'legacy', eventId },
    { id: 'other-event', eventId: orderId, orderId },
    { id: 'new-2', eventId, orderId },
  ] as UserTicket[];
  assert.deepEqual(ticketsForPurchase(tickets, receipt).map(row => row.id), ['new-1', 'new-2']);
  assert.deepEqual(ticketsForPurchase(tickets, { ...receipt, orderId: undefined }), []);
  assert.deepEqual(ticketsForPurchase([], receipt), []);
});
