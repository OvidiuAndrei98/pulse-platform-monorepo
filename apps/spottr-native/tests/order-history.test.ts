import assert from 'node:assert/strict';
import test from 'node:test';
import { invoiceStatusKey, isConfirmedPurchase, isInvoiceOrder, isVisibleTransaction, orderStatusKey, orderTotalBani } from '../../pulse-app/src/features/checkout/orderHistory';

test('transactions hide unopened/unsubmitted reservations but retain actual payment attempts', () => {
  for (const status of ['pending', 'failed', 'unknown']) {
    assert.equal(isVisibleTransaction({ status }), false);
    assert.equal(isVisibleTransaction({ status, paymentAttemptedAt: '' }), false);
    assert.equal(isVisibleTransaction({ status, paymentAttemptedAt: 'invalid' }), false);
    assert.equal(isVisibleTransaction({ status, paymentAttemptedAt: '2026-10-14T19:00:00Z' }), true);
    assert.equal(isInvoiceOrder({ status, invoiceRequested: true }), false);
  }
  assert.equal(isVisibleTransaction({ status: 'completed' }), true);
  assert.equal(isVisibleTransaction({ status: 'refunded' }), true);
});

test('invoice requests and quoted amounts never make an unfinished checkout a purchase', () => {
  for (const status of ['pending', 'failed', 'canceled', '', 'requires_payment_method', 'processing', 'unknown']) {
    const order = { status, invoiceRequested: true, paidTotalBani: 21800, invoiceStatus: 'pending', stripePaymentIntentId: 'pi_unpaid' };
    assert.equal(isConfirmedPurchase(order), false, status);
    assert.equal(isInvoiceOrder(order), false, status);
    assert.notEqual(orderStatusKey(status), 'orders.completed');
  }
});

test('paid, free and refunded confirmed purchases retain requested invoices', () => {
  for (const status of ['completed', 'refunded']) {
    assert.equal(isInvoiceOrder({ status, invoiceRequested: true }), true);
    assert.equal(isInvoiceOrder({ status, invoiceRequested: false }), false);
    assert.equal(orderTotalBani({ orderTotalBani: 0, paidTotalBani: 99 }), 0);
  }
});

test('quote amounts survive rolling API upgrades without implying a completed purchase', () => {
  assert.equal(orderTotalBani({ paidTotalBani: 5450 }), 5450);
  assert.equal(orderTotalBani({ orderTotalBani: 5450, paidTotalBani: 9999 }), 5450);
  assert.equal(orderStatusKey('pending'), 'orders.unconfirmed');
  assert.equal(orderStatusKey('failed'), 'orders.failed');
  assert.equal(invoiceStatusKey('dispatching'), 'processing');
  assert.equal(invoiceStatusKey('issued'), 'issued');
  assert.equal(invoiceStatusKey('unexpected'), 'pending');
});
