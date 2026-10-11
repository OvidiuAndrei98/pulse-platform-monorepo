import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvent } from '../src/data/events';
import { parseEventSocial } from '../src/data/api';
import { checkoutTotals, parseBilling, parseBooking, parseCheckout, parsePromo, validPaidSelection, validSelection } from '../src/checkout/data';
import { checkoutRequestKey } from '../../pulse-app/src/features/checkout/requestKey';
import { emptyInvoiceDetails, getInvoiceFieldErrors, invoiceFieldLimits, validateInvoiceDetails } from '../../pulse-app/src/features/checkout/invoiceDetails';
import { nativeCheckoutReturn } from '../../pulse-app/src/features/checkout/nativeReturn';
import { checkPaymentConfirmation } from '../../pulse-app/src/features/checkout/confirmation';

const id = (n = 1) => `12345678-abcd-abcd-abcd-${String(n).padStart(12, '0')}`;
const now = Date.parse('2026-10-08T12:00:00Z');
const event = () => normalizeEvent({ id: id(), organizerId: id(2), startTime: '2026-10-09T12:00:00Z', endTime: '2026-10-10T02:00:00Z', ticketTypes: [{ id: id(3), name: 'General', priceRon: 50, capacity: 10, ticketsSold: 2, startSales: '2026-01-01T00:00:00Z', endSales: '2026-10-10T02:00:00Z' }] })!;
const billing = () => ({ ...emptyInvoiceDetails('Test Person'), address: 'Strada Test 1', city: 'București', county: 'Bucuresti', sector: 'Sector 3' });

