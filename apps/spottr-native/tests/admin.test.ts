import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttp, ApiError } from '../src/data/http';
import { canReviewCancellation, createAdminApi, organizerCounts, parseCancellations, parseOrganizers, parsePromotionInvoices, parseRefunds, stripeStatus } from '../src/admin/data';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const date = '2026-10-10T18:00:00Z';
const organizer = (patch = {}) => ({ userId: id(1), username: 'Organizer', email: 'org@example.test', cui: '123456', companyName: 'Club SRL', verificationStatus: 'pending', submittedAt: date, updatedAt: date, stripeDetailsSubmitted: false, stripeChargesEnabled: false, stripePayoutsEnabled: false, ...patch });
const cancellation = (patch = {}) => ({ id: id(2), eventId: id(3), organizerId: id(1), reason: 'Cancelled', previousEventStatus: 'published', status: 'pending', createdAt: date, updatedAt: date, ...patch });
test('admin lists accept null/empty but reject malformed accounts and invalid status/date', () => {
  assert.deepEqual(parseOrganizers(null), []); assert.deepEqual(parseOrganizers([]), []);
  assert.equal(parseOrganizers([organizer()]).length, 1);
  for (const value of [undefined, {}, [null], [organizer({ userId: '../admin' })], [organizer({ stripeDetailsSubmitted: null })], [organizer({ verificationStatus: 'unknown' })], [organizer({ submittedAt: '' })]]) assert.throws(() => parseOrganizers(value));
});
test('Stripe buckets and verification counts exactly match original Next logic', () => {
  const rows = parseOrganizers([organizer(), organizer({ userId: id(2), stripeAccountId: 'acct_1', verificationStatus: 'rejected' }), organizer({ userId: id(3), stripeAccountId: 'acct_2', stripeDetailsSubmitted: true, stripeChargesEnabled: true, stripePayoutsEnabled: true, verificationStatus: 'approved' }), organizer({ userId: id(4), stripeAccountId: 'acct_3', stripeDetailsSubmitted: true, stripeChargesEnabled: true })]);
  assert.deepEqual(rows.map(stripeStatus), ['notConnected', 'onboarding', 'active', 'attention']);
  assert.deepEqual(organizerCounts(rows), { counts: { all: 4, pending: 2, approved: 1, rejected: 1 }, stripe: { active: 1, onboarding: 1, attention: 1, notConnected: 1 } });
});
test('financial lists reject nonfinite/negative amounts before they reach review controls', () => {
  assert.equal(parseCancellations([cancellation()]).length, 1);
  for (const patch of [{ status: 'unknown' }, { customerTotalBani: -1 }, { failedRefunds: '5' }, { platformFeeBani: Infinity }]) assert.throws(() => parseCancellations([cancellation(patch)]));
  const refund = { orderId: id(1), eventId: id(2), eventTitle: 'Event', organizerId: id(3), buyerEmail: 'buyer@example.test', customerTotalBani: 10000, refundedAmountBani: 5000, remainingAmountBani: 5000, platformFeeBani: 500, ticketCount: 2, stripeRefundStatus: 'partial', stripeLivemode: false, purchasedAt: date, updatedAt: date };
  assert.equal(parseRefunds([refund])[0]?.remainingAmountBani, 5000);
  assert.throws(() => parseRefunds([{ ...refund, customerTotalBani: NaN }]));
  assert.throws(() => parseRefunds([{ ...refund, stripeRefundStatus: 'unknown' }]));
  const promo = { id: id(1), campaignId: id(2), eventTitle: 'Event', organizerId: id(3), customerEmail: 'org@example.test', reason: 'Partial refund', amountRon: 100.55, refundedAmountRon: 20.5, createdAt: date, updatedAt: date };
  assert.equal(parsePromotionInvoices([promo])[0]?.amountRon, 100.55); assert.throws(() => parsePromotionInvoices([{ ...promo, refundedAmountRon: null }]));
});
test('admin operations fail before any network request after role loss or logout', async () => {
  let access: { role?: string; token: string | null } = { role: 'user', token: 'user-token' }, calls = 0;
  const api = createAdminApi(createHttp('https://mock', async () => { calls++; return new Response('[]'); }), () => access);
  await assert.rejects(api.organizers(), (e: unknown) => e instanceof ApiError && e.status === 403);
  await assert.rejects(api.review(id(1), 'approved'));
  access = { role: 'admin', token: null }; await assert.rejects(api.cancellations());
  access = { role: 'organizer', token: 'org' }; await assert.rejects(api.reconcile(id(1)));
  assert.equal(calls, 0);
});
test('verification uses PATCH with selected decision and authenticated request', async () => {
  let seen: { input: string; options?: RequestInit } | undefined;
  const api = createAdminApi(createHttp('https://mock/api/v1', async (input, options) => { seen = { input: String(input), options }; return new Response(JSON.stringify({ verificationStatus: 'approved' })); }), () => ({ role: 'admin', token: 'admin-token' }));
  await api.review(id(1), 'approved');
  assert.equal(seen?.input, `https://mock/api/v1/admin/organizers/${id(1)}/verification`); assert.equal(seen?.options?.method, 'PATCH');
  assert.deepEqual(JSON.parse(String(seen?.options?.body)), { status: 'approved' });
  assert.equal(new Headers(seen?.options?.headers).get('Authorization'), 'Bearer admin-token');
  await assert.rejects(api.review(id(1), 'rejected'), /UNEXPECTED_REVIEW_RESULT/);
  await assert.rejects(api.review('../bad', 'approved'), /INVALID_ADMIN_ID/);
});
test('cancellation action preserves fee policy and rejects invalid/stale or oversized requests', async () => {
  const sent: { path: string; body: unknown }[] = [];
  const api = createAdminApi(createHttp('https://mock', async (input, options) => { sent.push({ path: String(input), body: options?.body ? JSON.parse(String(options.body)) : undefined }); return new Response(null, { status: 204 }); }), () => ({ role: 'admin', token: 'admin-token' }));
  const target = parseCancellations([cancellation()])[0]!;
  await api.cancellation(target, 'retain', ' note '); await api.cancellation(target, 'refund'); await api.cancellation(target, 'reject', 'reason');
  assert.deepEqual(sent.map(row => row.body), [{ feePolicy: 'retain', adminNote: 'note' }, { feePolicy: 'refund' }, { adminNote: 'reason' }]);
  assert.match(sent[0]!.path, /\/approve$/); assert.match(sent[2]!.path, /\/reject$/);
  await assert.rejects(api.cancellation({ ...target, status: 'completed' }, 'refund'));
  await assert.rejects(api.cancellation(target, 'retry'));
  await assert.rejects(api.cancellation(target, 'retain', 'x'.repeat(2001)));
  await api.cancellation({ ...target, status: 'failed', failedRefunds: 2 }, 'retry'); assert.match(sent[3]!.path, /\/retry$/); assert.equal(sent[3]!.body, undefined);
});
test('retry availability and reconciliation never invent a financial success', async () => {
  assert.equal(canReviewCancellation({ status: 'pending' }, 'retain'), true);
  assert.equal(canReviewCancellation({ status: 'failed', failedRefunds: 0 }, 'retry'), false);
  assert.equal(canReviewCancellation({ status: 'refunding', failedRefunds: 2 }, 'retry'), true);
  const api = createAdminApi(createHttp('https://mock', async () => new Response(JSON.stringify({ requiresAttention: true }))), () => ({ role: 'admin', token: 'a' }));
  assert.equal((await api.reconcile(id(1))).requiresAttention, true);
  const bad = createAdminApi(createHttp('https://mock', async () => new Response('{}')), () => ({ role: 'admin', token: 'a' }));
  await assert.rejects(bad.reconcile(id(1)), /INVALID_ADMIN_RESPONSE/);
});
test('admin list honors abort and API permission errors without an empty-success fallback', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  const api = createAdminApi(createHttp('https://mock', async (_input, options) => { calls++; if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError'); return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }); }), () => ({ role: 'admin', token: 'admin' }));
  await assert.rejects(api.organizers(controller.signal), { name: 'AbortError' });
  await assert.rejects(api.refunds(), (e: unknown) => e instanceof ApiError && e.status === 403);
  assert.equal(calls, 2);
});
