import type { components } from '@packages/api-client/src/schema';
import { ApiError, type createHttp } from '../data/http';

type Schema = components['schemas'];
export type OrganizerReview = Schema['OrganizerVerificationRequest'];
export type Cancellation = Schema['EventCancellationRequestResponse'];
export type Refund = Schema['RefundAttentionResponse'];
export type PromotionInvoice = Schema['PromotionInvoiceAttentionResponse'];
export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type CancellationAction = 'retain' | 'refund' | 'reject' | 'retry';
export type StripeStatus = 'active' | 'onboarding' | 'attention' | 'notConnected';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function id(value: string) { if (!uuid.test(value)) throw new Error('INVALID_ADMIN_ID'); return value.toLowerCase(); }
function record(value: unknown) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_ADMIN_RESPONSE'); return value as Record<string, unknown>; }
function requireStrings(row: Record<string, unknown>, keys: string[]) { if (keys.some(key => typeof row[key] !== 'string')) throw new Error('INVALID_ADMIN_RESPONSE'); }
function requireDates(row: Record<string, unknown>, keys: string[]) { for (const key of keys) if (typeof row[key] !== 'string' || !Number.isFinite(Date.parse(row[key] as string))) throw new Error('INVALID_ADMIN_RESPONSE'); }
function requireMoney(row: Record<string, unknown>, keys: string[], optional = false) { for (const key of keys) { if (optional && row[key] === undefined) continue; if (typeof row[key] !== 'number' || !Number.isFinite(row[key]) || (row[key] as number) < 0) throw new Error('INVALID_ADMIN_RESPONSE'); } }
export function adminList<T>(value: unknown, validate: (row: Record<string, unknown>) => void): T[] {
  if (value === null) return []; if (!Array.isArray(value)) throw new Error('INVALID_ADMIN_RESPONSE');
  return value.map(value => { const row = record(value); validate(row); return row as T; });
}
export function parseOrganizers(value: unknown): OrganizerReview[] { return adminList(value, row => {
  requireStrings(row, ['userId', 'username', 'email', 'cui', 'companyName']); id(row.userId as string);
  requireDates(row, ['submittedAt', 'updatedAt']);
  if (!['pending', 'approved', 'rejected'].includes(String(row.verificationStatus)) || ['stripeDetailsSubmitted', 'stripeChargesEnabled', 'stripePayoutsEnabled'].some(key => typeof row[key] !== 'boolean')) throw new Error('INVALID_ADMIN_RESPONSE');
}); }
export function parseCancellations(value: unknown): Cancellation[] { return adminList(value, row => {
  requireStrings(row, ['id', 'eventId', 'organizerId', 'reason', 'previousEventStatus']); id(row.id as string); id(row.eventId as string); id(row.organizerId as string);
  requireDates(row, ['createdAt', 'updatedAt']); requireMoney(row, ['orderCount', 'ticketCount', 'customerTotalBani', 'platformFeeBani', 'alreadyRefundedBani', 'succeededRefunds', 'pendingRefunds', 'failedRefunds'], true);
  if (!['pending', 'refunding', 'completed', 'rejected', 'failed'].includes(String(row.status))) throw new Error('INVALID_ADMIN_RESPONSE');
}); }
export function parseRefunds(value: unknown): Refund[] { return adminList(value, row => {
  requireStrings(row, ['orderId', 'eventId', 'eventTitle', 'organizerId', 'buyerEmail']); id(row.orderId as string); id(row.eventId as string); id(row.organizerId as string);
  requireDates(row, ['purchasedAt', 'updatedAt']); requireMoney(row, ['customerTotalBani', 'refundedAmountBani', 'remainingAmountBani', 'platformFeeBani', 'ticketCount']);
  if (!['none', 'pending', 'partial', 'succeeded', 'failed', 'requires_action'].includes(String(row.stripeRefundStatus)) || typeof row.stripeLivemode !== 'boolean') throw new Error('INVALID_ADMIN_RESPONSE');
}); }
export function parsePromotionInvoices(value: unknown): PromotionInvoice[] { return adminList(value, row => {
  requireStrings(row, ['id', 'campaignId', 'eventTitle', 'organizerId', 'customerEmail', 'reason']); id(row.id as string); id(row.campaignId as string); id(row.organizerId as string);
  requireDates(row, ['createdAt', 'updatedAt']); requireMoney(row, ['amountRon', 'refundedAmountRon']);
}); }
export function stripeStatus(row: Pick<OrganizerReview, 'stripeAccountId' | 'stripeDetailsSubmitted' | 'stripeChargesEnabled' | 'stripePayoutsEnabled'>): StripeStatus {
  if (!row.stripeAccountId) return 'notConnected';
  if (!row.stripeDetailsSubmitted) return 'onboarding';
  return row.stripeChargesEnabled && row.stripePayoutsEnabled ? 'active' : 'attention';
}
export function organizerCounts(rows: OrganizerReview[]) {
  const counts = { all: rows.length, pending: 0, approved: 0, rejected: 0 }, stripe = { active: 0, onboarding: 0, attention: 0, notConnected: 0 };
  for (const row of rows) { counts[row.verificationStatus]++; stripe[stripeStatus(row)]++; }
  return { counts, stripe };
}
export function canReviewCancellation(request: Pick<Cancellation, 'status' | 'failedRefunds'>, action: CancellationAction) {
  return action === 'retry' ? (request.failedRefunds ?? 0) > 0 && ['failed', 'refunding', 'completed'].includes(request.status) : request.status === 'pending';
}
export function createAdminApi(request: ReturnType<typeof createHttp>, session: () => { token: string | null; role?: string }) {
  const token = () => { const access = session(); if (!access.token || access.role !== 'admin') throw new ApiError(403, 'ADMIN_REQUIRED'); return access.token; };
  return {
    organizers: async (signal?: AbortSignal) => parseOrganizers(await request('/admin/organizers', { token: token(), signal })),
    cancellations: async (signal?: AbortSignal) => parseCancellations(await request('/admin/event-cancellations', { token: token(), signal })),
    refunds: async (signal?: AbortSignal) => parseRefunds(await request('/admin/refunds-attention', { token: token(), signal })),
    promotionInvoices: async (signal?: AbortSignal) => parsePromotionInvoices(await request('/admin/promotion-invoices-attention', { token: token(), signal })),
    review: async (userId: string, status: 'approved' | 'rejected') => { const auth = token(); if (!['approved', 'rejected'].includes(status)) throw new Error('INVALID_REVIEW'); const response = record(await request('/admin/organizers/' + id(userId) + '/verification', { method: 'PATCH', token: auth, body: { status } })); if (response.verificationStatus !== status) throw new Error('UNEXPECTED_REVIEW_RESULT'); },
    cancellation: async (target: Pick<Cancellation, 'id' | 'status' | 'failedRefunds'>, action: CancellationAction, note = '') => {
      const auth = token(); if (!['retain', 'refund', 'reject', 'retry'].includes(action) || !canReviewCancellation(target, action) || note.length > 2000) throw new Error('INVALID_CANCELLATION_REVIEW');
      return request('/admin/event-cancellations/' + id(target.id) + '/' + (action === 'retry' || action === 'reject' ? action : 'approve'), { method: 'POST', token: auth, body: action === 'retry' ? undefined : { ...(action === 'reject' ? {} : { feePolicy: action }), adminNote: note.trim() || undefined } });
    },
    reconcile: async (orderId: string) => {
      const result = record(await request('/admin/refunds-attention/' + id(orderId) + '/reconcile', { method: 'POST', token: token() }));
      if (typeof result.requiresAttention !== 'boolean') throw new Error('INVALID_ADMIN_RESPONSE'); return { requiresAttention: result.requiresAttention };
    },
  };
}