test('checkout rejects empty, unavailable, fractional, oversized, stale and own-event selections', () => {
  const value = event();
  assert.equal(validPaidSelection(value, { [id(3)]: 1 }, undefined, now), true);
  assert.equal(validPaidSelection(value, { [id(3)]: 8 }, undefined, now), true);
  for (const quantities of [{}, { nope: 1 }, { [id(3)]: 0 }, { [id(3)]: -1 }, { [id(3)]: 1.5 }, { [id(3)]: 9 }, { [id(3)]: NaN }]) assert.equal(validPaidSelection(value, quantities, undefined, now), false);
  assert.equal(validPaidSelection(value, { [id(3)]: 1 }, id(2), now), false);
  value.ticketTypes[0]!.ticketsSold = 10;
  assert.equal(validPaidSelection(value, { [id(3)]: 1 }, undefined, now), false);
  value.ticketTypes[0]!.ticketsSold = 0; value.ticketTypes[0]!.startSales = new Date(now + 1).toISOString();
  assert.equal(validPaidSelection(value, { [id(3)]: 1 }, undefined, now), false);
  assert.equal(validPaidSelection(event(), { [id(3)]: 1 }, undefined, Date.parse(event().endTime)), false);
});
test('direct checkout links cannot turn free or externally sold tickets into paid orders', () => {
  const value = event(); value.ticketTypes[0]!.priceRon = 0;
  assert.equal(validSelection(value, { [id(3)]: 1 }, undefined, now), true);
  assert.equal(validPaidSelection(value, { [id(3)]: 1 }, undefined, now), false);
  value.ticketTypes[0]!.priceRon = 50; value.externalTicketUrl = 'https://example.test/tickets';
  assert.equal(validPaidSelection(value, { [id(3)]: 1 }, undefined, now), false);
});
test('same prices as web: per-ticket discount rounding, service fees and organizer-covered fees', () => {
  const value = event();
  assert.equal(checkoutTotals(value, { [id(3)]: 2 }).total, 109);
  const discounted = checkoutTotals(value, { [id(3)]: 2 }, 15);
  assert.equal(discounted.subtotal, 100); assert.equal(discounted.discount, 14);
  assert.equal(discounted.fee, 8.44); assert.equal(discounted.total, 94.44);
  value.organizerAbsorbsServiceFee = true;
  assert.equal(checkoutTotals(value, { [id(3)]: 2 }, 15).total, 86);
  assert.equal(checkoutTotals(value, { [id(3)]: 1 }, 100).total, 1);
});
test('billing validates canonical Bucharest sectors, company fields and UTF-8 backend limits', () => {
  assert.equal(validateInvoiceDetails(billing()), null);
  for (const sector of ['', '1', 'Sector 0', 'Sector 7']) assert.ok(getInvoiceFieldErrors({ ...billing(), sector }).sector);
  for (let n = 1; n <= 6; n++) assert.equal(validateInvoiceDetails({ ...billing(), sector: `Sector ${n}` }), null);
  assert.ok(getInvoiceFieldErrors({ ...billing(), type: 'company' }).taxId);
  assert.ok(getInvoiceFieldErrors({ ...billing(), city: 'Cluj', county: '' }).county);
  for (const [field, limit] of Object.entries(invoiceFieldLimits).filter(([key]) => !['type', 'sector'].includes(key))) {
    const details = { ...billing(), type: 'company' as const, taxId: 'RO123', [field]: 'a'.repeat(limit + 1) };
    assert.ok(getInvoiceFieldErrors(details)[field as keyof typeof details], field);
  }
  assert.ok(getInvoiceFieldErrors({ ...billing(), name: 'Ș'.repeat(101) }).name);
  assert.equal(parseBilling(null), null); assert.deepEqual(parseBilling(billing()), billing());
  for (const value of [{}, [], 'bad', { ...billing(), name: null }]) assert.throws(() => parseBilling(value));
});
test('checkout responses and callbacks reject missing session IDs, arbitrary URLs and malformed data', () => {
  const response = { orderId: id(5), sessionId: 'cs_test_local', checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_local' };
  assert.deepEqual(parseCheckout(response, 'https://spottr.ro'), response);
  for (const value of [null, {}, { ...response, sessionId: undefined }, { ...response, checkoutUrl: 'https://evil.test' }, { ...response, checkoutUrl: 'https://user:pass@checkout.stripe.com/pay' }]) assert.throws(() => parseCheckout(value, 'https://spottr.ro'));
  assert.equal(nativeCheckoutReturn(new URLSearchParams({ event_id: id(), session_id: 'cs_test_local', redirect: 'https://evil.test' })), `spottr-native://checkout/return?eventId=${id()}&sessionId=cs_test_local`);
  assert.equal(nativeCheckoutReturn(new URLSearchParams({ event_id: id(), cancelled: '1' })), `spottr-native://checkout/return?eventId=${id()}&cancelled=1`);
  for (const value of [{}, { event_id: id(), session_id: '' }, { event_id: 'bad', session_id: 'cs_valid' }] as Record<string, string>[]) assert.equal(nativeCheckoutReturn(new URLSearchParams(value)), null);
});
test('idempotency reuses one intent, but changes for quantity, account or event changes', () => {
  let calls = 0;
  const random = () => new Uint8Array(16).fill(++calls);
  const first = checkoutRequestKey(null, 'event1:user1:qty1', random);
  assert.equal(checkoutRequestKey(first, first.payload, random), first); assert.equal(calls, 1);
  for (const payload of ['event1:user1:qty2', 'event1:user2:qty1', 'event2:user1:qty1']) assert.notEqual(checkoutRequestKey(first, payload, random).key, first.key);
  assert.match(first.key, /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/);
});
test('free booking and RSVP parse authoritative responses without inventing successful state', () => {
  for (const value of [null, {}, { orderId: id() }, { orderId: 'bad', alreadyBooked: false }]) assert.throws(() => parseBooking(value));
  assert.equal(parseBooking({ orderId: id(), alreadyBooked: true }).alreadyBooked, true);
  assert.equal(parseEventSocial({ ticketsSoldCount: 10, manualGoingCount: 3, goingCount: 99, currentUserStatus: 'has_ticket' }).goingCount, 13);
  assert.equal(parseEventSocial({ currentUserStatus: 'admin', interestedCount: null }).currentUserStatus, null);
  for (const value of [null, {}, { code: 'X', discountPercent: 10 }, { code: 'PROMO', discountPercent: 101 }]) assert.throws(() => parsePromo(value));
});
test('browser closure or a transient error never becomes payment confirmation', async () => {
  const pause = async () => {};
  assert.equal(await checkPaymentConfirmation(async () => ({ status: 'pending' }), () => true, pause), 'pending');
  assert.equal(await checkPaymentConfirmation(async () => { throw new Error('offline'); }, () => true, pause), 'unavailable');
  let n = 0;
  assert.equal(await checkPaymentConfirmation(async () => ({ status: ++n === 3 ? 'completed' : 'pending' }), () => true, pause), 'completed');
  let active = true;
  assert.equal(await checkPaymentConfirmation(async () => { active = false; return { status: 'completed' }; }, () => active, pause), null);
});
